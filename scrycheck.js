/* DeckCycle × ScryCheck — official external analysis (opt-in).
   Never store or request the ScryCheck API key in browser code.
   Only the local Netlify Function may authenticate to ScryCheck. */
(function(){
  'use strict';
  const $ = id => document.getElementById(id);
  const endpoint = '/api/scrycheck';
  let deckId = '';
  let running = false;
  let lastSource = 'auto';
  let notice = '';

  const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g,
    ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const safeLink = input => {
    try {
      const url = new URL(input);
      return url.protocol === 'https:' && url.hostname === 'scrycheck.com' &&
        /^\/deck\/[a-f0-9]{16,64}$/i.test(url.pathname) ? url.href : '';
    } catch { return ''; }
  };
  const n = (value, suffix='') =>
    typeof value === 'number' && Number.isFinite(value) ? String(value) + suffix : '—';
  function selectedDeck() {
    const id = $('analysisSelect')?.value || deckId;
    return window.DeckCycleApp?.getDeck(id) || null;
  }
  function status(message, error=false) {
    notice = message;
    $('scrycheckStatus').textContent = message;
    $('scrycheckStatus').classList.toggle('archiveError', !!error);
  }
  function setBusy(value) {
    running = value;
    $('scrycheckAnalyzeBtn').disabled = value;
    $('scrycheckSavedBtn').disabled = value;
    $('scrycheckSource').disabled = value;
    $('scrycheckAnalyzeBtn').textContent = value ? 'Analisi in corso…' : '✨ Analizza con ScryCheck';
  }
  function currentReport(deck) {
    if (!deck?.scrycheck?.reports?.length) return null;
    const version = deck.versionTag || '';
    return deck.scrycheck.reports.find(x => (x.versionTag || '') === version) ||
      deck.scrycheck.reports[0];
  }
  function formatDate(value) {
    try {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? '—' :
        date.toLocaleString('it-IT',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
    } catch { return '—'; }
  }
  function renderReport(deck) {
    const holder = $('scrycheckResult');
    const report = currentReport(deck);
    $('scrycheckSavedBtn').disabled = running ||
      !(report?.deckHash || (/^(https:\/\/)?(www\.)?(moxfield|archidekt)\.com\//i.test(deck?.moxfield || '')));
    if (!deck || !report) {
      holder.innerHTML = '<div class="empty">Nessuna analisi ScryCheck salvata per questo mazzo.</div>';
      return;
    }
    const different = (report.versionTag || '') !== (deck.versionTag || '');
    const power = report.powerLevel || {};
    const bracket = report.bracket || {};
    const win = report.winSpeed || {};
    const vectors = report.vectors || {};
    const keyMap = [['velocity','Velocità'],['consistency','Consistenza'],
      ['interaction','Interazione'],['efficiency','Efficienza'],['lethality','Letalità']];
    const url = safeLink(report.deckUrl);
    const warnings = Array.isArray(report.summary?.warnings) ? report.summary.warnings : [];
    holder.innerHTML =
      (different ? '<p class="scrycheckWarn">⚠️ Analisi di una versione precedente della lista: rivaluta il mazzo dopo le modifiche.</p>' : '') +
      (report.incomplete ? '<p class="scrycheckWarn">⚠️ Analisi incompleta: ScryCheck non ha riconosciuto abbastanza carte.</p>' : '') +
      '<div class="scrycheckMetrics">' +
      '<div><b>' + escape(power.display || n(power.level)) + '</b><span>Power Level</span></div>' +
      '<div><b>' + (bracket.number != null ? 'B' + escape(bracket.number) : '—') + '</b><span>Bracket stimato</span></div>' +
      '<div><b>' + (win.typical != null ? 'T' + escape(win.typical) : '—') + '</b><span>Vittoria tipica</span></div>' +
      '</div><p class="note">Livello ' + escape(power.label || power.tier || '—') +
      (power.interval ? ' · Intervallo ' + escape(power.interval.low) + '–' + escape(power.interval.high) : '') +
      ' · ' + escape(report.totalCardCount ?? '—') + ' carte riconosciute/registrate</p>' +
      '<div class="archiveHeading">Indicatori ScryCheck (0–100)</div>' +
      '<div class="scrycheckVectors">' + keyMap.map(([key,label]) => {
        const val = typeof vectors[key] === 'number' ? Math.max(0,Math.min(100,vectors[key])) : null;
        return '<div class="scrycheckVector"><span>' + label + '</span>' +
          '<div class="scrycheckTrack"><div style="width:' + (val??0) + '%"></div></div>' +
          '<b>' + (val==null?'—':val) + '</b></div>';
      }).join('') + '</div>' +
      '<p class="note">Prima vittoria ' + (win.earliest!=null ? 'T'+escape(win.earliest) : '—') +
      ' · Tipica ' + (win.typical!=null ? 'T'+escape(win.typical) : '—') +
      ' · Con interferenza ' + (win.withDisruption!=null ? 'T'+escape(win.withDisruption) : '—') + '</p>' +
      (warnings.length ? '<div class="archiveHeading">Avvertenze del servizio</div><ul class="note">' +
        warnings.slice(0,6).map(w=>'<li>'+escape(typeof w==='string'?w:(w?.message||w?.label||'Avvertenza'))+'</li>').join('') + '</ul>' : '') +
      '<div class="scrycheckFooter"><span>Analizzato: ' + formatDate(report.analyzedAt) +
      ' · Motore ' + escape(report.scoringVersion || '—') + '</span>' +
      (url ? '<a href="' + escape(url) + '" target="_blank" rel="noopener noreferrer">Analisi completa su ScryCheck</a>' : '') +
      '</div>';
  }
  function renderForDeck(deck) {
    if (!deck || !window.DeckCycleApp) return;
    if (deckId !== deck.id) {
      deckId = deck.id;
      lastSource = 'auto';
      $('scrycheckSource').value = lastSource;
      notice = '';
    }
    renderReport(deck);
    if (!running && !notice) status('Scegli la fonte e premi Analizza. L’analisi verrà pubblicata su ScryCheck.');
    if (!running && notice && $('scrycheckStatus').textContent !== notice) status(notice);
  }
  async function payloadForDeck(deck) {
    const source = $('scrycheckSource').value;
    let localList = null;
    if (source !== 'url') {
      try { localList = await window.DeckCycleArchive.loadDeck(deck.id); }
      catch (error) {
        if (source === 'local') throw Error('Archivio delle liste non disponibile: ' + error.message);
      }
    }
    const useLocal = source === 'local' || (source === 'auto' && localList?.entries?.length);
    if (useLocal) {
      if (!localList?.entries?.length) throw Error('Per analizzare la lista locale, importa prima le carte nella sezione Mazzi → Lista.');
      const lines = localList.entries.map(e=>e.quantity+' '+e.name);
      const deckList = lines.join('\n');
      if (deckList.length > 50000) throw Error('La lista supera il limite ScryCheck di 50.000 caratteri.');
      const commanders = localList.entries.filter(e=>e.section==='Commander')
        .map(e=>e.name).slice(0,4);
      if (!commanders.length && deck.commander) commanders.push(deck.commander);
      return { deckList, deckName: deck.name, commanders, sourceLabel:'Lista DeckCycle' };
    }
    const url = String(deck.moxfield || '').trim();
    if (!/^https:\/\/(www\.)?(moxfield|archidekt)\.com\//i.test(url)) {
      throw Error('Questo mazzo non ha un link pubblico Moxfield/Archidekt valido. Usa Lista DeckCycle oppure inserisci il link nella scheda del mazzo.');
    }
    return { url, sourceLabel:'Link Moxfield/Archidekt' };
  }
  async function apiCall({method='POST',body,hash}) {
    const url = hash ? endpoint + '?deckHash=' + encodeURIComponent(hash) : endpoint;
    let response;
    try {
      response = await fetch(url,{
        method,
        headers:{Accept:'application/json',...(method==='POST'?{'Content-Type':'application/json'}:{})},
        ...(method==='POST'?{body:JSON.stringify(body)}:{}),
        cache:'no-store'
      });
    } catch {
      throw Error('Connessione non disponibile. Riprova quando sei online.');
    }
    let result;
    try { result=await response.json(); } catch {
      throw Error('Risposta Netlify non valida. Verifica che la funzione sia stata distribuita.');
    }
    if (!response.ok || !result?.success) {
      const key = result?.error?.code || '';
      const messages = {
        NOT_CONFIGURED:'La chiave API non è stata ancora inserita nelle variabili riservate di Netlify.',
        UNAUTHORIZED:'La chiave non è valida o è stata revocata. Configura quella nuova su Netlify.',
        NOT_ANALYZED:'Non esiste ancora un’analisi salvata. Premi Analizza per crearla.',
        RATE_LIMITED:'Troppe richieste. Riprova dopo l’intervallo indicato.',
        QUOTA_EXCEEDED:'Quota giornaliera ScryCheck raggiunta. Riprova dopo il reset.',
        DECK_NOT_FOUND:'Il mazzo non è pubblico o il link non è disponibile.',
        SOURCE_UNAVAILABLE:'Moxfield/Archidekt non risponde, riprova più tardi.',
        ANALYSIS_FAILED:'ScryCheck non ha completato l’analisi.'
      };
      const retryAfter = response.headers.get('retry-after');
      throw Error((messages[key] || result?.error?.message || 'Servizio non disponibile.') +
        (retryAfter && /^[0-9]{1,5}$/.test(retryAfter)?' Attendi almeno '+retryAfter+' secondi.':''));
    }
    if (!result.data || typeof result.data !== 'object') throw Error('Analisi senza risultati.');
    return result.data;
  }
  function storeReport(deck,data,sourceLabel,versionTag) {
    const hash = String(data.deckHash || '');
    if (!/^[a-f0-9]{16,64}$/i.test(hash)) throw Error('ScryCheck ha restituito un identificativo non valido.');
    const link=safeLink(data.deckUrl);
    const record = {
      deckHash:hash, deckUrl:link,
      analyzedAt:new Date().toISOString(), sourceLabel,
      versionTag:versionTag || '',
      powerLevel:data.powerLevel || null,
      bracket:data.bracket || null,
      winSpeed:data.winSpeed || null,
      vectors:data.vectors || null,
      summary:data.summary || null,
      totalCardCount:data.totalCardCount,
      uniqueCardCount:data.uniqueCardCount,
      incomplete:!!data.incomplete,
      scoringVersion: String(data.scoringVersion || ''),
      freshness:data.freshness || null,
      cache:data.cache || null
    };
    const before=deck.scrycheck;
    const previous=Array.isArray(before?.reports)?before.reports:[];
    const reports=[record, ...previous.filter(x=>x.deckHash!==hash ||
      x.versionTag!==record.versionTag)].slice(0,20);
    deck.scrycheck={reports};
    if (!window.DeckCycleApp.save()) {
      deck.scrycheck=before;
      throw Error('L’analisi è stata ottenuta ma non riesco a salvarla sul dispositivo. Esporta un backup dei dati.');
    }
    return record;
  }
  async function analyze() {
    if (running) return;
    const deck=selectedDeck();
    if (!deck) return status('Seleziona prima un mazzo.',true);
    if (navigator.onLine === false) return status('È necessaria una connessione Internet.',true);
    let body;
    try { body=await payloadForDeck(deck); }
    catch (err) {return status(err.message,true);}
    // No implicit uploads: analyses and deck lists become publicly accessible.
    if (!confirm('ScryCheck pubblicherà l’analisi e la lista del mazzo su una pagina visibile a chiunque.\n\nVuoi inviare “'+deck.name+'” a ScryCheck?')) return;
    const id=deck.id, version=deck.versionTag || '';
    setBusy(true);status('Invio a ScryCheck e calcolo in corso…');
    try {
      const {sourceLabel,...input} = body;
      const result=await apiCall({body:input});
      const sameDeck=window.DeckCycleApp.getDeck(id);
      if (!sameDeck) throw Error('Il mazzo è stato eliminato durante l’analisi.');
      storeReport(sameDeck,result,sourceLabel,version);
      if(selectedDeck()?.id===id) renderReport(sameDeck);
      status('Analisi ScryCheck completata e salvata sul dispositivo.');
    }catch(err){status(err.message,true)}
    finally{setBusy(false)}
  }
  async function readSaved() {
    if (running) return;
    const deck = selectedDeck();
    if (!deck) return status('Seleziona prima un mazzo.',true);
    const report = currentReport(deck);
    const id=deck.id, version=deck.versionTag || '';
    setBusy(true);status('Recupero dell’analisi salvata senza usare la quota giornaliera…');
    try {
      let result;
      if (report?.deckHash) {
        result=await apiCall({method:'GET',hash:report.deckHash});
      } else {
        const data=await payloadForDeck(deck);
        if (!data.url) throw Error('Per recuperare un risultato senza nuova analisi serve un link pubblico Moxfield/Archidekt o un’analisi già salvata.');
        result=await apiCall({body:{url:data.url,mode:'cached'}});
      }
      const stored=window.DeckCycleApp.getDeck(id);
      if (!stored) throw Error('Il mazzo è stato eliminato.');
      storeReport(stored,result,'Analisi salvata',version);
      if (selectedDeck()?.id===id) renderReport(stored);
      status('Analisi salvata recuperata senza spendere la quota giornaliera.');
    } catch(err){status(err.message,true)}
    finally{setBusy(false)}
  }
  function init() {
    if (!$('scrycheckPanel')) return;
    $('scrycheckAnalyzeBtn').addEventListener('click',analyze);
    $('scrycheckSavedBtn').addEventListener('click',readSaved);
    $('analysisSelect').addEventListener('change',()=>{
      const deck=selectedDeck();
      if(deck)renderForDeck(deck);
    });
    const deck=selectedDeck();
    if(deck)renderForDeck(deck);
  }
  window.DeckCycleScryCheck={init,renderForDeck};
  init();
})();