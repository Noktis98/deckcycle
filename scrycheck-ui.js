/* DeckCycle — ScryCheck results for imported Commander lists.
 * API key is NEVER used in the browser. Access code is optional-session-only.
 * Every fresh analysis becomes a public ScryCheck page, only after confirmation.
 */
(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const store=()=>window.DeckCycleArchive;
  const ENDPOINT='./api/scrycheck';
  const CODE_KEY='deckcycle_scrycheck_access_session';
  const VECTORS=[
    ['velocity','Velocità'],['consistency','Consistenza'],
    ['interaction','Interazione'],['efficiency','Efficienza'],['lethality','Chiusura']
  ];
  let deck=null, list=null, saved=null, loading=false, epoch=0, message='', error=false;

  function esc(value){
    return String(value??'').replace(/[&<>"']/g,
      x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
  }
  function hashList(entries, commander) {
    // Signature used ONLY to recognize an edited list, never for security.
    const values=entries.map(e=>[
      String(e.section||'Deck')==='Commander'?'C':'D',
      String(e.name||'').trim().toLowerCase().normalize('NFKC'),
      Number(e.quantity)||1
    ]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
    const str=JSON.stringify([values,String(commander||'').trim().toLowerCase().normalize('NFKC')]);
    let h=2166136261;
    for(let i=0;i<str.length;i++){
      h^=str.charCodeAt(i);
      h=Math.imul(h,16777619);
    }
    return 'v1:'+('00000000'+(h>>>0).toString(16)).slice(-8)+':'+str.length;
  }
  function validSaved(){
    return saved && list && list.entries?.length &&
      saved.signature===hashList(list.entries,deck?.commander);
  }
  function setMessage(txt, isError=false){
    message=txt;error=isError;
    $('scryStatus').textContent=txt;
    $('scryStatus').classList.toggle('archiveError',isError);
  }
  function anySavedData(){
    return !!saved?.data?.deckHash;
  }
  function render(){
    const exists=!!list?.entries?.length;
    const same=!!validSaved();
    const usable=exists&&String(deck?.format||'Commander').toLowerCase()==='commander';
    $('scryAnalyzeBtn').disabled=loading||!usable;
    $('scryReloadBtn').disabled=loading||!same||!anySavedData();
    $('scryAccessCode').disabled=loading;
    $('scryAnalyzeBtn').textContent=loading?'Sto interrogando ScryCheck…':
      same?'Rianalizza questa lista':'🧪 Analizza con ScryCheck';
    $('scryReloadBtn').classList.toggle('hide',!same);
    if(!exists) {
      $('scryResults').innerHTML='<p class="note">Per iniziare, incolla e salva la lista del mazzo in formato Moxfield.</p>';
      if(!loading)setMessage('Nessuna lista salvata. Prima importa le carte.',false);
      return;
    }
    if(!usable){
      $('scryResults').innerHTML='<p class="note">ScryCheck analizza mazzi Commander: modifica il formato della scheda per proseguire.</p>';
      return;
    }
    if(!anySavedData()){
      $('scryResults').innerHTML='<p class="note">La tua lista è pronta. Premi Analizza con ScryCheck per ottenere Power Level, bracket e altre statistiche.</p>';
      if(!loading)setMessage('Prima analisi non ancora effettuata.');
      return;
    }
    const d=saved.data;
    const p=d.powerLevel||{},b=d.bracket||{},w=d.winSpeed||{};
    const good=!!same;
    const power=p.display??p.level??'—';
    const bracket=b.number??'—';
    const win=(w.display||w.range||(w.typical?'Turno '+w.typical:'Non stimata'));
    const interval=p.interval&&Number.isFinite(Number(p.interval.low))&&Number.isFinite(Number(p.interval.high))?
      ' ('+esc(p.interval.low)+'–'+esc(p.interval.high)+')':'';
    let output='';
    if(!good) output+='<div class="scryNotice">⚠️ Questa analisi appartiene a una versione precedente della lista. Rianalizza le carte aggiornate.</div>';
    if(d.incomplete)output+='<div class="scryNotice">⚠️ Analisi incompleta: meno di 95 carte riconosciute. Le stime potrebbero essere meno affidabili.</div>';
    output+='<div class="scrySummary">'+
      '<div class="scryStat"><span>Power Level</span><strong>'+esc(power)+'</strong><small>'+esc(p.tier||p.label||'')+interval+'</small></div>'+
      '<div class="scryStat"><span>Bracket stimato</span><strong>'+esc(bracket)+'</strong><small>'+esc(b.name||'')+'</small></div>'+
      '<div class="scryStat"><span>Velocità di vittoria</span><strong class="scryWinText">'+esc(win)+'</strong><small>Stima, non garanzia</small></div></div>';
    if(d.vectors&&typeof d.vectors==='object') {
      output+='<div class="archiveHeading">Indicatori ScryCheck (0–100)</div><div class="scryVectors">';
      for(const [key,label] of VECTORS){
        const raw=Number(d.vectors[key]);
        const num=Number.isFinite(raw)?Math.max(0,Math.min(100,raw)):null;
        output+='<div class="scryVector"><span>'+esc(label)+'</span><div class="scryTrack"><div class="scryFill" style="width:'+(num??0)+'%"></div></div><b>'+(num===null?'—':Math.round(num))+'</b></div>';
      }
      output+='</div>';
    }
    const warnings=[...(Array.isArray(d.summary?.warnings)?d.summary.warnings:[]),
      ...(Array.isArray(d.importWarnings)?d.importWarnings:[])];
    if(warnings.length){
      output+='<div class="archiveHeading">Avvisi dell’analisi</div><ul class="scryWarnings">'+
        warnings.slice(0,8).map(item=>{
          const content=typeof item==='string'?item:(item?.message||item?.label||item?.code||'Avviso');
          return '<li>'+esc(content)+'</li>';
        }).join('')+'</ul>';
    }
    const themes=Array.isArray(d.summary?.themes)?d.summary.themes.slice(0,8):[];
    if(themes.length) output+='<div class="archiveHeading">Strategie individuate</div><div class="scryThemes">'+
      themes.map(t=>'<span class="tag">'+esc(typeof t==='string'?t:(t?.name||t?.label||'Tema'))+'</span>').join('')+'</div>';
    const detail=String(d.deckUrl||'');
    if(/^https:\/\/scrycheck\.com\/deck\/[a-f0-9]{16,64}\/?$/i.test(detail))
      output+='<a class="scryLink" href="'+esc(detail)+'" target="_blank" rel="noopener noreferrer">Apri l’analisi completa su ScryCheck ↗</a>';
    output+='<p class="note">Dati di ScryCheck · '+esc(saved.at?.slice(0,10)||'')+
      (d.scoringVersion?' · Metodo '+esc(d.scoringVersion):'')+
      '. Valutazioni indicative, non bracket ufficiali.</p>';
    $('scryResults').innerHTML=output;
    if(!loading) setMessage(good?'Risultato salvato per questa lista. Puoi rileggerlo senza consumare una nuova analisi.':
      'La lista è cambiata: l’analisi precedente non rappresenta più il mazzo attuale.',!good);
  }
  function getCode(){
    let typed=$('scryAccessCode').value.trim();
    if(typed) return typed;
    try{return sessionStorage.getItem(CODE_KEY)||''}catch(e){return ''}
  }
  function rememberCode(code){
    // Solo per questa sessione; NON viene inserito nei mazzi né nei backup JSON.
    try{sessionStorage.setItem(CODE_KEY,code)}catch(e){}
  }
  async function callApi(method, body, code){
    const controller=new AbortController();
    const time=setTimeout(()=>controller.abort(),50000);
    try{
      const url=method==='GET'?ENDPOINT+'?deckHash='+encodeURIComponent(body):ENDPOINT;
      const response=await fetch(url,{
        method,
        headers:{
          'Accept':'application/json',
          'X-DeckCycle-Access-Code':code,
          ...(method==='POST'?{'Content-Type':'application/json'}:{})
        },
        ...(method==='POST'?{body:JSON.stringify(body)}:{}),
        signal:controller.signal,
        cache:'no-store',
        credentials:'same-origin'
      });
      let payload;
      try{payload=await response.json()}catch(e){
        throw new Error('Il server Netlify non ha risposto correttamente. Verifica il deploy e la funzione ScryCheck.');
      }
      if(!response.ok || !payload?.success){
        const code=payload?.error?.code||'';
        const messages={
          NOT_CONFIGURED:'ScryCheck non ancora configurato su Netlify: servono SCRYCHECK_API_KEY e SCRYCHECK_ACCESS_CODE.',
          ACCESS_DENIED:'Codice personale errato. Inserisci il codice impostato su Netlify, NON la chiave API ScryCheck.',
          UNAUTHORIZED:'Chiave API ScryCheck non valida o revocata: controlla le impostazioni riservate Netlify.',
          QUOTA_EXCEEDED:'Quota giornaliera di analisi esaurita. Riprova dopo il prossimo azzeramento.',
          RATE_LIMITED:'Troppe richieste. Attendi prima di riprovare.',
          NOT_ANALYZED:'Nessuna analisi salvata su ScryCheck per questa lista.',
          DECK_NOT_FOUND:'Mazzo non trovato sul sito sorgente o non pubblico.',
          SOURCE_UNAVAILABLE:'Il sito sorgente non è disponibile; riprova più tardi.'
        };
        const msg=messages[code]||String(payload?.error?.message||'Impossibile analizzare il mazzo.');
        const retry=response.headers.get('retry-after');
        const advice=(response.status===429&&retry)?' Riprova tra '+retry+' secondi.':'';
        throw new Error(msg+advice);
      }
      if(!payload.data?.deckHash || !payload.data?.deckUrl) throw new Error('Risposta API senza dati di analisi.');
      return payload.data;
    }finally{clearTimeout(time)}
  }
  function currentCommanders(){
    const direct=(list?.entries||[]).filter(e=>e.section==='Commander').map(e=>e.name).filter(Boolean);
    if(direct.length)return direct.slice(0,4);
    return deck?.commander?[deck.commander.trim()].filter(Boolean):[];
  }
  async function run(fresh){
    if(loading||!deck||!list?.entries?.length)return;
    const id=deck.id, signature=hashList(list.entries,deck.commander);
    if(!fresh && (!validSaved()||!saved?.data?.deckHash))return;
    const code=getCode();
    if(!code)return setMessage('Inserisci il codice personale DeckCycle configurato su Netlify (non la chiave API).',true);
    const total=list.entries.reduce((n,e)=>n+(Number(e.quantity)||0),0);
    if(fresh){
      if(!confirm('Vuoi inviare le '+total+' carte di «'+deck.name+
        '» a ScryCheck?\n\nATTENZIONE: l’analisi e la lista diventeranno PUBBLICHE sul sito ScryCheck. La richiesta potrebbe consumare quota API.'))return;
    }
    const entries=list.entries.map(e=>(Number(e.quantity)||1)+' '+e.name).join('\n');
    const body=fresh ? {
      deckName:String(deck.name||'').slice(0,180),
      commanders:currentCommanders(),
      deckList:entries
    } : saved.data.deckHash;
    if(fresh && entries.length>50000)return setMessage('La lista supera il limite di 50.000 caratteri di ScryCheck.',true);
    loading=true;const currentEpoch=epoch;
    setMessage(fresh?'ScryCheck sta analizzando la lista…':'Recupero del risultato salvato su ScryCheck…');
    render();
    try{
      const data=await callApi(fresh?'POST':'GET',body,code);
      if(currentEpoch!==epoch || deck?.id!==id || !list ||
        hashList(list.entries,deck.commander)!==signature) return;
      const stored=await store().saveScryCheckAnalysis(id,signature,data);
      if(currentEpoch!==epoch || deck?.id!==id) return;
      saved=stored;
      rememberCode(code);
      $('scryAccessCode').value='';
      setMessage(fresh?'Analisi completata e salvata!':'Risultato riletto e aggiornato senza nuova analisi.');
    }catch(e){
      if(currentEpoch===epoch && deck?.id===id) setMessage(e.name==='AbortError'?
        'Tempo di attesa scaduto: controlla se l’analisi è stata salvata su ScryCheck.':
        e.message,true);
    }finally{
      if(currentEpoch===epoch){loading=false;const msg=message,isError=error;render();setMessage(msg,isError);}
    }
  }
  async function open(deckRecord,loaded){
    const token=++epoch;
    deck=deckRecord?{id:deckRecord.id,name:deckRecord.name,
      commander:deckRecord.commander||'',format:deckRecord.format||'Commander'}:null;
    list=loaded||null;saved=null;loading=false;
    $('scryResults').innerHTML='';
    setMessage('Verifico eventuali analisi salvate…');
    render();
    if(!deck)return;
    try{
      const found=await store().getScryCheckAnalysis(deck.id);
      if(epoch!==token || deck.id!==deckRecord.id)return;
      saved=found||null;render();
    }catch(e){
      if(epoch===token)setMessage('Impossibile leggere il risultato salvato: '+e.message,true);
    }
  }
  async function updated(loaded){
    if(!deck)return;
    list=loaded||null;
    render(); // un vecchio risultato viene marcato come non aggiornato
  }
  function close(){epoch++;deck=null;list=null;saved=null;loading=false;}
  function init(){
    $('scryAnalyzeBtn').addEventListener('click',()=>run(true));
    $('scryReloadBtn').addEventListener('click',()=>run(false));
    $('scryAccessCode').addEventListener('change',()=>setMessage('Codice pronto. Rimane solo in questa sessione.',false));
    try{if(sessionStorage.getItem(CODE_KEY))$('scryAccessCode').placeholder='Codice già salvato per questa sessione';}catch(e){}
    render();
  }
  window.DeckCycleScryCheck={init,open,updated,close,hashList};
})();
