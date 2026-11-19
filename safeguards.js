/* DeckCycle — Fase 0: protezione dati.
   Nessuna dipendenza, nessuna modifica globale a Storage.prototype.
   Le copie sono locali: per un backup esterno usare Esporta. */
(function () {
  'use strict';

  var SNAP_KEY = 'deckcycle_snapshots_v1';
  var MAX_SNAPSHOTS = 6;
  var SCHEMA_VERSION = 1;
  var MAX_DECKS = 2000;
  var MAX_GAMES = 200000;
  var blocked = false;
  var warningText = '';
  var lastWarning = '';

  function fresh(defaults) {
    return Object.assign({}, defaults, {
      decks: [],
      history: [],
      filters: Object.assign({}, defaults.filters || {}),
      schemaVersion: SCHEMA_VERSION
    });
  }

  function validate(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('Formato dati non riconosciuto');
    if (!Array.isArray(data.decks) || !Array.isArray(data.history)) throw Error('Mancano mazzi o storico');
    if (data.decks.length > MAX_DECKS || data.history.length > MAX_GAMES) throw Error('Backup oltre i limiti supportati');
    if (Number(data.schemaVersion || 1) > SCHEMA_VERSION) throw Error('Dati di una versione più recente: aggiornare DeckCycle');
    if (data.decks.some(function (d) { return !d || typeof d !== 'object' || typeof d.name !== 'string' || !d.name.trim(); })) {
      throw Error('Uno o più mazzi non sono validi');
    }
    if (data.history.some(function (h) { return !h || typeof h !== 'object' || (h.result !== 'win' && h.result !== 'loss'); })) {
      throw Error('Uno o più risultati non sono validi');
    }
    return data;
  }

  function parseAndValidate(raw) {
    return validate(JSON.parse(raw));
  }

  function notifyWarning(message) {
    warningText = message;
    var banner = document.getElementById('deckcycleStorageWarning');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'deckcycleStorageWarning';
      banner.setAttribute('role', 'alert');
      banner.style.cssText = 'position:relative;z-index:12;margin:0 auto 12px;padding:12px 15px;background:#553523;color:#fff4e7;border:1px solid #e5a45c;border-radius:14px;max-width:1220px;font:600 13px/1.45 system-ui,sans-serif';
      var app = document.querySelector('.app');
      if (app) app.insertBefore(banner, app.firstChild);
      else document.body.insertBefore(banner, document.body.firstChild);
    }
    banner.textContent = '⚠️ ' + message;
    if (lastWarning !== message) {
      lastWarning = message;
      console.warn('DeckCycle:', message);
    }
  }

  function clearWarning() {
    warningText = '';
    lastWarning = '';
    var banner = document.getElementById('deckcycleStorageWarning');
    if (banner) banner.remove();
  }

  function archiveCorrupt(key, raw) {
    try {
      localStorage.setItem(key + '_corrotto_' + Date.now(), raw);
      return true;
    } catch (error) {
      return false;
    }
  }

  function hydrate(input, defaults, normalizeDeck, uid) {
    validate(input);
    var next = Object.assign({}, defaults, input);
    next.decks = input.decks.map(normalizeDeck);
    next.history = input.history.map(function (h) {
      return Object.assign({}, h, { id: h.id || uid() });
    });
    next.filters = Object.assign({}, defaults.filters || {}, input.filters || {});
    next.schemaVersion = SCHEMA_VERSION;
    next.round = Number.isFinite(Number(next.round)) ? Math.max(1, Math.floor(Number(next.round))) : 1;
    if (['magic', 'dark', 'light'].indexOf(next.theme) === -1) next.theme = 'magic';
    if (!next.decks.some(function (d) { return d.id === next.selected; })) next.selected = null;
    return next;
  }

  function load(key, defaults, normalizeDeck, uid) {
    var raw;
    try {
      raw = localStorage.getItem(key);
    } catch (error) {
      blocked = true;
      notifyWarning('Safari non consente la lettura dei dati. Nessuna modifica verrà salvata: esporta una copia appena possibile.');
      return fresh(defaults);
    }
    if (!raw) return fresh(defaults);
    try {
      return hydrate(parseAndValidate(raw), defaults, normalizeDeck, uid);
    } catch (error) {
      blocked = true;
      var preserved = archiveCorrupt(key, raw);
      notifyWarning('Archivio locale illeggibile o non compatibile. I dati originali NON saranno sovrascritti.' +
        (preserved ? ' Ne ho salvata anche una copia separata.' : ' Non è stato possibile creare una copia aggiuntiva.') +
        ' Recupera un backup tramite Importa o Copie.');
      return fresh(defaults);
    }
  }

  function readSnapshots() {
    try {
      var list = JSON.parse(localStorage.getItem(SNAP_KEY) || '[]');
      return Array.isArray(list) ? list.filter(function (s) {
        return s && typeof s.raw === 'string' && typeof s.at === 'number';
      }) : [];
    } catch (error) { return []; }
  }

  function checkpoint(key, reason, required, force) {
    if (blocked) {
      if (required) notifyWarning('Archivio bloccato: non posso eseguire una modifica distruttiva senza salvare i dati.');
      return false;
    }
    var raw;
    try {
      raw = localStorage.getItem(key);
    } catch (error) {
      if (required) notifyWarning('Impossibile leggere i dati per crearne una copia.');
      return false;
    }
    if (!raw) return true;
    try { parseAndValidate(raw); }
    catch (error) {
      blocked = true;
      notifyWarning('Dati danneggiati rilevati prima del salvataggio. Scrittura bloccata per preservarli.');
      return false;
    }

    var list = readSnapshots();
    var last = list[list.length - 1];
    if (last && last.raw === raw) return true;
    if (!force && last && last.reason === 'Automatica' && Date.now() - last.at < 30 * 60 * 1000) return true;
    list.push({ at: Date.now(), reason: reason || 'Automatica', raw: raw });
    if (list.length > MAX_SNAPSHOTS) list = list.slice(-MAX_SNAPSHOTS);
    while (list.length) {
      try {
        localStorage.setItem(SNAP_KEY, JSON.stringify(list));
        return true;
      } catch (error) {
        if (list.length === 1) break;
        list.shift();
      }
    }
    if (required) notifyWarning('Memoria insufficiente per la copia di sicurezza. Operazione annullata: esporta prima i dati.');
    return false;
  }

  function save(key, state) {
    if (blocked) {
      notifyWarning('Salvataggio bloccato per proteggere i dati esistenti. Ripristina una copia o importa un backup valido.');
      return false;
    }
    var json;
    try {
      state.schemaVersion = SCHEMA_VERSION;
      json = JSON.stringify(state);
      var current = localStorage.getItem(key);
      if (json === current) return true;
      if (current) checkpoint(key, 'Automatica', false, false);
      localStorage.setItem(key, json);
      if (warningText) clearWarning();
      return true;
    } catch (error) {
      notifyWarning('Salvataggio NON riuscito (spazio pieno o memoria bloccata). Le modifiche potrebbero perdersi: usa Esporta.');
      return false;
    }
  }

  function downloadableBackup(json, fileName) {
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 3000);
  }

  function exportData(state) {
    var json, name, file;
    try {
      json = JSON.stringify({
        app: 'DeckCycle Deluxe', version: 5, schemaVersion: SCHEMA_VERSION,
        exportedAt: new Date().toISOString(), data: state
      }, null, 2);
      name = 'deckcycle-backup-' + new Date().toISOString().slice(0, 10) + '.json';
      if (typeof File === 'function') file = new File([json], name, { type: 'application/json' });
    } catch (error) {
      notifyWarning('Non riesco a preparare il backup: ' + error.message);
      return;
    }
    try {
      if (file && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: 'Backup DeckCycle' }).catch(function (error) {
          if (!error || error.name !== 'AbortError') downloadableBackup(json, name);
        });
      } else {
        downloadableBackup(json, name);
      }
    } catch (error) {
      downloadableBackup(json, name);
    }
  }

  async function importData(file, options) {
    if (!file) return false;
    if (file.size > 12 * 1024 * 1024) {
      notifyWarning('Backup troppo grande per questo archivio. Nessun dato modificato.');
      return false;
    }
    var next;
    try {
      var wrapper = JSON.parse(await file.text());
      var incoming = wrapper && wrapper.data ? wrapper.data : wrapper;
      next = hydrate(incoming, options.defaults, options.normalizeDeck, options.uid);
    } catch (error) {
      notifyWarning('Importazione annullata: ' + error.message);
      return false;
    }
    if (!confirm('Importare il backup \"' + file.name + '\"? Sostituirà mazzi e risultati presenti su questo dispositivo.')) return false;
    var old;
    try { old = localStorage.getItem(options.key); }
    catch (error) {
      notifyWarning('Non riesco a leggere i dati attuali. Importazione annullata.');
      return false;
    }
    if (old) {
      try {
        parseAndValidate(old);
        if (blocked) {
          notifyWarning('Archivio bloccato. Ripristina prima una copia leggibile.');
          return false;
        }
        if (!checkpoint(options.key, 'Prima di importare', true, true)) return false;
      } catch (error) {
        if (!archiveCorrupt(options.key, old)) {
          notifyWarning('Non riesco a conservare l’archivio danneggiato: importazione annullata.');
          return false;
        }
      }
    }
    try {
      localStorage.setItem(options.key, JSON.stringify(next));
    } catch (error) {
      notifyWarning('Importazione NON salvata: memoria insufficiente o accesso negato.');
      return false;
    }
    blocked = false;
    clearWarning();
    options.onSuccess(next);
    return true;
  }

  function restoreSnapshot(key, shot) {
    try { parseAndValidate(shot.raw); }
    catch (error) {
      notifyWarning('Questa copia non è valida e non può essere ripristinata.');
      return;
    }
    if (!confirm('Ripristinare questa copia? I dati attuali verranno sostituiti.')) return;
    var current;
    try { current = localStorage.getItem(key); }
    catch (error) {
      notifyWarning('Impossibile leggere i dati attuali. Ripristino annullato.');
      return;
    }
    if (current && !blocked && !checkpoint(key, 'Prima del ripristino', true, true)) return;
    if (current && blocked && !archiveCorrupt(key, current)) {
      notifyWarning('Impossibile preservare l’archivio danneggiato. Ripristino annullato.');
      return;
    }
    try {
      localStorage.setItem(key, shot.raw);
      location.reload();
    } catch (error) {
      notifyWarning('Ripristino non riuscito: spazio insufficiente o accesso negato.');
    }
  }

  function showCopies(key) {
    var list = readSnapshots().slice().reverse();
    if (!list.length) {
      alert('Non sono ancora presenti copie automatiche. Usa Esporta per avere anche un backup esterno.');
      return;
    }
    var overlay = document.createElement('div');
    overlay.className = 'modalBg open';
    overlay.id = 'deckcycleCopiesModal';
    var dialog = document.createElement('div');
    dialog.className = 'modal';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-label', 'Copie di sicurezza');
    var title = document.createElement('h2');
    title.textContent = 'Copie di sicurezza';
    var help = document.createElement('p');
    help.className = 'note';
    help.textContent = 'Massimo 6 copie locali. Non sostituiscono il backup Esporta: se iOS cancella i dati del sito, cancellerà anche le copie.';
    var close = document.createElement('button');
    close.className = 'pillBtn';
    close.textContent = 'Chiudi';
    close.type = 'button';
    close.addEventListener('click', function () { overlay.remove(); });
    dialog.appendChild(title);
    dialog.appendChild(help);
    list.forEach(function (shot) {
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px;margin:10px 0;padding:12px;border:1px solid var(--line);border-radius:14px;';
      var info = document.createElement('div');
      var obj;
      try { obj = parseAndValidate(shot.raw); } catch (error) { obj = null; }
      info.textContent = new Date(shot.at).toLocaleString('it-IT') + ' · ' +
        (obj ? obj.decks.length + ' mazzi · ' + obj.history.length + ' partite' : 'Copia non valida') +
        ' · ' + (shot.reason || 'Automatica');
      var button = document.createElement('button');
      button.className = 'pillBtn';
      button.textContent = 'Ripristina';
      button.disabled = !obj;
      button.type = 'button';
      button.addEventListener('click', function () { restoreSnapshot(key, shot); });
      row.appendChild(info);
      row.appendChild(button);
      dialog.appendChild(row);
    });
    dialog.appendChild(close);
    overlay.appendChild(dialog);
    overlay.addEventListener('click', function (event) { if (event.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  }

  function installCopiesButton(key) {
    var bar = document.querySelector('.topActions');
    if (!bar || document.getElementById('deckcycleCopiesButton')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pillBtn';
    btn.id = 'deckcycleCopiesButton';
    btn.textContent = 'Copie';
    btn.addEventListener('click', function () { showCopies(key); });
    bar.appendChild(btn);
    if (!blocked && !readSnapshots().length) checkpoint(key, 'Prima della Fase 0', false, true);
  }

  window.DeckCycleSafe = {
    load: load,
    save: save,
    checkpoint: checkpoint,
    exportData: exportData,
    importData: importData,
    installCopiesButton: installCopiesButton
  };
})();
