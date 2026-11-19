/* DeckCycle — Fase 2: installazione e aggiornamenti PWA.
   Nessuna modifica ai dati salvati, nessun reload automatico durante l'uso. */
(function () {
  'use strict';

  var container = document.getElementById('pwaStatus');
  var message = document.getElementById('pwaStatusText');
  var updateButton = document.getElementById('pwaUpdateBtn');
  var registration = null;
  var reloadRequested = false;
  var reloading = false;
  var errorMessage = '';
  var checkedAt = 0;
  var CHECK_INTERVAL_MS = 30 * 60 * 1000;

  if (!container || !message || !updateButton) return;

  function newWorkerWaiting() {
    return !!(registration && registration.waiting && navigator.serviceWorker &&
      navigator.serviceWorker.controller);
  }

  function showBanner() {
    var text = '';
    var shouldOfferUpdate = newWorkerWaiting();
    if (shouldOfferUpdate) {
      text = '✨ Una nuova versione di DeckCycle è pronta. Salva le modifiche in corso, poi scegli Aggiorna.';
    } else if (navigator.onLine === false) {
      text = '📴 Sei offline: puoi usare i mazzi e i dati già salvati. Le immagini e le ricerche Scryfall richiedono Internet.';
    } else if (errorMessage) {
      text = errorMessage;
    }
    container.classList.toggle('hide', !text);
    message.textContent = text;
    updateButton.hidden = !shouldOfferUpdate;
    updateButton.disabled = reloadRequested;
    if (shouldOfferUpdate && reloadRequested) {
      updateButton.textContent = 'Aggiornamento…';
    } else {
      updateButton.textContent = 'Aggiorna';
    }
  }

  function observeInstalling() {
    if (!registration || !registration.installing) return;
    var worker = registration.installing;
    worker.addEventListener('statechange', function () {
      if (worker.state === 'installed') {
        // Alla prima installazione non forziamo un refresh.
        showBanner();
      }
    });
  }

  function checkForUpdate(force) {
    if (!registration || navigator.onLine === false || document.visibilityState === 'hidden') return;
    var now = Date.now();
    if (!force && now - checkedAt < CHECK_INTERVAL_MS) return;
    checkedAt = now;
    registration.update().then(function () {
      errorMessage = '';
      showBanner();
    }).catch(function () {
      // Una disconnessione temporanea non deve ostacolare il normale utilizzo.
    });
  }

  updateButton.addEventListener('click', function () {
    if (!newWorkerWaiting() || reloadRequested) return;
    reloadRequested = true;
    showBanner();
    try {
      registration.waiting.postMessage({ type: 'DECKCYCLE_APPLY_UPDATE' });
    } catch (error) {
      reloadRequested = false;
      errorMessage = 'Aggiornamento non avviato. Chiudi e riapri DeckCycle quando hai finito.';
      showBanner();
    }
  });

  window.addEventListener('offline', showBanner);
  window.addEventListener('online', function () {
    showBanner();
    checkForUpdate(true);
  });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      showBanner();
      checkForUpdate(false);
    }
  });

  if (!('serviceWorker' in navigator) ||
      (location.protocol !== 'https:' && location.hostname !== 'localhost')) {
    // La pagina resta utilizzabile online anche senza supporto PWA.
    showBanner();
    return;
  }

  navigator.serviceWorker.addEventListener('controllerchange', function () {
    // Solo un clic esplicito dell'utente può provocare il ricaricamento.
    if (!reloadRequested || reloading) return;
    reloading = true;
    location.reload();
  });

  window.addEventListener('load', function () {
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
      .then(function (reg) {
        registration = reg;
        errorMessage = '';
        observeInstalling();
        reg.addEventListener('updatefound', function () {
          observeInstalling();
        });
        showBanner();
        checkForUpdate(true);
      }).catch(function () {
        errorMessage = 'La modalità offline non è disponibile in questo momento. DeckCycle resta utilizzabile online.';
        showBanner();
      });
  });
  showBanner();
})();