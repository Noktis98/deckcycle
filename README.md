# DeckCycle — Versione completa (Release Candidate 1)

DeckCycle è una PWA gratuita per gestire la rotazione dei mazzi di **Magic: The Gathering — Commander**. Il progetto è statico (HTML, CSS, JavaScript), pubblicabile su Netlify senza database remoto né abbonamenti. I dati **non si sincronizzano automaticamente** fra dispositivi.

## Funzioni incluse nella versione candidata

**Gioca**: sorteggio casuale tra mazzi disponibili, carosello animato con artwork, esclusione dopo una partita, nuovo giro automatico o manuale, selezione manuale sempre possibile, vittorie/sconfitte con note.

**Mazzi**: archivio, ricerca, filtri colore e bracket, pausa, scheda e immagini comandante; importazione testuale Moxfield (`1 Nome Carta`), lista Commander, versioni storiche, confronto aggiunte/tagli e ripristino.

**Artwork**: ricerca delle stampe su Scryfall, URL HTTPS e immagini personali da JPG/PNG/WebP. Le immagini personali vengono ridotte fino a 800 px e conservate in IndexedDB (backup JSON incluso).

**Partite**: storico completo, correzione e cancellazione dei risultati, tavolo con 1–5 avversari e ricerca comandanti su Scryfall, difficoltà incontrate, collegamento alla versione di lista usata.

**Analisi**: win rate reale, risultati per mazzo/anno/versione; costo medio, curva e distribuzione tipologie; classificazione indicativa di ramp, pescata, removal, protezioni e recursion con **override manuali** dalla scheda della singola carta. Non è un calcolo di potenza del mazzo.

**Dati e offline**: protezione del localStorage, fino a 6 copie locali, backup JSON completo, IndexedDB per liste/metadati/artwork/versioni/tag, aggiornamento PWA controllato, shell offline. I dati core (mazzi e storico) restano in `deckcycle_magic_v1` nel localStorage per preservare la compatibilità; non abbiamo ancora migrato il core a IndexedDB.

## Come provare senza rischiare i mazzi

1. Apri l'app **ufficiale** sull'iPhone ed esporta un backup JSON in **File/iCloud Drive**.
2. Non cancellare, reinstallare, resettare o modificare la PWA originale.
3. Utilizza soltanto la **Deploy Preview** Netlify associata alla Pull Request di questa versione completa (non il dominio di produzione).
4. La preview ha una **origine differente**: avrà inizialmente dati locali vuoti. Importa nella preview il backup esportato.
5. Prova mazzi, partite, undo, import/export, copie, lista Moxfield, versioni, artwork, avversari, analisi, cambio sezione, offline e aggiornamenti PWA.
6. Dalla preview esegui un altro **Esporta**: verifica che nel JSON siano presenti `data` e `archive`, e che `archive` contenga anche `lists`, `revisions`, `artworks` e `roles`.
7. Reimporta il JSON su un'altra preview con archivio vuoto e controlla che tutti i contenuti siano recuperati.
8. Pubblica sulla versione ufficiale **solo dopo** aver verificato i test su Safari e sull'app installata.

## Limiti noti della versione candidata

- Questo è codice integrato, non ancora verificato su un vero iPhone: **non è un rilascio già collaudato**.
- Le foto Scryfall e le ricerche nuove richiedono connessione. La prima apertura offline va preceduta da una visita online.
- Le classificazioni Oracle sono euristiche, non un giudizio affidabile di potenza. Un singolo effetto può avere più ruoli; modifica quelli che ritieni errati.
- Le copie automatiche del pulsante **Copie** sono nello stesso storage del browser e non includono tutti gli artwork/liste IndexedDB. **Esporta** è l'unico backup completo.
- Le immagini personali possono aumentare la dimensione del JSON; l'import ha limite di 35 MB.
- L'integrazione diretta ScryCheck e un vero coach IA non sono incluse: richiederebbero altre integrazioni e valutazione dei costi.
- L'accesso locale agli archivi dipende da Safari/iOS e può essere soggetto a limiti o cancellazione dei dati. Conservare backup esterni.
- Non effettuare il merge finché non hai completato almeno la checklist `VERSIONE_COMPLETA_TEST.md`.

## Struttura dei file

- `index.html` — pagina, componenti e flusso base di DeckCycle
- `safeguards.js` — backup, importazione verificata e protezione dello storage
- `archive.js` — database IndexedDB, lista Commander, cache Scryfall, versioni, immagini e ruoli
- `archive-ui.js` — visualizzazione e modifica delle liste, confronti e ruoli manuali
- `features.js` — navigazione mobile, artwork, tavolo Commander, carosello e dashboard
- `pwa.js` — aggiornamenti PWA consensuali
- `sw.js` — cache offline/versionamento
- `manifest.webmanifest`, `icon-*.png` — installazione e icone

### Pubblicazione

Questa release è nel branch `deckcycle-completa-rc1` e nella relativa Pull Request **contro `main`**. I branch delle Fasi 0–3 restano separati e in bozza. Una volta verificato tutto è sufficiente valutare il merge della PR completa (non è necessario fare merge di ogni PR precedente separatamente).

L'app ufficiale su `https://deckcycle.netlify.app` non viene modificata dalla sola creazione di questa release candidate.
