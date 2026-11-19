# Verifica DeckCycle Complete RC1 — prima della pubblicazione

**Non testare le eliminazioni sull'app principale.** Usa solo la Deploy Preview collegata alla Pull Request della versione completa. Esporta un JSON dell'app ufficiale e conservalo in File/iCloud Drive prima di iniziare.

## A. Protezione e ripristino

- [ ] Carica la preview Netlify online e verifica che compaiano Gioca/Mazzi/Partite/Analisi/Altro.
- [ ] Importa un backup esistente: mazzi, partite, filtri e statistiche devono comparire.
- [ ] In una preview con dati di prova crea un mazzo, registra una partita, elimina il risultato, controlla **Copie**.
- [ ] Rifiuta una conferma di importazione e verifica che i dati non cambino.
- [ ] Esporta un backup su iPhone tramite menu Condividi → Salva su File; controlla che il JSON sia realmente disponibile.
- [ ] Il backup deve contenere `data` e `archive`. Se compare la scelta «solo mazzi e statistiche» significa che l'archivio completo non è disponibile: **non considerarlo un backup completo**.

## B. Rotazione

- [ ] Con tre mazzi attivi, gioca due mazzi; il terzo deve restare sorteggiabile.
- [ ] Metti un filtro che esclude il terzo: il giro non deve ricominciare solo perché nessun mazzo visibile è disponibile.
- [ ] Togli il filtro, gioca il terzo; deve iniziare il giro successivo.
- [ ] Annulla l'ultima partita che ha chiuso il giro: se non hai altre partite dopo, dovrebbe ripristinare il giro precedente.
- [ ] Seleziona manualmente un mazzo già giocato o in pausa: deve restare registrabile.
- [ ] Il carosello deve fermarsi sul mazzo realmente selezionato. La scelta deve essere casuale prima dell'animazione.

## C. Archivio e versioni

- [ ] In Mazzi premi **Lista** e incolla una lista Moxfield completa (comandante + 99 carte).
- [ ] Carica Scryfall online: immagini, nomi, tipi, costo medio, conteggi e curva devono apparire.
- [ ] Correggi una riga della lista, salva: deve rimanere dopo il riavvio.
- [ ] Premi «Salva versione», cambia 2 carte, premi «Confronta»: verifica aggiunte e tagli.
- [ ] Ripristina una versione: il salvataggio precedente deve essere ancora recuperabile.
- [ ] Su una carta scegli **Ruoli** e assegna ramp/draw/removal/protection/recursion; verifica i conteggi di Analisi.
- [ ] Rimetti «auto»: verifica che ritorni alla classificazione automatica.

## D. Artwork

- [ ] Nella scheda di un mazzo premi **Cambia artwork** e scegli una stampa Scryfall.
- [ ] Carica un JPG/PNG/WebP dalla libreria dell'iPhone. L'artwork deve restare dopo ricaricamento.
- [ ] Prova anche un URL HTTPS personale (solo fonti affidabili).
- [ ] Esporta il JSON completo, reimportalo in un archivio di prova: il proxy deve tornare correttamente.

## E. Partite e analisi

- [ ] Prepara una partita con tre avversari; cerca almeno un comandante con il pulsante 🔎.
- [ ] Registra una vittoria con note e difficoltà.
- [ ] In Partite verifica nomi, comandanti, risultato, data e versione del mazzo.
- [ ] Modifica una vittoria in sconfitta: il win rate deve aggiornarsi.
- [ ] In Analisi confronta gli anni, le statistiche reali e le percentuali delle diverse versioni.
- [ ] Verifica che un mazzo eliminato conservi lo storico delle partite.

## F. PWA / offline

- [ ] Apri la preview almeno una volta con Internet prima di provarla offline.
- [ ] Aggiungi **la preview** alla schermata Home solo se vuoi provarla come PWA separata.
- [ ] Attiva modalità aereo e riapri la preview: deve mostrare l'interfaccia e i dati locali (non tutte le immagini remote).
- [ ] Registra una partita offline, torna online, riapri e verifica che il risultato sia conservato.
- [ ] Con un nuovo deploy della preview deve apparire «Aggiorna»; premilo solo quando non stai modificando dati.
- [ ] **Non eliminare** l'app ufficiale e non usare «Cancella dati siti web» per forzare l'aggiornamento.

## Pubblicazione solo dopo la checklist

L'app ufficiale `https://deckcycle.netlify.app` continua a usare `main`. Questa versione completa è nel branch `deckcycle-completa-rc1` e nella Pull Request contro `main`. Fare il merge **solo dopo** verifica su Safari/iPhone e backup esterno. Se il test fallisce, non fare merge: correggiamo i problemi sul branch di anteprima.

### Cosa non è incluso

Integrazione live con ScryCheck, coach IA con backend e sincronizzazione dei dati tra dispositivi. Sono funzionalità successive; l'analisi attuale non inventa punteggi di potenza.
