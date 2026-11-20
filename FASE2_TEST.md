# DeckCycle — Fase 2: PWA, offline e aggiornamenti

**Base:** `fase-1-rotazione-storico`. La Fase 0 e la Fase 1 non sono ancora
state testate su iPhone: questa fase non va integrata o pubblicata finché non
sono stati verificati i dati reali e conservato un backup JSON esterno.

## File modificati

- `sw.js`: versione cache `deckcycle-phase2-v1`, precache obbligatorio
  di `index.html`, `safeguards.js`, `pwa.js`, `manifest.webmanifest`;
  cache accessoria delle icone; fetch network-first con fallback locale per
  pagine e asset noti; le risorse esterne, inclusa Scryfall, restano fuori.
  Non usa `skipWaiting()` automaticamente: il worker in attesa si attiva
  quando l'utente decide di aggiornare tramite il pulsante.
- `pwa.js`: registra il worker, controlla aggiornamenti all'apertura e
  quando la PWA torna visibile (con intervallo minimo fra le verifiche);
  banner **Aggiorna** in caso di worker in attesa; ricarica **solo** dopo
  consenso e dopo il cambio di controllo; avviso offline indicativo.
- `index.html`: aggiunge un piccolo banner di stato e carica `pwa.js`
  dopo il codice principale.
- `manifest.webmanifest`: esplicita `id`, `scope`, `lang` e descrizione;
  conserva `start_url`, colori, nome, icone e modalità standalone.

## Test simulati eseguiti

- Sintassi JavaScript degli script; parsing JSON del manifest.
- Service worker: installazione degli asset essenziali, nessuna attivazione
  anticipata, pulizia delle vecchie cache, apertura offline dell'HTML e
  lettura offline del modulo JS, esclusione di Scryfall, priorità di rete
  quando disponibile, messaggio di aggiornamento manuale.
- Interfaccia: registrazione del service worker, rilevamento dell'aggiornamento
  pronto, nessun ricaricamento automatico, richiesta di aggiornamento su clic,
  un solo ricaricamento dopo cambio di controller, avviso offline.

**Sono prove simulate, non dimostrano ancora il corretto funzionamento in Safari iOS.**

## Checklist reale su iPhone (quando deciderai di testare)

1. **Prima di provare**: apri DeckCycle ufficiale ed esporta il tuo JSON
   con **Esporta**. Salvalo nell'app File/iCloud Drive. Non eliminare o
   reinstallare la PWA attuale.
2. Apri su Safari **l'URL di anteprima della Pull Request della Fase 2**,
   non `deckcycle.netlify.app`. L'anteprima ha un'**origine diversa** e
   quindi un archivio locale diverso. Importa il backup SOLO nella preview.
3. Con Internet attivo, carica completamente la pagina e verifica il pulsante
   **Copie**, i mazzi, il sorteggio, la correzione dei risultati e lo storico.
4. Usa **Condividi → Aggiungi alla schermata Home** dalla pagina della preview,
   se disponibile, per testare la PWA senza toccare quella ufficiale.
5. Dopo almeno un'apertura **online** della PWA di anteprima, chiudila, attiva
   la Modalità aereo, poi riaprila. DeckCycle e i mazzi salvati dovrebbero
   essere disponibili; artwork Scryfall non già presenti/cached potrebbero
   non caricarsi. Prova una partita di test offline.
6. Riattiva Internet, riapri DeckCycle e controlla che il risultato salvato
   offline sia ancora nello storico.
7. Con una nuova versione pubblicata **solo sulla preview** (non su main),
   passa a un'altra app e torna in DeckCycle, oppure riaprila online.
   Se compare **Aggiorna**, assicurati di aver terminato le operazioni
   e premilo. La pagina dovrebbe ricaricarsi una sola volta.
8. Verifica che i mazzi importati, risultati, backup e preferenze non siano
   cambiati dopo l'aggiornamento.
9. Su Safari desktop: DevTools → Application → Service Workers / Cache Storage
   per osservare cache e worker (facoltativo).

## Limiti e precauzioni

- Le immagini di Scryfall e la ricerca delle carte richiedono connessione
  e non sono garantite offline, anche se la pagina è offline-ready.
- `navigator.onLine` è un indicatore approssimativo di connessione:
  può essere online anche se Internet non è realmente raggiungibile.
- Le copie automatiche e lo storico restano nel localStorage del dispositivo;
  la cache PWA non è un sistema di backup.
- **Non usare** "Cancella dati siti web", "Elimina app" o "Disinstalla"
  per forzare gli aggiornamenti: rischieresti di eliminare i dati locali.
- Se il service worker non installa, l'app può continuare a funzionare online,
  ma la modalità offline non sarà garantita.
- Le modifiche alle risorse offline che richiedono un nuovo worker devono
  incrementare `CACHE_NAME` in `sw.js` quando sono pronte per il rilascio.
