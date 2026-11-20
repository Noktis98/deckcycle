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
    // I file personali sono nell'IndexedDB, mai nel campo image del mazzo.
    // Finché la cache non è pronta non mostrare per errore la stampa originale.
    if (deck.customArt) return artCache.get(deck.id) || '';
    return validImage(deck.image || '');
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
    artCache.clear();
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
    const previous = {
      image: deck.image, artist: deck.artist, customArt: deck.customArt,
      artLocked: deck.artLocked, cached: artCache.get(deckId)
    };
    try {
      if (!personal) {
        // Una stampa/URL scelta manualmente deve essere utilizzata in ogni vista.
        // La selezione remota resta possibile anche se IndexedDB non è disponibile.
        await archive().removeArtwork(deckId).catch(error => {
          console.warn('DeckCycle: impossibile rimuovere l\u2019immagine locale precedente:', error.message);
        });
        artCache.delete(deckId);
        deck.customArt = false;
        deck.image = value;
        deck.artist = artist || '';
      } else {
        // L'immagine personale viene salvata in IndexedDB per non riempire localStorage.
        await archive().setArtwork(deckId, value, 'Artwork caricato dall\u2019utente');
        artCache.set(deckId, value);
        deck.customArt = true;
        deck.artist = 'Artwork personale';
      }
      // Blocca sia i refresh futuri sia le richieste Scryfall già in corso.
      deck.artLocked = true;
      if (!app().save()) throw Error('Impossibile salvare la selezione.');
      app().render();
      app().refreshDeckPreview?.(deckId);
      closeArt();
      app().toast('Artwork aggiornato in tutte le schermate.');
    } catch (error) {
      Object.assign(deck, {
        image: previous.image, artist: previous.artist,
        customArt: previous.customArt, artLocked: previous.artLocked
      });
      if (previous.cached) artCache.set(deckId, previous.cached);
      else artCache.delete(deckId);
      app().render();
      artStatus('Non riesco a salvare l’artwork: ' + error.message, true);
    }
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


  // Rubrica avversari, separata dallo storico: nuovi giocatori e mazzi
  // vengono ricordati dopo aver confermato il risultato della partita.
  const AVATAR_ID = '__deckcycle_profile_avatar';
  function roster(){
    const state=app().getState();
    if(!Array.isArray(state.opponentGroups))state.opponentGroups=[];
    if(!Array.isArray(state.opponents))state.opponents=[];
    state.opponentGroups=state.opponentGroups.filter(g=>g && typeof g.id==='string'&&g.id &&
      typeof g.name==='string'&&g.name.trim()).slice(0,40)
      .map(g=>({id:g.id.slice(0,80),name:g.name.trim().slice(0,70)}));
    state.opponents=state.opponents.filter(p=>p && typeof p.id==='string'&&p.id &&
      typeof p.name==='string'&&p.name.trim()).slice(0,150)
      .map(p=>({
        id:p.id.slice(0,80),name:p.name.trim().slice(0,120),
        groupId:state.opponentGroups.some(g=>g.id===p.groupId)?p.groupId:'',
        decks:(Array.isArray(p.decks)?p.decks:[]).slice(0,20).map(d=>
          typeof d==='string'?{commander:d.slice(0,220),image:''}:{
            commander:String(d?.commander||'').trim().slice(0,220),
            image:validImage(d?.image||'')
          }).filter(d=>d.commander)
      }));
    return state;
  }
  function rosterId(){
    return 'op'+Math.random().toString(36).slice(2,10)+Date.now().toString(36).slice(-5);
  }
  function same(a,b){return String(a||'').trim().toLocaleLowerCase('it')===String(b||'').trim().toLocaleLowerCase('it')}
  function groupOptions(selected,emptyLabel){
    const data=roster();
    return '<option value="">'+clean(emptyLabel||'Senza gruppo')+'</option>'+
      data.opponentGroups.map(g=>'<option value="'+clean(g.id)+'"'+
      (selected===g.id?' selected':'')+'>'+clean(g.name)+'</option>').join('');
  }
  function renderRoster(){
    const data=roster();
    const formGroup=$('rosterNewGroup')?.value||'',matchGroup=$('recordGroupSelect')?.value||'';
    $('rosterNewGroup').innerHTML=groupOptions(formGroup,'Senza gruppo');
    $('recordGroupSelect').innerHTML=groupOptions(matchGroup,'Seleziona gruppo…');
    $('rosterGroups').innerHTML=data.opponentGroups.length?
      data.opponentGroups.map(g=>'<div class="rosterGroupItem"><b>'+clean(g.name)+'</b>'+
        '<button type="button" data-roster-group-edit="'+clean(g.id)+'" title="Rinomina gruppo">✏️</button>'+
        '<button type="button" data-roster-group-remove="'+clean(g.id)+'" title="Elimina gruppo">✕</button></div>').join(''):
      '<span class="note">Nessun gruppo. Puoi comunque salvare giocatori senza gruppo.</span>';
    $('rosterPlayers').innerHTML=data.opponents.length?
      data.opponents.map(p=>{
        const decks=p.decks.map((d,i)=>'<div class="rosterDeckRow">'+
          '<input class="field rosterDeckInput" maxlength="220" value="'+clean(d.commander)+
          '" aria-label="Mazzo del giocatore">'+
          '<button type="button" class="miniBtn" data-roster-action="remove-deck" data-deck-index="'+i+
          '" title="Rimuovi questo mazzo">✕</button></div>').join('');
        return '<div class="rosterPlayer" data-roster-player="'+clean(p.id)+'">'+
          '<div class="rosterPlayerFields"><input class="field rosterNameInput" maxlength="120" value="'+clean(p.name)+
          '" aria-label="Nome giocatore">'+
          '<select class="rosterGroupInput" aria-label="Gruppo">'+groupOptions(p.groupId,'Senza gruppo')+'</select></div>'+
          '<div class="archiveHeading">Mazzi abituali</div><div class="rosterDeckList">'+(decks||
          '<p class="note">Nessun mazzo salvato.</p>')+'</div>'+
          '<div class="rosterPlayerActions"><button type="button" class="miniBtn" data-roster-action="add-deck">+ Mazzo</button>'+
          '<button type="button" class="pillBtn" data-roster-action="save-player">Salva modifiche</button>'+
          '<button type="button" class="miniBtn" data-roster-action="delete-player">Elimina giocatore</button></div></div>';
      }).join(''):'<p class="note">Non hai ancora salvato avversari. Puoi aggiungerli qui o durante una partita.</p>';
  }
  function persistRoster(){if(!app().save())return app().toast('Non è stato possibile salvare la rubrica.');renderRoster();}
  function addGroup(){
    const data=roster(),name=$('rosterGroupName').value.trim().slice(0,70);
    if(!name)return app().toast('Scrivi un nome per il gruppo.');
    if(data.opponentGroups.length>=40)return app().toast('Limite di 40 gruppi raggiunto.');
    if(data.opponentGroups.some(g=>same(g.name,name)))return app().toast('Questo gruppo esiste già.');
    data.opponentGroups.push({id:rosterId(),name});
    $('rosterGroupName').value='';persistRoster();
  }
  function addRosterPlayer(){
    const data=roster(),name=$('rosterNewName').value.trim().slice(0,120);
    const groupId=$('rosterNewGroup').value;
    const commander=$('rosterNewDeck').value.trim().slice(0,220);
    if(!name)return app().toast('Inserisci il nome del giocatore.');
    let p=data.opponents.find(p=>same(p.name,name));
    if(!p){
      if(data.opponents.length>=150)return app().toast('Limite di 150 giocatori raggiunto.');
      p={id:rosterId(),name,groupId,decks:[]};data.opponents.push(p);
    }else if(groupId){p.groupId=groupId}
    if(commander&&!p.decks.some(x=>same(x.commander,commander))&&p.decks.length<20)
      p.decks.push({commander,image:''});
    $('rosterNewName').value='';$('rosterNewDeck').value='';persistRoster();
    app().toast('Giocatore salvato nella rubrica.');
  }
  function rosterAction(e){
    const groupEdit=e.target.closest('[data-roster-group-edit]');
    const groupRemove=e.target.closest('[data-roster-group-remove]');
    const state=roster();
    if(groupEdit){
      const g=state.opponentGroups.find(x=>x.id===groupEdit.dataset.rosterGroupEdit);
      if(!g)return;
      const name=prompt('Nuovo nome del gruppo',g.name);
      if(name===null)return;
      const val=name.trim().slice(0,70);
      if(!val)return app().toast('Il nome del gruppo non può essere vuoto.');
      if(state.opponentGroups.some(x=>x.id!==g.id&&same(x.name,val)))return app().toast('Il gruppo esiste già.');
      g.name=val;persistRoster();return;
    }
    if(groupRemove){
      const id=groupRemove.dataset.rosterGroupRemove;
      if(!confirm('Eliminare il gruppo? I giocatori rimarranno salvati senza gruppo.'))return;
      state.opponentGroups=state.opponentGroups.filter(g=>g.id!==id);
      state.opponents.forEach(p=>{if(p.groupId===id)p.groupId=''});
      persistRoster();return;
    }
    const button=e.target.closest('[data-roster-action]');
    if(!button)return;
    const box=button.closest('[data-roster-player]');
    const p=state.opponents.find(p=>p.id===box?.dataset.rosterPlayer);
    if(!box||!p)return;
    const action=button.dataset.rosterAction;
    if(action==='delete-player'){
      if(!confirm('Eliminare '+p.name+' dalla rubrica? Le partite registrate resteranno nello storico.'))return;
      state.opponents=state.opponents.filter(x=>x.id!==p.id);
      persistRoster();return;
    }
    if(action==='remove-deck'){
      button.closest('.rosterDeckRow')?.remove();return;
    }
    if(action==='add-deck'){
      const wrapper=box.querySelector('.rosterDeckList');
      const empty=wrapper.querySelector('.note');if(empty)empty.remove();
      const row=document.createElement('div');row.className='rosterDeckRow';
      row.innerHTML='<input class="field rosterDeckInput" maxlength="220" placeholder="Nome comandante o mazzo" aria-label="Mazzo del giocatore">'+
        '<button class="miniBtn" type="button" data-roster-action="remove-deck" title="Rimuovi">✕</button>';
      wrapper.appendChild(row);row.querySelector('input').focus();return;
    }
    if(action==='save-player'){
      const name=box.querySelector('.rosterNameInput').value.trim().slice(0,120);
      if(!name)return app().toast('Inserisci un nome.');
      if(state.opponents.some(x=>x.id!==p.id && same(x.name,name)))return app().toast('Un altro giocatore ha già questo nome.');
      p.name=name;
      p.groupId=box.querySelector('.rosterGroupInput').value;
      const newDecks=[];
      for(const input of box.querySelectorAll('.rosterDeckInput')){
        const commander=input.value.trim().slice(0,220);
        if(!commander||newDecks.some(d=>same(d.commander,commander)))continue;
        const old=p.decks.find(d=>same(d.commander,commander));
        newDecks.push({commander,image:old?.image||''});
        if(newDecks.length>=20)break;
      }
      p.decks=newDecks;persistRoster();app().toast('Modifiche salvate.');
    }
  }

  function playerOptions(selectedId){
    const people=roster().opponents.slice().sort((a,b)=>a.name.localeCompare(b.name,'it'));
    return '<option value="">Scegli giocatore salvato…</option>'+
      people.map(p=>'<option value="'+clean(p.id)+'"'+(p.id===selectedId?' selected':'')+
        '>'+clean(p.name)+'</option>').join('');
  }
  function updateDeckChoice(row,p,preferred){
    const select=row.querySelector('.opponentSavedDeck');
    const decks=p?.decks||[];
    select.innerHTML='<option value="">'+(decks.length?'Scegli mazzo abituale…':'Nessun mazzo salvato')+'</option>'+
      decks.map((d,i)=>'<option value="'+i+'">'+clean(d.commander)+'</option>').join('');
    if(preferred) {
      const i=decks.findIndex(d=>same(d.commander,preferred));
      if(i>=0)select.value=String(i);
    }else if(decks.length===1){select.value='0'}
    select.disabled=!decks.length;
  }
  function applySavedDeck(row,p){
    const index=Number(row.querySelector('.opponentSavedDeck').value);
    const saved=p?.decks?.[index];
    if(!saved)return;
    row.querySelector('.opponentCommander').value=saved.commander;
    row.dataset.art=validImage(saved.image||'');
    const img=row.querySelector('.opponentArt');
    if(row.dataset.art)img.src=row.dataset.art;else img.removeAttribute('src');
  }
  function addOpponentRow(name='',commander='',image='',playerId=''){
    if(opponentRows>=5)return;
    opponentRows++;
    const row=document.createElement('div');
    row.className='opponentRow';
    row.innerHTML='<div class="opponentPresetBar">'+
      '<select class="opponentSavedPlayer" aria-label="Scegli giocatore salvato">'+playerOptions(playerId)+'</select>'+
      '<select class="opponentSavedDeck" aria-label="Scegli mazzo abituale"><option value="">Scegli mazzo…</option></select></div>'+
      '<img class="opponentArt" alt="" '+(validImage(image)?'src="'+clean(validImage(image))+'"':'')+'>'+
      '<input class="field opponentName" maxlength="120" placeholder="Nome avversario" aria-label="Nome avversario">'+
      '<input class="field opponentCommander" maxlength="220" placeholder="Comandante" aria-label="Comandante avversario">'+
      '<button class="pillBtn opponentSearch" type="button" title="Cerca su Scryfall">🔎</button>'+
      '<button class="pillBtn opponentRemove" type="button" title="Rimuovi avversario">✕</button>';
    const p=roster().opponents.find(x=>x.id===playerId)||roster().opponents.find(x=>same(x.name,name));
    row.dataset.playerId=p?.id||'';
    row.querySelector('.opponentName').value=name||p?.name||'';
    row.querySelector('.opponentCommander').value=commander||'';
    row.dataset.art=validImage(image||'');
    updateDeckChoice(row,p,commander);
    if(!commander&&p)applySavedDeck(row,p);
    $('opponentTable').appendChild(row);
    row.querySelector('.opponentSavedPlayer').addEventListener('change',()=>{
      const picked=roster().opponents.find(x=>x.id===row.querySelector('.opponentSavedPlayer').value);
      row.dataset.playerId=picked?.id||'';
      row.querySelector('.opponentName').value=picked?.name||'';
      row.querySelector('.opponentCommander').value='';
      row.dataset.art='';row.querySelector('img').removeAttribute('src');
      updateDeckChoice(row,picked);
      if(picked?.decks.length===1)applySavedDeck(row,picked);
    });
    row.querySelector('.opponentSavedDeck').addEventListener('change',()=>{
      const picked=roster().opponents.find(x=>x.id===row.dataset.playerId);
      applySavedDeck(row,picked);
    });
    row.querySelector('.opponentName').addEventListener('input',()=>{
      const picked=roster().opponents.find(x=>x.id===row.dataset.playerId);
      if(!picked||!same(row.querySelector('.opponentName').value,picked.name)){
        row.dataset.playerId='';
        row.querySelector('.opponentSavedPlayer').value='';
        updateDeckChoice(row,null);
      }
    });
    row.querySelector('.opponentCommander').addEventListener('input',()=>{
      row.dataset.art='';
      row.querySelector('img').removeAttribute('src');
      row.querySelector('.opponentSavedDeck').value='';
    });
    row.querySelector('.opponentRemove').addEventListener('click',()=>{
      row.remove();opponentRows--;updateOpponentCount();
    });
    row.querySelector('.opponentSearch').addEventListener('click',async()=>{
      const input=row.querySelector('.opponentCommander');
      const wanted=input.value.trim();if(!wanted)return;
      const button=row.querySelector('.opponentSearch');
      button.disabled=true;button.textContent='…';
      try{
        const response=await fetch('https://api.scryfall.com/cards/named?fuzzy='+encodeURIComponent(wanted));
        if(!response.ok)throw Error('Comandante non trovato.');
        const card=await response.json();
        const images=card.image_uris||card.card_faces?.[0]?.image_uris||{};
        const art=validImage(images.art_crop||images.normal||'');
        input.value=card.name;row.dataset.art=art;
        if(art)row.querySelector('img').src=art;
      }catch(e){app().toast('Scryfall: '+e.message)}
      finally{button.disabled=false;button.textContent='🔎'}
    });
    return row;
  }
  function updateOpponentCount(){
    $('opponentAddBtn').disabled=opponentRows>=5;
    $('opponentCount').textContent=opponentRows===1?'1 avversario':opponentRows+' avversari';
  }
  function prepareOpponents(){
    renderRoster();
    $('opponentTable').innerHTML='';opponentRows=0;
    for(let i=0;i<3;i++)addOpponentRow();
    updateOpponentCount();
    $('recordProblems').value='';
  }
  function collectOpponents(){
    return [...$('opponentTable').querySelectorAll('.opponentRow')].map(row=>({
      playerId:row.dataset.playerId||'',
      name:row.querySelector('.opponentName').value.trim().slice(0,120),
      commander:row.querySelector('.opponentCommander').value.trim().slice(0,220),
      image:validImage(row.dataset.art||'')
    })).filter(row=>row.name||row.commander);
  }
  function fillGroup(){
    const groupId=$('recordGroupSelect').value;
    const members=roster().opponents.filter(p=>p.groupId===groupId);
    if(!groupId||!members.length)return app().toast('Questo gruppo non contiene ancora giocatori.');
    $('opponentTable').innerHTML='';opponentRows=0;
    members.slice(0,5).forEach(p=>addOpponentRow(p.name,'','',p.id));
    updateOpponentCount();
    if(members.length>5)app().toast('Mostrati i primi 5 giocatori: massimo 5 avversari per partita.');
  }
  function rememberOpponents(rows){
    const data=roster(),group=$('recordGroupSelect').value;
    for(const item of rows){
      const name=String(item.name||'').trim().slice(0,120);
      const commander=String(item.commander||'').trim().slice(0,220);
      if(!name)continue;
      let p=data.opponents.find(p=>p.id===item.playerId)||data.opponents.find(p=>same(p.name,name));
      if(!p){
        if(data.opponents.length>=150)break;
        p={id:rosterId(),name,groupId:group||'',decks:[]};
        data.opponents.push(p);
      }else if(group&&!p.groupId){p.groupId=group}
      if(commander){
        const existing=p.decks.find(x=>same(x.commander,commander));
        const image=validImage(item.image||'');
        if(existing){if(image)existing.image=image}
        else if(p.decks.length<20)p.decks.push({commander,image});
      }
    }
    renderRoster();
  }
  function avatarStatus(txt){$('profileAvatarStatus').textContent=txt}
  function displayAvatar(dataUrl){
    const visible=typeof dataUrl==='string'&&/^data:image\/(?:jpeg|png|webp);base64,/.test(dataUrl);
    const image=$('profileAvatarImage');
    if(visible)image.src=dataUrl;else image.removeAttribute('src');
    image.classList.toggle('hide',!visible);
    $('profileAvatarFallback').classList.toggle('hide',visible);
  }
  async function hydrateAvatar(){
    try{
      const item=await archive().loadArtwork(AVATAR_ID);
      displayAvatar(item?.dataUrl||'');
      avatarStatus(item?'Foto profilo caricata.':'Puoi scegliere un’immagine dal telefono.');
    }catch(e){displayAvatar('');avatarStatus('Foto profilo non disponibile: '+e.message)}
  }
  async function uploadAvatar(file){
    if(!file)return;
    avatarStatus('Sto preparando la foto…');
    try{
      const url=await imageToDataUrl(file);
      await archive().setArtwork(AVATAR_ID,url,'Foto profilo DeckCycle');
      displayAvatar(url);avatarStatus('Foto profilo aggiornata e inclusa nel backup JSON.');
      archive().warmExport().catch(()=>{});
    }catch(e){avatarStatus('Immagine non salvata: '+e.message)}
  }
  async function removeAvatar(){
    try{
      await archive().removeArtwork(AVATAR_ID);
      displayAvatar('');avatarStatus('Emoji ripristinata.');
      archive().warmExport().catch(()=>{});
    }catch(e){avatarStatus('Non riesco a rimuovere la foto: '+e.message)}
  }
  function onRosterImported(){roster();renderRoster();updateOpponentCount();}

  function animateReel(pool, winner) {
    const reel = $('reelText');
    const container = reel && reel.parentNode;
    if (!container) return Promise.resolve();
    const reduced = window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || pool.length <= 1) {
      reel.textContent = winner.name;
      return Promise.resolve();
    }
    if (drawing) return Promise.resolve();
    drawing = true;
    // Roulette con carte tutte differenti: il vincitore compare solo alla fine.
    // Le probabilità restano uniformi perché il sorteggio viene fatto prima.
    const others = pool.filter(item => item.id !== winner.id);
    for (let i = others.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [others[i], others[j]] = [others[j], others[i]];
    }
    const sequence = [...others.slice(0, 18), winner];
    const duration = Math.min(2800, Math.max(850, sequence.length * 330));

    const rail = document.createElement('div');
    rail.className = 'drawRail';
    const viewport = document.createElement('div');
    viewport.className = 'drawViewport';
    // Inverti l'ordine visivo: mentre la colonna scende, i mazzi scorrono
    // dall'alto verso il basso e l'ultimo visualizzato è il vincitore.
    for (const item of sequence.slice().reverse()) {
      const card = document.createElement('div');
      card.className = 'drawMiniCard';
      const image = artFor(item);
      if (image) {
        const img = document.createElement('img');
        img.src = image;
        img.alt = '';
        card.appendChild(img);
      }
      const txt = document.createElement('div');
      txt.textContent = item.name;
      card.appendChild(txt);
      rail.appendChild(card);
    }
    viewport.appendChild(rail);
    container.appendChild(viewport);
    reel.style.visibility = 'hidden';

    // La colonna parte con la prima carta estratta centrata e SCENDE
    // fino alla carta vincitrice. Nessun movimento orizzontale.
    const first = rail.firstElementChild;
    const height = first?.getBoundingClientRect().height || 124;
    const step = height + 8; // Il gap tra le carte è definito nel CSS.
    const finalY = (viewport.clientHeight - height) / 2;
    const initialY = finalY - (sequence.length - 1) * step;
    rail.style.transform = 'translate3d(0, ' + initialY + 'px, 0)';

    return new Promise(resolve => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        viewport.remove();
        reel.style.visibility = '';
        reel.textContent = winner.name;
        drawing = false;
        resolve();
      };
      requestAnimationFrame(() => requestAnimationFrame(() => {
        rail.style.transition = 'transform ' + duration +
          'ms cubic-bezier(.12,.72,.14,1)';
        rail.style.transform = 'translate3d(0, ' + finalY + 'px, 0)';
      }));
      setTimeout(finish, duration + 160);
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
      const manuallySet=overrides?.get(entry.name.toLowerCase().normalize('NFKC'));
      if(!card){
        unknown+=entry.quantity;
        if(manuallySet) for(const key of manuallySet)tally[key]+=entry.quantity;
        continue;
      }
      known+=entry.quantity;
      const text=String(card.oracleText||'');
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
    roster();renderRoster();
    $('rosterGroupAddBtn').addEventListener('click',addGroup);
    $('rosterPlayerAddBtn').addEventListener('click',addRosterPlayer);
    $('rosterGroups').addEventListener('click',rosterAction);
    $('rosterPlayers').addEventListener('click',rosterAction);
    $('opponentAddBtn').addEventListener('click',()=>{addOpponentRow();updateOpponentCount()});
    $('recordGroupFillBtn').addEventListener('click',fillGroup);
    $('profileAvatarBtn').addEventListener('click',()=>$('profileAvatarFile').click());
    $('profileAvatarChangeBtn').addEventListener('click',()=>$('profileAvatarFile').click());
    $('profileAvatarRemoveBtn').addEventListener('click',removeAvatar);
    $('profileAvatarFile').addEventListener('change',async e=>{
      await uploadAvatar(e.target.files?.[0]);e.target.value='';
    });
    hydrateAvatar();
    $('recordModal').addEventListener('click',e=>{if(e.target===$('recordModal')){opponentRows=0}});
    setTab('play');
    hydrateArtworks().catch(()=>{});
    renderAnalysis();
  }

  window.DeckCycleExtras={
    init,setTab,renderAnalysis,artFor,animateReel,prepareOpponents,collectOpponents,
    hydrateArtworks,artCache,showArtDeck,classify,
    rememberOpponents,renderRoster,onRosterImported,hydrateAvatar
  };
  init();
})();