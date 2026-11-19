# DeckCycle — Fase 0: verifica prima del merge

Questa proposta riguarda esclusivamente la protezione dei dati e gli aggiornamenti PWA.
Non pubblicare `main` prima dei test. L'app salva dati nel `localStorage` dell'origine corrente;
un'anteprima Netlify ha dati SEPARATI rispetto al sito e alla PWA installata.

## Cosa cambia

- `safeguards.js`: lettura verificata; blocco della scrittura se lo stato precedente è illeggibile;
  fino a 6 copie locali (automatica e prima di operazioni distruttive); pulsante **Copie**;
  importazione con validazione, conferma e copia preventiva;
  export con condivisione iOS quando disponibile e download negli altri casi.
- `index.html`: utilizza il modulo di protezione, mantenendo la chiave
  `deckcycle_magic_v1` e il formato JSON compatibile con la versione precedente.
- `sw.js`: nuova cache versionata e strategia network-first per documenti/asset locali,
  con fallback offline. Nessuna cache applicativa di richieste Scryfall.

## Test richiesti su branch/anteprima (NON sul sito principale)

1. **Prima di tutto**: esportare il backup JSON dall'iPhone con l'app attuale e conservarlo in File/iCloud.
2. Aprire un'anteprima del branch. La sua origine è diversa dal sito principale:
   i mazzi non compariranno finché non importi un backup.
3. Importare il backup; verificare nomi, partite e statistiche. Selezionare **Annulla** alla
   prima richiesta di importazione e verificare che i dati presenti non cambino.
4. Aggiungere un mazzo di prova, estrarlo, registrare vittoria e sconfitta;
   annullare l'ultima partita; eliminare il mazzo di prova.
5. Aprire **Copie** e controllare data/numero di mazzi/partite. Ripristinare una copia e
   controllare il risultato dopo ricaricamento.
6. Premere **Esporta** su iPhone: il foglio Condividi deve permettere **Salva su File**;
   verificare che il JSON esista e sia reimportabile.
7. Installare la preview come PWA dall'iPhone e verificarne apertura/offline.
8. Pubblicare una nuova versione del branch, ricaricare la preview, verificare che venga
   aggiornata (eventualmente chiudere e riaprire la PWA).

## Limiti e precauzioni

- Le copie automatiche restano **sullo stesso dispositivo e nello stesso archivio**.
  Non sostituiscono un backup salvato esternamente.
- Se la memoria è piena, un salvataggio può fallire: l'app mostra un avviso persistente;
  esportare immediatamente i dati recuperabili.
- Se la cache del service worker precedente continua a mostrare la versione vecchia,
  chiudere e riaprire l'app; in caso di problemi controllare l'aggiornamento senza
  cancellare i dati del sito.
- La prova automatica della sintassi JS e dei casi di backup/archivio corrotto è stata
  eseguita su un ambiente simulato. Il comportamento Safari/iPhone va verificato.
- La Fase 0 non aggiunge ancora IndexedDB né sincronizzazione online.
