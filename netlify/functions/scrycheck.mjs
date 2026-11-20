// ScryCheck proxy for DeckCycle (Netlify Functions / Node 18+).
// The production key belongs ONLY in Netlify environment variables.
// Never use this function as a public, unrestricted API resale service.
const ENDPOINT = 'https://scrycheck.com/api/v1';
const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store, private',
  'X-Content-Type-Options': 'nosniff'
};

function reply(status, payload, extra={}) {
  return new Response(JSON.stringify(payload), { status, headers: { ...JSON_HEADERS, ...extra } });
}
function error(status, code, message, requestId) {
  return reply(status, { success:false, error:{ code, message, ...(requestId?{requestId}:{}) } });
}
function validDeckUrl(input) {
  if (typeof input !== 'string' || input.length > 500) return false;
  try {
    const url = new URL(input);
    const host = url.hostname.toLowerCase();
    const allowed = ['moxfield.com','www.moxfield.com','archidekt.com','www.archidekt.com'];
    return url.protocol === 'https:' && allowed.includes(host) &&
      url.username === '' && url.password === '' && url.pathname.length > 2;
  } catch { return false; }
}
function normalizeInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const url = typeof value.url === 'string' ? value.url.trim() : '';
  const deckList = typeof value.deckList === 'string' ? value.deckList.trim() : '';
  if (!!url === !!deckList) return null;
  const mode = value.mode === undefined ? 'fresh' : value.mode;
  if (mode !== 'fresh' && mode !== 'cached') return null;
  if (url) {
    if (!validDeckUrl(url)) return null;
    return { url, ...(mode === 'cached' ? {mode:'cached'} : {}) };
  }
  if (mode !== 'fresh' || deckList.length === 0 || deckList.length > 50000 ||
      deckList.split('\n').length > 600) return null;
  const deckName = typeof value.deckName === 'string' ? value.deckName.trim() : '';
  const commanders = value.commanders;
  if (deckName.length > 180 || !Array.isArray(commanders) || commanders.length > 4 ||
      commanders.some(name=>typeof name !== 'string' || !name.trim() || name.length > 220)) return null;
  return {
    deckList,
    ...(deckName ? { deckName } : {}),
    commanders: commanders.map(x=>x.trim())
  };
}
function filterResponse(body) {
  if (!body || body.success !== true || !body.data || typeof body.data !== 'object') return null;
  const data = body.data;
  const fields = [
    'deckHash', 'deckUrl', 'name', 'commanders', 'source', 'sourceUrl',
    'powerLevel', 'bracket', 'winSpeed', 'vectors', 'summary',
    'totalCardCount', 'uniqueCardCount', 'incomplete', 'importWarnings',
    'scoringVersion', 'cache', 'freshness', 'previousDeckHash'
  ];
  return {
    success: true,
    data: Object.fromEntries(fields.filter(k=>Object.hasOwn(data,k)).map(k=>[k,data[k]]))
  };
}

export default async function scrycheckProxy(request) {
  if (request.method === 'OPTIONS') return reply(405, {success:false,error:{code:'METHOD_NOT_ALLOWED',message:'Metodo non disponibile.'}});
  if (!['GET','POST'].includes(request.method)) return error(405,'METHOD_NOT_ALLOWED','Metodo non disponibile.');
  // Same-origin browser calls only: never issue permissive CORS headers.
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    return error(403,'FORBIDDEN','Richiesta da un dominio diverso.');
  }
  const secret = process.env.SCRYCHECK_API_KEY;
  if (!secret) return error(503,'NOT_CONFIGURED','Chiave ScryCheck non ancora configurata su Netlify.');

  let endpoint = ENDPOINT + '/analyze';
  let upstreamMethod = 'POST';
  let input;
  if (request.method === 'GET') {
    const deckHash = new URL(request.url).searchParams.get('deckHash') || '';
    if (!/^[a-f0-9]{16,64}$/i.test(deckHash)) return error(400,'INVALID_REQUEST','Identificativo analisi non valido.');
    endpoint = ENDPOINT + '/decks/' + deckHash.toLowerCase();
    upstreamMethod = 'GET';
  } else {
    let raw;
    try {
      if (Number(request.headers.get('content-length') || 0) > 75000) {
        return error(413,'TOO_LARGE','Richiesta troppo grande.');
      }
      raw = await request.text();
      if (raw.length > 75000) return error(413,'TOO_LARGE','Richiesta troppo grande.');
      input = normalizeInput(JSON.parse(raw));
    } catch { return error(400,'INVALID_REQUEST','JSON non valido.'); }
    if (!input) return error(400,'INVALID_REQUEST','Specificare un URL Moxfield/Archidekt oppure una lista Commander valida.');
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(()=>controller.abort(), 45000);
    let upstream;
    try {
      upstream = await fetch(endpoint, {
        method: upstreamMethod,
        headers: {
          'Authorization': 'Bearer ' + secret,
          'Accept': 'application/json',
          ...(upstreamMethod === 'POST' ? {'Content-Type':'application/json'} : {})
        },
        ...(upstreamMethod === 'POST' ? {body:JSON.stringify(input)} : {}),
        signal:controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }
    const requestId = upstream.headers.get('x-request-id') || undefined;
    let result;
    try { result = await upstream.json(); } catch {
      return error(502,'BAD_UPSTREAM_RESPONSE','Risposta di ScryCheck non leggibile.',requestId);
    }
    const extra = {};
    const retryAfter = upstream.headers.get('retry-after');
    if (retryAfter && /^[0-9]{1,5}$/.test(retryAfter)) extra['Retry-After'] = retryAfter;
    if (!upstream.ok) {
      const code = typeof result?.error?.code === 'string' ? result.error.code : 'UPSTREAM_ERROR';
      const message = typeof result?.error?.message === 'string' ?
        result.error.message.slice(0,250) : 'ScryCheck non disponibile.';
      return reply(upstream.status, {success:false,error:{code,message,...(requestId?{requestId}:{})}},extra);
    }
    const safe = filterResponse(result);
    return safe ? reply(200,safe) : error(502,'BAD_UPSTREAM_RESPONSE','ScryCheck non ha restituito un’analisi valida.',requestId);
  } catch (e) {
    return error(502,'NETWORK_FAILED', e?.name === 'AbortError' ?
      'L’analisi richiede troppo tempo, riprova più tardi.' :
      'Impossibile raggiungere ScryCheck in questo momento.');
  }
}

// Rate limiting is enforced by Netlify per client IP and domain.
// This mitigates abuse but does not provide authentication or a global daily cap.
export const config = {
  path: '/api/scrycheck',
  rateLimit: {
    windowLimit: 6,
    windowSize: 60,
    aggregateBy: ['ip','domain']
  }
};
