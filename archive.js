/* DeckCycle Fase 3 — archivio carte locale in IndexedDB.
 * Il salvataggio principale di mazzi e storico rimane in localStorage.
 * Nessuna chiave API o dipendenza esterna. */
(function () {
  'use strict';
  const DB_NAME = 'deckcycle_archive_v1';
  const DB_VERSION = 3;
  const MAX_ENTRIES = 600;
  const CARD_AGE = 90 * 86400000;
  const GROUPS = ['Creature', 'Planeswalker', 'Artefatti', 'Incantesimi', 'Istantanei', 'Stregonerie', 'Terre', 'Battaglie', 'Altro'];
  let opening;
  let exportSnapshot = null;
  let exporting = null;

  function open() {
    if (!('indexedDB' in window) || !window.indexedDB) {
      return Promise.reject(new Error('IndexedDB non è disponibile in questo browser.'));
    }
    if (opening) return opening;
    opening = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('lists')) db.createObjectStore('lists', { keyPath: 'deckId' });
        if (!db.objectStoreNames.contains('cards')) db.createObjectStore('cards', { keyPath: 'cacheKey' });
        if (!db.objectStoreNames.contains('revisions')) db.createObjectStore('revisions', { keyPath: 'id', autoIncrement: true });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('artworks')) db.createObjectStore('artworks', { keyPath: 'deckId' });
        if (!db.objectStoreNames.contains('roles')) db.createObjectStore('roles', { keyPath: 'id' });
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); opening = null; };
        resolve(db);
      };
      request.onerror = () => reject(request.error || new Error('Impossibile aprire IndexedDB.'));
      request.onblocked = () => reject(new Error('Chiudi le altre schede DeckCycle per sbloccare l’archivio.'));
    }).catch(error => { opening = null; throw error; });
    return opening;
  }

  async function getAll(store) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const request = db.transaction(store, 'readonly').objectStore(store).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function get(store, key) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const request = db.transaction(store, 'readonly').objectStore(store).get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  function txResult(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(true);
      tx.onabort = () => reject(tx.error || new Error('Scrittura IndexedDB annullata.'));
      tx.onerror = () => { /* onabort fornirà l’errore */ };
    });
  }

  function normalizeEntry(entry) {
    if (!entry || typeof entry !== 'object') throw new Error('Carta mancante.');
    const name = String(entry.name || '').trim().replace(/\s+/g, ' ');
    const quantity = Number(entry.quantity);
    if (!name || name.length > 220 || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      throw new Error('Quantità o nome carta non valido.');
    }
    const section = entry.section === 'Commander' ? 'Commander' : 'Deck';
    const set = String(entry.set || '').trim().toLowerCase();
    const collector = String(entry.collector || '').trim();
    if (set && !/^[a-z0-9]{2,8}$/.test(set)) throw new Error('Codice espansione non valido.');
    if (collector && !/^[a-z0-9★\-]{1,16}$/i.test(collector)) throw new Error('Numero collezione non valido.');
    return { name, quantity, section, set, collector };
  }

  function parseDecklist(text) {
    const entries = new Map();
    const ignored = [];
    const source = String(text || '').replace(/\r/g, '').replace(/^\uFEFF/, '');
    if (source.length > 120000) throw new Error('Elenco troppo lungo.');
    let section = 'Deck';
    let skip = false;
    source.split('\n').forEach((line, index) => {
      let value = line.trim();
      if (!value || /^\/\/(?!\s*\d)/.test(value) || /^#/.test(value)) return;
      value = value.replace(/^[*•]\s*/, '');
      const heading = value.replace(/:$/, '').toLowerCase();
      if (/^(commander|commanders|comandante|comandanti)$/.test(heading)) {
        section = 'Commander'; skip = false; return;
      }
      if (/^(deck|mainboard|main|mazzo|creatures|artifacts|enchantments|instants|sorceries|planeswalkers|lands|battles)$/.test(heading)) {
        section = 'Deck'; skip = false; return;
      }
      if (/^(sideboard|maybeboard|considering|tokens|token|companion|companions)$/.test(heading)) {
        skip = true; return;
      }
      if (skip) return;
      const match = /^(\d{1,3})\s*x?\s+(.+)$/i.exec(value);
      if (!match) { ignored.push({ line: index + 1, value }); return; }
      let rest = match[2].replace(/\s+\*(?:F|E)\*\s*$/i, '').trim();
      let set = '', collector = '';
      const setMatch = /\s+[\(\[]([a-z0-9]{2,8})[\)\]](?:\s+([0-9a-z★\-]{1,16}))?\s*$/i.exec(rest);
      if (setMatch) {
        set = setMatch[1].toLowerCase();
        collector = setMatch[2] || '';
        rest = rest.slice(0, setMatch.index).trim();
      }
      try {
        const normalized = normalizeEntry({ name: rest, quantity: Number(match[1]), section, set, collector });
        const key = [normalized.name.toLowerCase(), section, set, collector].join('|');
        if (entries.has(key)) {
          const previous = entries.get(key);
          previous.quantity += normalized.quantity;
          if (previous.quantity > 99) throw new Error('Quantità totale oltre 99.');
        } else {
          entries.set(key, normalized);
        }
      } catch (error) {
        ignored.push({ line: index + 1, value, reason: error.message });
      }
    });
    if (entries.size > MAX_ENTRIES) throw new Error('Troppe carte per una lista.');
    const cards = Array.from(entries.values());
    return { entries: cards, ignored, total: cards.reduce((n, card) => n + card.quantity, 0) };
  }

  function asList(record) {
    if (!record || typeof record !== 'object' || !record.deckId ||
        typeof record.deckId !== 'string' || record.deckId.length > 250 ||
        !Array.isArray(record.entries) || record.entries.length > MAX_ENTRIES) {
      throw new Error('Archivio carte non valido.');
    }
    const entries = record.entries.map(normalizeEntry);
    return {
      deckId: record.deckId,
      entries,
      raw: typeof record.raw === 'string' ? record.raw.slice(0, 120000) : '',
      updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : new Date().toISOString(),
      schemaVersion: 1
    };
  }

  async function loadDeck(deckId) {
    return get('lists', String(deckId));
  }

  async function saveDeck(deckId, entries, raw) {
    const payload = asList({ deckId, entries, raw, updatedAt: new Date().toISOString() });
    const db = await open();
    const tx = db.transaction(['lists', 'revisions'], 'readwrite');
    const listStore = tx.objectStore('lists');
    let previous=null;
    const request = listStore.get(payload.deckId);
    request.onsuccess = () => {
      if (request.result) {
        previous=request.result;
        tx.objectStore('revisions').add({
          deckId: payload.deckId, at: Date.now(), reason: 'Prima della modifica', snapshot: request.result
        });
      }
      listStore.put(payload);
    };
    await txResult(tx);
    if (exportSnapshot) {
      if(previous){
        exportSnapshot.revisions=exportSnapshot.revisions || [];
        exportSnapshot.revisions.unshift({
          deckId:payload.deckId,at:Date.now(),reason:'Prima della modifica',snapshot:previous
        });
      }
      const i = exportSnapshot.lists.findIndex(item => item.deckId === payload.deckId);
      if (i === -1) exportSnapshot.lists.push(payload);
      else exportSnapshot.lists[i] = payload;
    }
    return payload;
  }

  async function saveBaseline(state) {
    const db = await open();
    const tx = db.transaction('meta', 'readwrite');
    const meta = tx.objectStore('meta');
    const req = meta.get('legacy-state-first-import');
    req.onsuccess = () => {
      if (!req.result) {
        meta.put({
          key: 'legacy-state-first-import',
          at: new Date().toISOString(),
          note: 'Copia iniziale dei mazzi e delle partite locali. Il salvataggio originale non viene eliminato.',
          state: JSON.parse(JSON.stringify(state))
        });
      }
    };
    await txResult(tx);
  }

  async function exportAll() {
    const [lists, artworks, revisions, roles] = await Promise.all([
      getAll('lists'), getAll('artworks'), getAll('revisions'), getAll('roles')
    ]);
    // Evita backup illimitati: mantenere solo le ultime 12 versioni per mazzo.
    const byDeck = new Map();
    revisions.sort((a, b) => (b.at || 0) - (a.at || 0)).forEach(item => {
      if (!item || !item.snapshot || !item.deckId) return;
      const arr = byDeck.get(item.deckId) || [];
      if (arr.length < 12) arr.push({
        deckId: item.deckId, at: item.at, reason: item.reason || '',
        snapshot: asList(item.snapshot)
      });
      byDeck.set(item.deckId, arr);
    });
    return {
      schemaVersion: 2,
      lists: lists.map(asList),
      artworks: artworks.map(validateArtwork),
      revisions: Array.from(byDeck.values()).flat(),
      roles: roles.map(validateRole)
    };
  }

  function warmExport() {
    if (exporting) return exporting;
    exporting = exportAll().then(data => {
      exportSnapshot = data;
      return data;
    }).finally(() => { exporting = null; });
    return exporting;
  }

  function readyExport() {
    // Restituisce una fotografia sincrona: non perde la user gesture
    // richiesta dal menu Condividi di Safari/iOS.
    return exportSnapshot ? {
      schemaVersion: exportSnapshot.schemaVersion,
      lists: exportSnapshot.lists.map(item => ({
        ...item, entries: item.entries.map(entry => ({ ...entry }))
      })),
      artworks: (exportSnapshot.artworks || []).map(item => ({...item})),
      roles: (exportSnapshot.roles || []).map(item => ({...item, categories:[...item.categories]})),
      revisions: (exportSnapshot.revisions || []).map(item => ({
        ...item, snapshot: {...item.snapshot, entries: item.snapshot.entries.map(entry => ({...entry}))}
      }))
    } : null;
  }

  function validateArtwork(item) {
    if (!item || typeof item.deckId !== 'string' || !item.deckId ||
        item.deckId.length > 250 || typeof item.dataUrl !== 'string' ||
        item.dataUrl.length > 550000 ||
        !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(item.dataUrl)) {
      throw new Error('Artwork personalizzato non valido o troppo grande.');
    }
    return {
      deckId: item.deckId, dataUrl: item.dataUrl,
      name: String(item.name || 'Artwork personalizzato').slice(0, 200),
      at: String(item.at || new Date().toISOString())
    };
  }

  const ROLE_KEYS = ['ramp','draw','removal','protection','recursion'];
  function validateRole(item) {
    if(!item || typeof item.deckId !== 'string' || item.deckId.length > 250 ||
        !item.deckId || typeof item.name !== 'string' || item.name.length > 220 ||
        !item.name.trim() || !Array.isArray(item.categories) ||
        item.categories.some(tag => !ROLE_KEYS.includes(tag))) {
      throw new Error('Classificazione personale non valida nel backup.');
    }
    return {
      id:item.deckId+'|'+item.name.toLowerCase().normalize('NFKC'),
      deckId:item.deckId,name:item.name,categories:[...new Set(item.categories)]
    };
  }

  async function getRoleOverrides(deckId) {
    const items=await getAll('roles');
    return new Map(items.filter(x=>x.deckId===deckId)
      .map(x=>[x.name.toLowerCase().normalize('NFKC'),x.categories]));
  }
  async function setRoleOverride(deckId,name,categories) {
    const item=validateRole({deckId,name,categories});
    const db=await open();
    const tx=db.transaction('roles','readwrite');
    tx.objectStore('roles').put(item);
    await txResult(tx);
    if(exportSnapshot){
      const i=(exportSnapshot.roles||[]).findIndex(x=>x.id===item.id);
      if(i<0)exportSnapshot.roles.push(item);else exportSnapshot.roles[i]=item;
    }
    return item;
  }

  async function clearRoleOverride(deckId,name) {
    const id=String(deckId)+'|'+String(name).toLowerCase().normalize('NFKC');
    const db=await open();
    const tx=db.transaction('roles','readwrite');
    tx.objectStore('roles').delete(id);
    await txResult(tx);
    if(exportSnapshot) exportSnapshot.roles=(exportSnapshot.roles||[]).filter(x=>x.id!==id);
    return true;
  }

  function validateBackupArchive(archive) {
    if (archive == null) return { schemaVersion: 1, lists: [], artworks: [], revisions: [], roles: [] };
    if (!archive || ![1,2].includes(archive.schemaVersion) ||
        !Array.isArray(archive.lists) || archive.lists.length > 2000) {
      throw new Error('Formato delle liste nel backup non riconosciuto.');
    }
    const seen = new Set();
    const lists = archive.lists.map(item => {
      const row = asList(item);
      if (seen.has(row.deckId)) throw new Error('Lista duplicata nel backup.');
      seen.add(row.deckId);
      return row;
    });
    const arts = archive.artworks || [];
    const versions = archive.revisions || [];
    const manualRoles = archive.roles || [];
    if (!Array.isArray(arts) || arts.length > 80 ||
        !Array.isArray(versions) || versions.length > 3000 ||
        !Array.isArray(manualRoles) || manualRoles.length > 4000) {
      throw new Error('Troppe immagini o versioni nel backup.');
    }
    const artworkIds = new Set();
    const artworks = arts.map(item => {
      const art = validateArtwork(item);
      if (artworkIds.has(art.deckId)) throw new Error('Artwork duplicato nel backup.');
      artworkIds.add(art.deckId);
      return art;
    });
    const revisions = versions.map(item => {
      if (!item || typeof item.deckId !== 'string' || !item.snapshot ||
          item.snapshot.deckId !== item.deckId) throw new Error('Versione non valida nel backup.');
      return { deckId: item.deckId, at: Number(item.at)||Date.now(),
        reason: String(item.reason || '').slice(0, 150), snapshot: asList(item.snapshot) };
    });
    const roles=manualRoles.map(validateRole);
    return { schemaVersion: archive.schemaVersion, lists, artworks, revisions, roles };
  }

  async function importAll(archive) {
    const validated = validateBackupArchive(archive);
    const { lists, artworks, revisions, roles } = validated;
    if (!lists.length && !artworks.length && !revisions.length && !roles.length) return 0;
    // Un'unica transazione IndexedDB atomica: nessun import parziale.
    const db = await open();
    const tx = db.transaction(['lists', 'revisions', 'artworks', 'roles'], 'readwrite');
    const listStore = tx.objectStore('lists');
    lists.forEach(item => {
      const req = listStore.get(item.deckId);
      req.onsuccess = () => {
        if (req.result) tx.objectStore('revisions').add({
          deckId: item.deckId, at: Date.now(), reason: 'Prima di importare backup', snapshot: req.result
        });
        listStore.put(item);
      };
    });
    artworks.forEach(item => tx.objectStore('artworks').put(item));
    revisions.forEach(item => tx.objectStore('revisions').add(item));
    roles.forEach(item => tx.objectStore('roles').put(item));
    await txResult(tx);
    if (exportSnapshot) {
      lists.forEach(item => {
        const i = exportSnapshot.lists.findIndex(saved => saved.deckId === item.deckId);
        if (i === -1) exportSnapshot.lists.push(item);
        else exportSnapshot.lists[i] = item;
      });
      artworks.forEach(item => {
        const i = (exportSnapshot.artworks || []).findIndex(saved => saved.deckId === item.deckId);
        if (i === -1) exportSnapshot.artworks.push(item);
        else exportSnapshot.artworks[i] = item;
      });
      roles.forEach(item => {
        const i=(exportSnapshot.roles||[]).findIndex(saved=>saved.id===item.id);
        if(i<0)exportSnapshot.roles.push(item);else exportSnapshot.roles[i]=item;
      });
      exportSnapshot.revisions = null;
      warmExport().catch(() => {});
    }
    return lists.length;
  }

  async function listRevisions(deckId) {
    const data = (await getAll('revisions')).filter(x => x.deckId === String(deckId) && x.snapshot);
    return data.sort((a, b) => (b.at || 0) - (a.at || 0) || (b.id || 0) - (a.id || 0)).slice(0, 30);
  }

  async function labelVersion(deckId, reason) {
    const snapshot = await loadDeck(deckId);
    if (!snapshot) throw new Error('Salva prima una lista di carte.');
    const db = await open();
    const tx = db.transaction('revisions', 'readwrite');
    tx.objectStore('revisions').add({
      deckId: String(deckId), at: Date.now(),
      reason: String(reason || 'Versione salvata').slice(0, 150),
      snapshot: asList(snapshot)
    });
    await txResult(tx);
    // Aggiorna snapshot prima della prossima esportazione.
    if (exportSnapshot) exportSnapshot.revisions = (await getAll('revisions'))
      .sort((a,b)=>(b.at||0)-(a.at||0)).slice(0,100);
    return true;
  }

  async function restoreVersion(deckId, revisionId) {
    const item = await get('revisions', Number(revisionId));
    if (!item || item.deckId !== deckId || !item.snapshot) throw new Error('Versione non trovata.');
    return saveDeck(deckId, item.snapshot.entries, item.snapshot.raw);
  }

  async function setArtwork(deckId, dataUrl, name) {
    const art = validateArtwork({ deckId, dataUrl, name, at: new Date().toISOString() });
    const db = await open();
    const tx = db.transaction('artworks', 'readwrite');
    tx.objectStore('artworks').put(art);
    await txResult(tx);
    if (exportSnapshot) {
      const i = (exportSnapshot.artworks || []).findIndex(x => x.deckId === art.deckId);
      if (i < 0) exportSnapshot.artworks.push(art); else exportSnapshot.artworks[i] = art;
    }
    return art;
  }

  async function loadArtwork(deckId) {
    return get('artworks', String(deckId));
  }

  async function removeArtwork(deckId) {
    const db = await open();
    const tx = db.transaction('artworks', 'readwrite');
    tx.objectStore('artworks').delete(String(deckId));
    await txResult(tx);
    if (exportSnapshot) exportSnapshot.artworks = (exportSnapshot.artworks || []).filter(x => x.deckId !== deckId);
    return true;
  }

  function keyOf(entry) {
    return [entry.name.toLowerCase().normalize('NFKC'), entry.set || '', entry.collector || ''].join('|');
  }

  function smallCard(card) {
    const face = card.card_faces && card.card_faces[0];
    const images = card.image_uris || (face && face.image_uris) || {};
    return {
      name: card.name || '', type: card.type_line || '',
      manaCost: card.mana_cost || (face && face.mana_cost) || '',
      oracleText: card.oracle_text || (card.card_faces || []).map(f => f.oracle_text || '').join(' / ') || '',
      keywords: Array.isArray(card.keywords) ? card.keywords.slice(0, 40) : [],
      cmc: Number(card.cmc) || 0,
      image: images.small || images.normal || '',
      scryfall: card.scryfall_uri || '',
      oracleId: card.oracle_id || '',
      set: card.set || '',
      collector: String(card.collector_number || '')
    };
  }

  async function cachedCards(entries) {
    const cards = await getAll('cards');
    const lookup = new Map(cards.map(item => [item.cacheKey, item]));
    const found = new Map();
    entries.forEach(e => {
      const saved = lookup.get(keyOf(e));
      if (saved) found.set(keyOf(e), saved);
    });
    return found;
  }

  function matchingCard(list, entry) {
    const name = entry.name.toLowerCase();
    return list.find(card => {
      if (entry.set && entry.collector &&
          card.set === entry.set && String(card.collector_number || '').toLowerCase() === entry.collector.toLowerCase()) return true;
      if (String(card.name || '').toLowerCase() !== name &&
          !((card.card_faces || []).some(face => String(face.name || '').toLowerCase() === name))) return false;
      return !entry.set || card.set === entry.set;
    }) || null;
  }

  async function fetchScryfall(entries, onProgress) {
    if (!Array.isArray(entries) || entries.length > MAX_ENTRIES) throw new Error('Elenco carte troppo lungo.');
    const found = await cachedCards(entries);
    const missing = [...new Map(entries.filter(e => {
      const value = found.get(keyOf(e));
      return !value || Date.now() - value.cachedAt > CARD_AGE;
    }).map(e => [keyOf(e), e])).values()];
    if (missing.length && navigator.onLine === false) {
      return { cards: found, unresolved: missing.map(e => e.name), offline: true };
    }
    const unresolved = [];
    for (let start = 0; start < missing.length; start += 75) {
      const batch = missing.slice(start, start + 75);
      if (start > 0) await new Promise(resolve => setTimeout(resolve, 650));
      const identifiers = batch.map(e => e.set && e.collector ?
        { set: e.set, collector_number: e.collector } :
        e.set ? { name: e.name, set: e.set } : { name: e.name });
      let result;
      try {
        const response = await fetch('https://api.scryfall.com/cards/collection', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ identifiers })
        });
        if (!response.ok) throw new Error('Scryfall: HTTP ' + response.status);
        result = await response.json();
        if (!Array.isArray(result.data)) throw new Error('Risposta Scryfall non valida.');
      } catch (error) {
        throw new Error('Impossibile ottenere i dati da Scryfall. Le liste restano salvate. ' + error.message);
      }
      const write = [];
      for (const entry of batch) {
        const card = matchingCard(result.data, entry);
        if (card) {
          const record = { ...smallCard(card), cacheKey: keyOf(entry), cachedAt: Date.now() };
          found.set(record.cacheKey, record);
          write.push(record);
        } else {
          unresolved.push(entry.name);
        }
      }
      if (write.length) {
        const db = await open();
        const tx = db.transaction('cards', 'readwrite');
        write.forEach(card => tx.objectStore('cards').put(card));
        await txResult(tx);
      }
      if (typeof onProgress === 'function') onProgress(Math.min(start + batch.length, missing.length), missing.length);
    }
    return { cards: found, unresolved, offline: false };
  }

  function category(card) {
    if (!card) return 'Altro';
    const t = card.type || '';
    if (/\bLand\b/i.test(t)) return 'Terre';
    if (/\bCreature\b/i.test(t)) return 'Creature';
    if (/\bPlaneswalker\b/i.test(t)) return 'Planeswalker';
    if (/\bArtifact\b/i.test(t)) return 'Artefatti';
    if (/\bEnchantment\b/i.test(t)) return 'Incantesimi';
    if (/\bInstant\b/i.test(t)) return 'Istantanei';
    if (/\bSorcery\b/i.test(t)) return 'Stregonerie';
    if (/\bBattle\b/i.test(t)) return 'Battaglie';
    return 'Altro';
  }

  function summarize(entries, cards) {
    const counts = Object.fromEntries(GROUPS.map(key => [key, 0]));
    const curve = Array.from({ length: 7 }, () => 0);
    let total = 0, known = 0, spells = 0, manaTotal = 0;
    for (const entry of entries) {
      const qty = entry.quantity || 0;
      total += qty;
      const card = cards.get(keyOf(entry));
      if (!card) continue;
      known += qty;
      const group = category(card);
      counts[group] += qty;
      if (group !== 'Terre') {
        spells += qty;
        manaTotal += card.cmc * qty;
        curve[Math.min(6, Math.max(0, Math.floor(card.cmc)))] += qty;
      }
    }
    return {
      total, known, missing: total - known,
      categories: GROUPS.map(name => ({ name, count: counts[name] })).filter(x => x.count),
      curve, avgMana: spells ? (manaTotal / spells).toFixed(2) : null,
      spells
    };
  }

  window.DeckCycleArchive = {
    open, parseDecklist, saveBaseline, loadDeck, saveDeck, exportAll, warmExport, readyExport,
    validateBackupArchive, importAll, cachedCards, fetchScryfall, summarize, category, keyOf,
    listRevisions, labelVersion, restoreVersion, loadArtwork, setArtwork, removeArtwork,
    getRoleOverrides, setRoleOverride, clearRoleOverride
  };
})();
