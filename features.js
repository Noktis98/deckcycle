/* DeckCycle Complete — navigation, artworks, Commander table and analysis.
   Requires DeckCycleArchive and DeckCycleApp. All changes local to this device. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const app = () => window.DeckCycleApp;
  const archive = () => window.DeckCycleArchive;
  const artCache = new Map();
  let activeArtDeckId = null;
  let artResults = [];
  let activeTab = 'play';
  let analysisDeckId = null;
  let opponentRows = 0;
  let drawing = false;

  function clean(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g,
      c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function validImage(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' ? url.href : '';
    } catch (error) { return ''; }
  }
  function artFor(deck) {
    if (!deck) return '';
    return artCache.get(deck.id) || validImage(deck.image || '');
  }
  function artStatus(message, error) {
    $('artStatus').textContent = message;
    $('artStatus').classList.toggle('archiveError', !!error);
  }
  function setTab(tab) {
    activeTab = ['play','decks','games','analysis','settings'].includes(tab) ? tab : 'play';
    document.body.classList.add('deckcycle-tabs');
    document.body.dataset.activeTab = activeTab;
    document.querySelectorAll('[data-tab]').forEach(node => {
      node.classList.toggle('tabActive', node.dataset.tab === activeTab);
    });
    document.querySelectorAll('[data-go-tab]').forEach(node => {
      const current = node.dataset.goTab === activeTab;
      node.classList.toggle('isCurrent', current);
      node.setAttribute('aria-current', current ? 'page' : 'false');
    });
    if (activeTab === 'analysis') renderAnalysis();
    window.scrollTo({ top:0, behavior:'smooth' });
  }

  async function hydrateArtworks() {
    const decks = app().getState().decks;
    for (const deck of decks) {
      if (!deck.customArt) continue;
      try {
        const saved = await archive().loadArtwork(deck.id);
        if (saved && saved.dataUrl) artCache.set(deck.id, saved.dataUrl);
      } catch (error) { /* PWA remains usable without IndexedDB */ }
    }
    app().render();
  }

  function showArtDeck(deck) {
    activeArtDeckId = deck.id;
    $('artTitle').textContent = 'Artwork · ' + deck.commander;
    $('artSearchName').value = deck.commander || deck.name;
    $('artCustomUrl').value = '';
    $('artFile').value = '';
    $('artGallery').innerHTML = '';
    artStatus('Scegli una stampa Scryfall oppure carica un’immagine personalizzata.');
    $('artModal').classList.add('open');
  }
  function closeArt() {
    activeArtDeckId = null;
    $('artModal').classList.remove('open');
  }
  async function prints() {
    const name = $('artSearchName').value.trim();
    if (!name) return artStatus('Inserisci il nome del comandante.', true);
    $('artGallery').innerHTML = '';
    artStatus('Cerco le stampe su Scryfall…');
    try {
      const query = '!"' + name.replace(/"/g,'') + '"';
      const url = 'https://api.scryfall.com/cards/search?q=' +
        encodeURIComponent(query) + '&unique=prints&order=released&dir=desc';
      const response = await fetch(url, { headers: { Accept:'application/json' }});
      if (!response.ok) throw Error('Scryfall: HTTP ' + response.status);
      const payload = await response.json();
      artResults = (payload.data || []).slice(0, 60).map(card => {
        const face = card.card_faces && card.card_faces[0];
        const imgs = card.image_uris || (face && face.image_uris) || {};
        return {
          image: validImage(imgs.art_crop || imgs.normal || ''),
          thumb: validImage(imgs.small || imgs.normal || ''),
          title: String(card.set_name || card.set || ''),
          artist: String(card.artist || (face && face.artist) || ''),
          year: String(card.released_at || '').slice(0,4)
        };
      }).filter(item => item.image && item.thumb);
      if (!artResults.length) return artStatus('Nessuna stampa trovata. Prova un nome diverso.', true);
      $('artGallery').innerHTML = artResults.map((item, i) =>
        '<button class="artChoice" data-art-choice="' + i + '" type="button" aria-label="Scegli ' + clean(item.title) + '">' +
        '<img src="' + clean(item.thumb) + '" loading="lazy" alt="">' +
        '<span>' + clean(item.title) + ' · ' + clean(item.year) + '</span></button>').join('');
      artStatus(artResults.length + ' artwork disponibili. Premi quello che preferisci.');
    } catch (error) {
      artStatus('Ricerca non riuscita: ' + error.message + '. Puoi usare un URL o un file personale.', true);
    }
  }
  async function chooseArt(value, artist, personal) {
    const deckId = activeArtDeckId;
    const deck = app().getDeck(deckId);
    if (!deck) return;
    try {
      if (!personal) {
        await archive().removeArtwork(deckId);
        artCache.delete(deckId);
        deck.customArt = false;
        deck.image = value;
        deck.artist = artist || '';
      } else {
        // L'immagine base64 risiede in IndexedDB, non nel localStorage dei mazzi.
        await archive().setArtwork(deckId, value, 'Artwork caricato dall’utente');
        artCache.set(deckId, value);
        deck.customArt = true;
        deck.artist = 'Artwork personale';
      }
      if (!app().save()) throw Error('Impossibile salvare la selezione.');
      app().render();
      closeArt();
      app().toast('Artwork aggiornato.');
    } catch (error) { artStatus('Non riesco a salvare l’artwork: ' + error.message, true); }
  }
  function imageToDataUrl(file) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type.startsWith('image/') || file.size > 20 * 1024 * 1024)
        return reject(Error('Scegli JPG, PNG o WebP con dimensione non superiore a 20 MB.'));
      const objectUrl = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        try {
          const max = 800, scale = Math.min(1, max / Math.max(image.naturalWidth, image.naturalHeight));
          const w = Math.max(1, Math.round(image.naturalWidth * scale));
          const h = Math.max(1, Math.round(image.naturalHeight * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w;canvas.height = h;
          canvas.getContext('2d').drawImage(image,0,0,w,h);
          const url = canvas.toDataURL('image/jpeg', 0.72);
          if (url.length > 550000) throw Error('Immagine ancora troppo grande. Prova una foto più semplice.');
          resolve(url);
        } catch(error){reject(error)}
        finally{URL.revokeObjectURL(objectUrl)}
      };
      image.onerror = () => {URL.revokeObjectURL(objectUrl);reject(Error('Immagine non leggibile.'))};
      image.src = objectUrl;
    });
  }

  function addOpponentRow(name, commander, image) {
    if (opponentRows >= 5) return;
    opponentRows++;
    const row = document.createElement('div');
    row.className = 'opponentRow';
    row.innerHTML = '<img class="opponentArt" alt="" ' + (validImage(image) ?
      'src="' + clean(validImage(image)) + '"' : '') + '>' +
      '<input class="field opponentName" placeholder="Nome avversario" aria-label="Nome avversario">' +
      '<input class="field opponentCommander" placeholder="Comandante" aria-label="Comandante avversario">' +
      '<button class="pillBtn opponentSearch" type="button" title="Cerca su Scryfall">🔎</button>' +
      '<button class="pillBtn opponentRemove" type="button" title="Rimuovi avversario">✕</button>';
    row.querySelector('.opponentName').value = name || '';
    row.querySelector('.opponentCommander').value = commander || '';
    row.querySelector('.opponentCommander').addEventListener('input', () => {row.dataset.art = ''});
    row.dataset.art = validImage(image || '');
    $('opponentTable').appendChild(row);
    row.querySelector('.opponentRemove').addEventListener('click', () => {
      row.remove();opponentRows--; updateOpponentCount();
    });
    row.querySelector('.opponentSearch').addEventListener('click', async () => {
      const input = row.querySelector('.opponentCommander');
      const name = input.value.trim();if(!name)return;
      const button=row.querySelector('.opponentSearch');button.disabled=true;button.textContent='…';
      try {
        const response=await fetch('https://api.scryfall.com/cards/named?fuzzy='+encodeURIComponent(name));
        if (!response.ok)throw Error('Comandante non trovato.');
        const card=await response.json();
        const imgs=card.image_uris || card.card_faces?.[0]?.image_uris || {};
        const img=validImage(imgs.art_crop || imgs.normal || '');
        input.value=card.name;
        row.dataset.art=img;
        if(img)row.querySelector('img').src=img;
      } catch(error){app().toast('Scryfall: '+error.message)}
      finally{button.disabled=false;button.textContent='🔎'}
    });
  }
  function updateOpponentCount(){
    $('opponentAddBtn').disabled=opponentRows>=5;
    $('opponentCount').textContent=opponentRows+' avversari';
  }
  function prepareOpponents() {
    $('opponentTable').innerHTML='';opponentRows=0;
    for (let i=0;i<3;i++)addOpponentRow();
    updateOpponentCount();
    $('recordProblems').value='';
  }
  function collectOpponents() {
    return [...$('opponentTable').querySelectorAll('.opponentRow')].map(row=>({
      name:row.querySelector('.opponentName').value.trim().slice(0,120),
      commander:row.querySelector('.opponentCommander').value.trim().slice(0,220),
      image:validImage(row.dataset.art||'')
    })).filter(row=>row.name || row.commander);
  }

  function animateReel(pool, winner) {
    const reel = $('reelText');
    const container = reel && reel.parentNode;
    if (!container) return Promise.resolve();
    const reduced=window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(reduced || pool.length<=1){reel.textContent=winner.name;return Promise.resolve()}
    if(drawing)return Promise.resolve();
    drawing=true;
    const duration=2600;
    const sequence=[];
    for(let i=0;i<22;i++)sequence.push(pool[Math.floor(Math.random()*pool.length)]);
    sequence.push(winner);
    const rail=document.createElement('div');
    rail.className='drawRail';
    const viewport=document.createElement('div');
    viewport.className='drawViewport';
    sequence.forEach(item=>{
      const card=document.createElement('div');card.className='drawMiniCard';
      const image=artFor(item);
      if(image){const img=document.createElement('img');img.src=image;img.alt='';card.appendChild(img)}
      const txt=document.createElement('div');txt.textContent=item.name;card.appendChild(txt);
      rail.appendChild(card);
    });
    viewport.appendChild(rail);
    container.appendChild(viewport);
    reel.style.visibility='hidden';
    const total=(sequence.length-1)*138+69;
    const target=Math.max(0,total-viewport.clientWidth/2);
    return new Promise(resolve=>{
      let done=false;
      const finish=()=>{
        if(done)return;done=true;viewport.remove();reel.style.visibility='';
        reel.textContent=winner.name;drawing=false;resolve();
      };
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        rail.style.transition='transform '+duration+'ms cubic-bezier(.12,.72,.14,1)';
        rail.style.transform='translateX(-'+target+'px)';
      }));
      setTimeout(finish,duration+140);
    });
  }

  const behavior={
    ramp: /\badd (?:{|\w+ mana|one mana|two mana)|\bsearch your library for (?:a |up to .*? )?(?:basic )?land|\bcreate (?:a|two|three|x) treasure|\bput (?:a|that|it) land (?:card )?onto the battlefield|\b(?:land|basic land) cards? from your (?:hand|graveyard) onto the battlefield/i,
    draw: /\bdraw (?:a|one|two|three|x|\d+) cards?|\bdraw cards? equal|\bput (?:one|a|that) (?:of those )?cards? into your hand/i,
    removal: /\bdestroy (?:target|all|each)|\bexile (?:target|all|each|up to)|\breturn target (?:creature|permanent|nonland)|\bdeals? \d+ damage to (?:target|each)|\bsacrifice (?:a|two|all) (?:creatures?|permanents?)/i,
    protection: /\bhexproof\b|\bindestructible\b|\bward\b|\bprotection from\b|\bphase out\b|\bphases? out\b|\bcan't be countered\b|\bprevent (?:all|the next)/i,
    recursion: /\breturn (?:target|a|up to \w+) .*?from (?:your|a|the) graveyard|\bcast .*?from (?:your|a|the) graveyard|\breanimate\b/i
  };
  function classify(entries,cardMap,overrides){
    const tally={ramp:0,draw:0,removal:0,protection:0,recursion:0};
    let unknown=0,known=0;
    for(const entry of entries){
      const card=cardMap.get(archive().keyOf(entry));
      if(!card){unknown+=entry.quantity;continue}
      known+=entry.quantity;
      const text=String(card.oracleText||'');
      const manuallySet=overrides?.get(entry.name.toLowerCase().normalize('NFKC'));
      for(const [key,pattern] of Object.entries(behavior)){
        if(manuallySet ? manuallySet.includes(key) : pattern.test(text))tally[key]+=entry.quantity;
      }
    }
    return {...tally,unknown,known};
  }

  async function renderAnalysis() {
    const currentApp=app();if(!currentApp)return;
    const state=currentApp.getState();
    const total=state.history.length;
    const wins=state.history.filter(h=>h.result==='win').length;
    const losses=total-wins;
    const byDeck=new Map();
    state.history.forEach(h=>{
      const row=byDeck.get(h.deckId)||{name:h.name,games:0,wins:0};
      row.games++;
      if(h.result==='win')row.wins++;
      byDeck.set(h.deckId,row);
    });
    $('analysisSummary').innerHTML='<div class="analysisStat"><b>'+state.decks.length+'</b><span>Mazzi</span></div>'+
      '<div class="analysisStat"><b>'+total+'</b><span>Partite</span></div>'+
      '<div class="analysisStat"><b>'+wins+'</b><span>Vittorie</span></div>'+
      '<div class="analysisStat"><b>'+(total?Math.round(wins/total*100)+'%':'—')+'</b><span>Win rate</span></div>';
    $('analysisResults').innerHTML='<div class="archiveHeading">Prestazioni per mazzo</div>'+
      (state.decks.length?state.decks.map(d=>{
        const row=byDeck.get(d.id)||{games:0,wins:0};
        const pct=row.games?Math.round(row.wins/row.games*100):0;
        return '<div class="analysisResult"><b>'+clean(d.name)+'</b><span>'+
          row.wins+' W · '+(row.games-row.wins)+' L · '+(row.games?pct+'%':'—')+
          ' <small>('+row.games+' partite)</small></span></div>';
      }).join(''):'<p class="note">Aggiungi un mazzo per iniziare.</p>');
    const selector=$('analysisSelect');
    const currentChoice=analysisDeckId || selector.value;
    selector.innerHTML=state.decks.map(d=>'<option value="'+clean(d.id)+'">'+clean(d.name)+'</option>').join('');
    const selected=state.decks.find(d=>d.id===currentChoice)||state.decks[0];
    if(!selected){$('analysisDetails').innerHTML='';return}
    selector.value=selected.id;analysisDeckId=selected.id;
    const key=selected.id;
    const gameLogs=state.history.filter(h=>h.deckId===key);
    const versions=new Map();
    gameLogs.forEach(h=>{
      const k=h.deckVersion||'Non associata';
      const t=versions.get(k)||{wins:0,games:0};t.games++;if(h.result==='win')t.wins++;
      versions.set(k,t);
    });
    let html='<div class="archiveHeading">Partite per versione</div>'+
      ([...versions].length?[...versions].map(([ver,score])=>
        '<div class="analysisResult"><span>'+clean(ver==='Non associata'?ver:'Versione '+new Date(ver).toLocaleDateString('it-IT'))+
        '</span><span>'+score.wins+' W / '+(score.games-score.wins)+' L · '+
        (score.games?Math.round(score.wins/score.games*100)+'%':'—')+' ('+score.games+')</span></div>').join('') :
        '<p class="note">Nessuna partita per questo mazzo.</p>');
    const notes=gameLogs.map(h=>h.problems||'').filter(Boolean);
    if(notes.length)html+='<div class="archiveHeading">Difficoltà segnalate</div>'+
      notes.slice(-8).reverse().map(n=>'<div class="analysisNote">'+clean(n)+'</div>').join('');
    $('analysisDetails').innerHTML=html+'<p class="note">Analisi delle carte: caricamento archivio locale…</p>';
    try{
      const list=await archive().loadDeck(key);
      if(!list){$('analysisDetails').innerHTML=html+'<p class="note">Importa una lista di carte per stimare ramp, pescata, removal e protezioni.</p>';return}
      const [cards,overrides]=await Promise.all([
        archive().cachedCards(list.entries),archive().getRoleOverrides(key)
      ]);
      if(analysisDeckId!==key)return;
      const labels={ramp:'Ramp',draw:'Pescata',removal:'Removal',protection:'Protezioni',recursion:'Recursion'};
      const estimate=classify(list.entries,cards,overrides);
      html+='<div class="archiveHeading">Ruoli delle carte · classificazioni automatiche modificabili dalla Lista</div>'+
        '<div class="analysisBreakdown">'+Object.entries(labels).map(([k,label])=>
          '<div><b>'+estimate[k]+'</b><span>'+label+'</span></div>').join('')+'</div>'+
        '<p class="note">Stime basate sul testo Oracle: alcune carte ricoprono più ruoli. '+estimate.unknown+
        ' carte senza dati Scryfall sono escluse dalle stime. Non è un punteggio di potenza.</p>';
      $('analysisDetails').innerHTML=html;
    }catch(error){$('analysisDetails').innerHTML=html+'<p class="note">Archivio non disponibile: '+clean(error.message)+'</p>'}
  }

  function init() {
    document.querySelectorAll('[data-go-tab]').forEach(node=>{
      node.addEventListener('click',()=>setTab(node.dataset.goTab));
    });
    $('analysisSelect').addEventListener('change', e=>{
      analysisDeckId=e.target.value;renderAnalysis();
    });
    $('openArtModalBtn').addEventListener('click',()=>{
      const deckId=app().getEditingDeckId();
      const deck=app().getDeck(deckId);
      if(deck)showArtDeck(deck);
    });
    $('artSearchBtn').addEventListener('click',prints);
    $('artModal').addEventListener('click',e=>{if(e.target===$('artModal'))closeArt()});
    $('artCloseBtn').addEventListener('click',closeArt);
    $('artGallery').addEventListener('click',e=>{
      const b=e.target.closest('[data-art-choice]');if(!b)return;
      const art=artResults[Number(b.dataset.artChoice)];
      if(art)chooseArt(art.image,art.artist,false);
    });
    $('artUrlBtn').addEventListener('click',()=>{
      const url=validImage($('artCustomUrl').value.trim());
      if(!url)return artStatus('Inserisci un URL HTTPS di un’immagine.',true);
      chooseArt(url,'Artwork da URL',false);
    });
    $('artFile').addEventListener('change',async e=>{
      const file=e.target.files[0];if(!file)return;
      artStatus('Sto ridimensionando l’immagine…');
      try{const data=await imageToDataUrl(file);await chooseArt(data,'',true)}
      catch(error){artStatus(error.message,true)}
      e.target.value='';
    });
    $('opponentAddBtn').addEventListener('click',()=>{addOpponentRow();updateOpponentCount()});
    $('recordModal').addEventListener('click',e=>{if(e.target===$('recordModal')){opponentRows=0}});
    setTab('play');
    hydrateArtworks().catch(()=>{});
    renderAnalysis();
  }

  window.DeckCycleExtras={
    init,setTab,renderAnalysis,artFor,animateReel,prepareOpponents,collectOpponents,
    hydrateArtworks,artCache,showArtDeck,classify
  };
  init();
})();