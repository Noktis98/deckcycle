/* DeckCycle Fase 3 — interfaccia dell'archivio carte.
 * Richiede archive.js; non modifica il salvataggio principale. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const store = window.DeckCycleArchive;
  let deck = null;
  let current = null;
  let cards = new Map();
  let busy = false;
  let imagesVisible = true;

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g,
      ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }
  function safeImage(uri) {
    try {
      const url = new URL(uri);
      return url.protocol === 'https:' && (url.hostname === 'cards.scryfall.io' || url.hostname.endsWith('.scryfall.io')) ? url.href : '';
    } catch (error) { return ''; }
  }
  function setStatus(text, error) {
    $('archiveStatus').textContent = text;
    $('archiveStatus').classList.toggle('archiveError', !!error);
  }
  function setBusy(value) {
    busy = value;
    ['archiveSaveBtn', 'archiveRefreshBtn', 'archiveEditBtn'].forEach(id => { $(id).disabled = value; });
  }
  function editor(isOpen) {
    $('archiveEditor').classList.toggle('hide', !isOpen);
    $('archiveEditBtn').textContent = isOpen ? 'Nascondi editor' : '✏️ Importa o modifica lista';
  }
  function listAsText(value) {
    if (value.raw && value.raw.trim()) return value.raw;
    const commander = value.entries.filter(e => e.section === 'Commander');
    const main = value.entries.filter(e => e.section !== 'Commander');
    const line = e => e.quantity + ' ' + e.name +
      (e.set ? ' (' + e.set.toUpperCase() + ')' + (e.collector ? ' ' + e.collector : '') : '');
    return (commander.length ? 'Commander\n' + commander.map(line).join('\n') + '\n\n' : '') +
      'Deck\n' + main.map(line).join('\n');
  }
  function warningCount(total) {
    return total === 100 ? '100 carte: quantità Commander attesa.' :
      total + ' carte: una lista Commander normalmente contiene 100 carte, comandante incluso.';
  }

  async function renderArchive() {
    if (!deck) return;
    const deckId = deck.id;
    if (!current || !current.entries.length) {
      $('archiveMetrics').innerHTML = '<span class="tag">Nessuna lista salvata</span>';
      $('archiveCurve').innerHTML = '';
      $('archiveCards').innerHTML = '<div class="empty">Incolla una lista in formato Moxfield per iniziare.</div>';
      return;
    }
    try { cards = await store.cachedCards(current.entries); }
    catch (error) {
      cards = new Map();
      setStatus('Dati delle carte non disponibili: ' + error.message, true);
    }
    if (!deck || deck.id !== deckId) return;
    let overrides=new Map();
    try { overrides=await store.getRoleOverrides(deckId); } catch(error) {}
    if (!deck || deck.id !== deckId) return;
    const summary = store.summarize(current.entries, cards);
    $('archiveMetrics').innerHTML = [
      '<span class="tag">' + summary.total + ' carte</span>',
      '<span class="tag">' + current.entries.length + ' nomi / stampe</span>',
      '<span class="tag">' + summary.known + ' carte identificate</span>',
      '<span class="tag">CMC medio magie: ' + (summary.avgMana || '—') + '</span>',
      '<span class="tag">Metadati mancanti: ' + summary.missing + '</span>'
    ].join('');
    const max = Math.max(1, ...summary.curve);
    $('archiveCurve').innerHTML = '<div class="archiveHeading">Curva di mana (solo magie riconosciute)</div>' +
      '<div class="archiveChart">' + summary.curve.map((amount, i) =>
        '<div class="archiveBarCol"><div class="archiveBarValue">' + amount + '</div>' +
        '<div class="archiveBarTrack"><div class="archiveBar" style="height:' +
        Math.max(amount ? 6 : 0, Math.round(amount / max * 100)) + '%"></div></div>' +
        '<div class="archiveBarLabel">' + (i === 6 ? '6+' : i) + '</div></div>'
      ).join('') + '</div>' +
      '<div class="archiveHeading">Distribuzione tipologie (solo carte riconosciute)</div>' +
      '<div class="archiveCategorySummary">' + (summary.categories.length ?
        summary.categories.map(item => '<span class="tag">' + escapeHtml(item.name) + ': ' + item.count + '</span>').join('') :
        '<span class="note">Aggiorna Scryfall per vedere le tipologie.</span>') + '</div>';

    const groups = new Map();
    current.entries.forEach(entry => {
      const card = cards.get(store.keyOf(entry));
      const group = entry.section === 'Commander' ? 'Commander' : (card ? store.category(card) : 'Da identificare');
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push({ entry, card });
    });
    const order = ['Commander', 'Creature', 'Planeswalker', 'Artefatti', 'Incantesimi',
      'Istantanei', 'Stregonerie', 'Terre', 'Battaglie', 'Altro', 'Da identificare'];
    let markup = '';
    for (const key of order) {
      const group = groups.get(key);
      if (!group || !group.length) continue;
      const total = group.reduce((sum, x) => sum + x.entry.quantity, 0);
      markup += '<h3 class="archiveHeading">' + escapeHtml(key) + ' · ' + total + '</h3><div class="archiveRows">';
      markup += group.map(({ entry, card }) => {
        const image = card && imagesVisible ? safeImage(card.image) : '';
        const img = image ? '<img class="archiveCardImage" loading="lazy" decoding="async" src="' + escapeHtml(image) + '" alt="">' : '';
        const url = 'https://scryfall.com/search?q=' + encodeURIComponent('!"' + entry.name + '"');
        const tag = entry.section === 'Commander' ? '<span class="archiveCommander">Comandante</span>' : '';
        const roles = overrides.get(entry.name.toLowerCase().normalize('NFKC'));
        const rolesLabel=roles ? (roles.length ? roles.join(', ') : 'nessuno') : 'automatici';
        return '<div class="archiveCard">' + img + '<div class="archiveCardCopy">' +
          '<div class="archiveCardName"><b>' + entry.quantity + '× ' + escapeHtml(entry.name) + '</b>' +
          tag + '</div><div class="archiveCardDetails">' +
          (card ? escapeHtml(card.type || 'Tipo non disponibile') + ' · MV ' + escapeHtml(card.cmc) :
            'Dati non ancora caricati da Scryfall') +
          (entry.set ? ' · ' + escapeHtml(entry.set.toUpperCase() + (entry.collector ? ' #' + entry.collector : '')) : '') +
          '</div><a href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer">Apri su Scryfall</a>' +
          ' · <button class="miniBtn archiveRoleBtn" type="button" data-role-name="' + escapeHtml(entry.name) +
          '" title="Classifica manualmente questa carta">Ruoli: ' + escapeHtml(rolesLabel) + '</button>' +
          '</div></div>';
      }).join('');
      markup += '</div>';
    }
    $('archiveCards').innerHTML = markup || '<div class="empty">Nessuna carta.</div>';
  }

  async function editCardRoles(name) {
    if(!deck || !name)return;
    const id=deck.id, supported=['ramp','draw','removal','protection','recursion'];
    try {
      const roles=await store.getRoleOverrides(id);
      const currentRoles=roles.get(name.toLowerCase().normalize('NFKC'));
      const previous=currentRoles ? currentRoles.join(', ') : 'auto';
      const input=prompt('Ruoli per '+name+
        '\nScrivi uno o più tra: ramp, draw, removal, protection, recursion.'+
        '\nScrivi "auto" per usare il testo Oracle, oppure lascia vuoto per nessun ruolo.',previous);
      if(input===null)return;
      const words=input.split(/[,;\s]+/).map(x=>x.trim().toLowerCase()).filter(Boolean);
      if(input.trim().toLowerCase()==='auto'){
        await store.clearRoleOverride(id,name);
      }else{
        const invalid=words.filter(x=>!supported.includes(x));
        if(invalid.length) return setStatus('Ruoli non riconosciuti: '+invalid.join(', '),true);
        await store.setRoleOverride(id,name,words);
      }
      if(!deck || deck.id!==id)return;
      await renderArchive();
      window.DeckCycleExtras?.renderAnalysis();
      setStatus('Classificazione salvata. Verrà inclusa nel backup completo.');
    }catch(error){setStatus('Ruoli non salvati: '+error.message,true)}
  }

  async function renderVersions() {
    const selector = $('archiveVersionSelect');
    const selected = selector.value;
    selector.innerHTML = '<option value="">Scegli una versione precedente</option>';
    if (!deck) return;
    try {
      const versions = await store.listRevisions(deck.id);
      selector.innerHTML += versions.map(rev =>
        '<option value="' + Number(rev.id) + '">' +
        escapeHtml(new Date(rev.at).toLocaleString('it-IT') + ' · ' +
          (rev.reason || 'Prima della modifica') + ' · ' + rev.snapshot.entries.length + ' voci') +
        '</option>').join('');
      if (versions.some(v => String(v.id) === selected)) selector.value = selected;
    } catch (error) {
      setStatus('Impossibile leggere le versioni: ' + error.message, true);
    }
  }

  function diffEntries(left, right) {
    const summary = entries => {
      const map = new Map();
      (entries || []).forEach(item => {
        const key = item.name.toLowerCase().normalize('NFKC');
        const previous = map.get(key) || { name: item.name, quantity: 0 };
        previous.quantity += item.quantity;
        map.set(key, previous);
      });
      return map;
    };
    const a = summary(left), b = summary(right), added = [], removed = [];
    for (const [key, item] of b) {
      const change = item.quantity - (a.get(key)?.quantity || 0);
      if (change > 0) added.push('+ ' + change + ' ' + item.name);
    }
    for (const [key, item] of a) {
      const change = item.quantity - (b.get(key)?.quantity || 0);
      if (change > 0) removed.push('− ' + change + ' ' + item.name);
    }
    return { added, removed };
  }

  async function compareVersion() {
    if (!deck || !current) return;
    const revisionId = Number($('archiveVersionSelect').value);
    if (!revisionId) return setStatus('Seleziona prima una versione.', true);
    try {
      const older = (await store.listRevisions(deck.id)).find(v => v.id === revisionId);
      if (!older) return setStatus('Versione non trovata.', true);
      const diff = diffEntries(older.snapshot.entries, current.entries);
      $('archiveVersionDiff').innerHTML =
        '<b>Confronto tra la versione selezionata e quella attuale</b>' +
        '<div class="archiveDiffColumns"><div><strong>Aggiunte (' + diff.added.length +
        ')</strong><ul>' + (diff.added.length ? diff.added.map(line => '<li>' + escapeHtml(line) + '</li>').join('') :
          '<li>Nessuna</li>') + '</ul></div><div><strong>Eliminate (' + diff.removed.length +
        ')</strong><ul>' + (diff.removed.length ? diff.removed.map(line => '<li>' + escapeHtml(line) + '</li>').join('') :
          '<li>Nessuna</li>') + '</ul></div></div>';
    } catch (error) { setStatus(error.message, true); }
  }

  async function saveVersion() {
    if (!deck || !current) return setStatus('Salva prima una lista.', true);
    const label = prompt('Nome della versione, per esempio: Versione 2 — più ramp', 'Versione salvata');
    if (label === null) return;
    try {
      await store.labelVersion(deck.id, label);
      await renderVersions();
      setStatus('Versione salvata. Potrai confrontarla o ripristinarla.');
    } catch (error) { setStatus('Non riesco a salvare la versione: ' + error.message, true); }
  }

  async function restoreVersion() {
    if (!deck || busy) return;
    const revisionId = Number($('archiveVersionSelect').value);
    if (!revisionId) return setStatus('Seleziona una versione da ripristinare.', true);
    if (!confirm('Ripristinare questa lista? Quella attuale verrà conservata nelle versioni precedenti.')) return;
    setBusy(true);
    try {
      const deckId = deck.id;
      const restored = await store.restoreVersion(deckId, revisionId);
      if (!deck || deck.id !== deckId) return;
      current = restored;
      $('archivePaste').value = listAsText(restored);
      $('archiveVersionDiff').innerHTML = '';
      await renderVersions();
      await renderArchive();
      if (window.DeckCycleApp) window.DeckCycleApp.onListSaved(deckId, restored.updatedAt);
      setStatus('Versione ripristinata. La lista precedente resta recuperabile.');
    } catch (error) { setStatus('Ripristino non riuscito: ' + error.message, true); }
    finally { setBusy(false); }
  }

  async function open(deckRecord) {
    if (!store || !deckRecord) return;
    deck = { id: deckRecord.id, name: deckRecord.name };
    current = null;
    cards = new Map();
    $('archiveTitle').textContent = 'Lista di ' + deck.name;
    $('archivePaste').value = '';
    $('archiveMetrics').innerHTML = '';
    $('archiveCards').innerHTML = '';
    $('archiveCurve').innerHTML = '';
    setStatus('Apertura archivio…');
    $('archiveModal').classList.add('open');
    try {
      const loaded = await store.loadDeck(deck.id);
      if (!deck || deck.id !== deckRecord.id) return;
      current = loaded;
      $('archivePaste').value = loaded ? listAsText(loaded) : '';
      editor(!loaded);
      setStatus(loaded ?
        warningCount(loaded.entries.reduce((n, e) => n + e.quantity, 0)) +
        ' Le immagini sono recuperate online da Scryfall, i metadati già caricati sono disponibili offline.' :
        'Incolla una lista Moxfield. Sono supportate quantità, sezioni e codici set.');
      await renderArchive();
      await renderVersions();
    } catch (error) {
      editor(true);
      setStatus('Archivio IndexedDB non disponibile: ' + error.message +
        '. I mazzi e lo storico esistenti non sono stati modificati.', true);
    }
  }

  async function save() {
    if (busy || !deck) return;
    let parsed;
    try { parsed = store.parseDecklist($('archivePaste').value); }
    catch (error) { setStatus(error.message, true); return; }
    if (!parsed.entries.length) return setStatus('Non ho riconosciuto nessuna carta. Incolla righe come: 1 Sol Ring', true);
    if (parsed.ignored.length &&
        !confirm(parsed.ignored.length + ' righe non riconosciute (ad esempio riga ' +
          parsed.ignored.slice(0, 3).map(x => x.line).join(', ') + '). Ignorarle e salvare?')) return;
    if (parsed.total !== 100 &&
        !confirm('La lista contiene ' + parsed.total +
          ' carte anziché 100, comandante incluso. Vuoi salvarla comunque?')) return;
    setBusy(true);
    setStatus('Salvataggio della lista…');
    try {
      const deckId = deck.id;
      const next = await store.saveDeck(deckId, parsed.entries, $('archivePaste').value);
      if (!deck || deck.id !== deckId) return;
      current = next;
      editor(false);
      setStatus('Lista salvata in IndexedDB. ' + warningCount(parsed.total) +
        ' Utilizza Esporta per salvare anche una copia esterna completa.');
      await renderArchive();
      await renderVersions();
      if (window.DeckCycleApp) window.DeckCycleApp.onListSaved(deckId, next.updatedAt);
      if (navigator.onLine !== false) await refresh(true);
    } catch (error) {
      setStatus('Lista non salvata: ' + error.message, true);
    } finally { setBusy(false); }
  }

  async function refresh(fromSave) {
    if (!current || !current.entries.length || (!fromSave && busy)) return;
    if (!fromSave) setBusy(true);
    const deckId = deck && deck.id;
    try {
      setStatus('Recupero delle carte tramite Scryfall…');
      const result = await store.fetchScryfall(current.entries, (done, total) => {
        if (deck && deck.id === deckId) setStatus('Scryfall: ' + done + '/' + total + ' carte consultate…');
      });
      if (!deck || deck.id !== deckId) return;
      await renderArchive();
      const summary = store.summarize(current.entries, cards);
      setStatus((result.offline ? 'Offline: ' : 'Dati aggiornati. ') +
        summary.known + '/' + summary.total + ' carte identificate' +
        (result.unresolved.length ? '; non trovate: ' + result.unresolved.slice(0, 5).join(', ') +
          (result.unresolved.length > 5 ? '…' : '') : '') + '.', !!result.unresolved.length);
    } catch (error) {
      setStatus(error.message, true);
      await renderArchive();
    } finally {
      if (!fromSave) setBusy(false);
    }
  }

  function init() {
    $('archiveEditBtn').addEventListener('click', () => editor($('archiveEditor').classList.contains('hide')));
    $('archiveSaveBtn').addEventListener('click', save);
    $('archiveRefreshBtn').addEventListener('click', () => refresh(false));
    $('archiveVersionSaveBtn').addEventListener('click', saveVersion);
    $('archiveVersionCompareBtn').addEventListener('click', compareVersion);
    $('archiveVersionRestoreBtn').addEventListener('click', restoreVersion);
    $('archiveCards').addEventListener('click',e=>{
      const button=e.target.closest('[data-role-name]');
      if(button)editCardRoles(button.dataset.roleName);
    });
    $('archiveImagesBtn').addEventListener('click', async () => {
      imagesVisible = !imagesVisible;
      $('archiveImagesBtn').textContent = imagesVisible ? 'Nascondi immagini' : 'Mostra immagini';
      await renderArchive();
    });
    $('archiveCloseBtn').addEventListener('click', () => { deck = null; current = null; });
    $('archiveModal').addEventListener('click', e => {
      if (e.target === $('archiveModal')) { deck = null; current = null; }
    });
  }

  window.DeckCycleArchiveUI = { init, open };
})();
