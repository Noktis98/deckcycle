# DeckCycle — Fase 3: archivio Commander, IndexedDB e Scryfall

**Branch:** `fase-3-archivio-carte` (basato su `fase-2-pwa-offline`).
La Fase 0, la Fase 1 e la Fase 2 non sono ancora state provate su iPhone.
**Non integrare in `main` prima di avere backup JSON esterno e test reali delle quattro fasi.**

## Cosa è stato implementato

- **IndexedDB separato:** database `deckcycle_archive_v1` con store
  `lists` (lista per `deckId`), `cards` (metadati Scryfall senza immagini binarie),
  `revisions` (copie della lista precedente, prima delle modifiche),
  `meta` (fotografia iniziale del vecchio salvataggio, una volta).
- **Migrazione non distruttiva:** vecchi mazzi, partite, rotazione e filtri
  **restano in `localStorage`**, chiave `deckcycle_magic_v1`.
  La prima apertura crea anche una copia iniziale in IndexedDB, senza eliminare
  il salvataggio originale. La migrazione definitiva del core verrà valutata
  soltanto dopo verifica sul dispositivo.
- **Gestione liste:** pulsante **Lista** su ogni mazzo e **Lista carte**
  nella scheda; importazione manuale di testo Moxfield del tipo `1 Sol Ring`,
  `1x Arcane Signet`, `1 Sol Ring (CMM) 396`.
  Supporta `Commander`, `Deck`, set/numero collezione, righe duplicate;
  ignora `Sideboard`, `Maybeboard`, `Considering` e `Tokens`.
- **Controllo quantità:** avvisa in caso di lista diversa da 100 carte,
  comandante incluso. Consente il salvataggio di liste parziali solo
  dopo conferma. Le righe non riconosciute richiedono conferma prima di ignorarle.
- **Scryfall:** batch POST `/cards/collection`, fino a 75 identificatori per
  chiamata, con pausa fra batch; cache dei metadati in IndexedDB.
  Visualizzazione delle carte (immagini remote `loading=lazy`), categorie,
  curva di mana e CMC medio **solo su carte riconosciute**.
- **Backup JSON completo:** include `data` (mazzi, statistiche) e `archive`
  (liste IndexedDB). Conserva l'importazione dei vecchi backup con solo
  `data`. Su iOS esporta da uno snapshot già preparato per mantenere la
  gesture di **Condividi**. Se IndexedDB non è disponibile, l'utente può
  scegliere consapevolmente di esportare solo mazzi e statistiche.
- **Importazione prudente:** valida prima l'archivio; conserva revisioni
  delle liste già esistenti; se l'importazione IndexedDB fallisce tenta il
  rollback del vecchio stato in localStorage. Non cancella le liste orfane
  dei mazzi eliminati.
- **Offline:** `sw.js` precarica `archive.js` e `archive-ui.js`
  e usa una nuova versione di cache. Liste e dati Scryfall già memorizzati
  sono consultabili offline; la prima ricerca, e le immagini remote, richiedono rete.

## Limiti consapevoli

- Questa fase **non migra definitivamente** il salvataggio principale da
  localStorage a IndexedDB: spostarlo prima di testare rischierebbe la perdita
  dei dati sul telefono.
- Le revisioni di emergenza delle liste sono conservate, ma l'interfaccia per
  scegliere e confrontare le *versioni del mazzo* verrà nella Fase 4.
- Le immagini delle carte sono URL Scryfall, non file scaricati: non sono
  garantite in modalità aereo.
- Le categorie e il costo medio dipendono dalla disponibilità e dalla
  correttezza dei metadati Scryfall. Le carte non riconosciute sono esplicitate
  e non inventiamo un punteggio di potenza.
- Nessuna sincronizzazione cloud: dati e liste restano locali sul dispositivo.
- Il backend GitHub/Netlify attuale è statico, non è stato aggiunto alcun
  servizio a pagamento, database remoto o credenziale.

## Controlli automatici/simulati eseguiti

1. Parsing delle liste Commander con set/collector e sezioni escluse.
2. Aggregazione di righe duplicate e riconoscimento di nomi bifronte.
3. Creazione store IndexedDB, scrittura, lettura, revisioni e copia di migrazione.
4. Backup sincrono per il menu Condividi iOS dopo preparazione dello snapshot.
5. Import di liste associate a mazzi eliminati senza bloccare il backup.
6. Recupero Scryfall simulato di 100 carte in due batch, 75 + 25.
7. Statistiche di curva, CMC e categorie su metadati simulati.
8. Rifiuto di un backup non valido senza perdere il precedente.
9. Rollback del localStorage in caso di errore simulato di importazione delle liste.
10. Parsing/sintassi JS di tutti i moduli e degli script inline.
11. Verifica dei riferimenti DOM dell'archivio e dei file presenti nella cache PWA.

**Sono test di logica simulati, NON test browser reali o su Safari/iPhone.**

## Checklist per la prova reale (da eseguire prima del merge)

1. Esporta il backup dalla DeckCycle ufficiale sul tuo iPhone e salvalo in
   **File → iCloud Drive**. Non eliminare l'app ufficiale.
2. Apri l'anteprima Netlify della Pull Request Fase 3: **non** il sito di
   produzione. Importa il backup in quell'origine separata.
3. Verifica che tutti i mazzi/storico/filtri siano ancora al loro posto.
4. Premi **Lista** per un mazzo e incolla 100 righe in formato Moxfield
   (comandante e 99 carte). Salva e verifica il conteggio.
5. Ricarica la pagina: la lista deve essere ancora presente.
6. Premi **Aggiorna Scryfall** online e controlla immagini, tipologie, curva,
   costo medio e le eventuali carte non trovate.
7. Modifica una carta, salva, chiudi e riapri per verificarne la persistenza.
8. Premi **Esporta** su iPhone, salva il JSON in File e controlla che contenga
   le sezioni `data` e `archive.lists`.
9. Su una preview **con origine separata**, importa quel JSON e controlla
   che liste e dati del mazzo siano ricostruiti correttamente.
10. Prova una lista parziale (90 carte): deve chiedere conferma, non cancellare
    le carte precedenti se annulli.
11. Offline: apri una lista già caricata, verifica nomi/costi/tipologie salvati;
    le immagini potrebbero mancare.
12. Verifica rotazione, filtri, correzione risultati e pulsante **Copie** delle
    fasi precedenti.
13. Prova su Safari e su PWA installata: aggiornamenti visibili soltanto
    dopo consenso; nessuna cancellazione dei dati.

**Nota:** le copie del pulsante `Copie` riguardano il vecchio stato
localStorage; per salvare *anche le liste* serve un backup **Esporta** completo.
