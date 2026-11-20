# DeckCycle × ScryCheck — configurazione protetta

Questa integrazione si trova nel branch `integrazione-scrycheck`, **basato sulla
versione completa `deckcycle-completa-rc1`**. È una Release Candidate e non
modifica l'app ufficiale fino al merge delle Pull Request e ai test su iPhone.

## Cosa è già implementato

- Sezione **Analisi → Analisi ufficiale ScryCheck**.
- Analisi di una lista salvata in DeckCycle oppure di un link pubblico
  Moxfield/Archidekt.
- Conferma prima di ogni invio: **le analisi e le relative liste diventano
  pagine pubbliche su ScryCheck**.
- Risultati Power Level, intervallo di confidenza, bracket, stima dei turni di
  vittoria, cinque indicatori (velocity/consistency/interaction/efficiency/lethality),
  avvertenze e link obbligatorio alla pagina ScryCheck.
- Salvataggio per versione del mazzo, dentro il backup principale JSON
  (`data.decks[].scrycheck.reports`), max 20 risultati per mazzo.
- Recupero gratuito della precedente analisi mediante
  `GET /api/v1/decks/{deckHash}`, o `mode: cached` per il link pubblico
  Moxfield/Archidekt senza report locale.
- Funzione Netlify in `netlify/functions/scrycheck.mjs`: l'API key è letta
  **soltanto dalle variabili d'ambiente**, mai da file pubblici o codice
  browser. L'app chiama soltanto `/api/scrycheck`.
- Controllo di accesso con un **secondo codice privato**, distinto dalla
  chiave API ScryCheck, e limite Netlify di 6 richieste al minuto per IP/dominio.

## PASSO 1 — Ruota la vecchia chiave

La credenziale che hai incollato in una ricerca Google **non è stata usata
per sviluppare o testare l'integrazione**. Prima di abilitarla, fai revocare
quella precedente da ScryCheck e procurati una nuova chiave.

Non incollare la nuova chiave nella chat, nel repository, nel file
`netlify.toml`, nel codice, nel manifest, nelle issue o nelle PR GitHub.

## PASSO 2 — Configura le variabili su Netlify

1. Apri [app.netlify.com](https://app.netlify.com), entra nel progetto
   **deckcycle** e vai su **Project configuration → Environment variables**.
2. Aggiungi **`SCRYCHECK_API_KEY`**: valore = la *nuova* chiave privata
   fornita da ScryCheck (non quella precedentemente condivisa).
3. Aggiungi **`SCRYCHECK_ACCESS_CODE`**: valore = un codice **a tua scelta
   di almeno 12 caratteri**, completamente distinto dalla chiave API.
   Questo codice servirà a sbloccare il pulsante Analizza sulla tua app;
   non va pubblicato o condiviso.
4. Se il piano Netlify permette di scegliere lo scope, imposta **Functions**.
   Se permette di scegliere il contesto, seleziona **Deploy Previews** per
   provare prima sul branch; per la futura pubblicazione, configurare anche
   **Production** solo dopo i test.
5. Marca le variabili come **segrete** quando la UI offre questa opzione.
6. Effettua un **nuovo deploy di anteprima** dopo aver salvato le variabili:
   le funzioni ricevono i valori disponibili al momento del deploy.

**Non confondere le due variabili.** La chiave `SCRYCHECK_API_KEY` non
va mai digitata nell'app; quando il browser chiede un codice, va inserito
soltanto il valore di `SCRYCHECK_ACCESS_CODE`.

## PASSO 3 — Test dell'integrazione

1. Conserva prima un backup JSON esterno dei tuoi mazzi dalla PWA ufficiale,
   per esempio in **File → iCloud Drive**. Non cancellare la PWA originale.
2. Apri **la Deploy Preview della PR ScryCheck**; il sito principale
   `deckcycle.netlify.app` deve rimanere invariato.
3. Importa il backup JSON soltanto nella preview: gli archivi sono separati.
4. Scegli un mazzo che abbia una lista Moxfield completa salvata in
   **Mazzi → Lista**, oppure un link pubblico Moxfield/Archidekt nella scheda.
5. Vai su **Analisi**, seleziona il mazzo e scegli la fonte (Automatica,
   Lista DeckCycle oppure Link).
6. Premi **Analizza con ScryCheck**. Leggi e accetta la conferma di pubblicazione
   solo se sei d'accordo a rendere pubblici lista e analisi.
7. Inserisci **il codice personale DeckCycle**, mai la chiave API.
8. Verifica Power Level, bracket, turni, indicatori, warning e collegamento
   alla pagina ufficiale ScryCheck.
9. Premi **Recupera analisi salvata**: viene usato il GET gratuito, senza
   consumare una nuova analisi giornaliera.
10. Modifica la lista e salva una nuova versione: l'analisi vecchia deve
    restare nello storico ma deve essere segnalata come non corrispondente
    alla versione attuale.
11. Esporta il backup JSON: controlla
    `data.decks[].scrycheck.reports`. Verifica il ripristino su un'altra
    preview o un ambiente separato.

## Errori previsti

- `NOT_CONFIGURED`: manca almeno una delle due variabili Netlify, oppure
  serve un nuovo deploy.
- `ACCESS_DENIED`: codice personale errato.
- `UNAUTHORIZED`: chiave ScryCheck non valida o revocata.
- `NOT_ANALYZED`: nessun risultato disponibile nella cache del servizio;
  occorre lanciare una nuova analisi.
- `RATE_LIMITED` / `QUOTA_EXCEEDED`: attendere il reset indicato dal servizio.
- `DECK_NOT_FOUND`: il mazzo collegato non è pubblico o non è raggiungibile.
- `NETWORK_FAILED`: errore di rete o timeout.

## Limiti e sicurezza

- L'API non è gratuita all'infinito: ScryCheck documenta limiti standard di
  60 richieste/minuto e 500 analisi/giorno, salvo accordi diversi.
  Recupero `GET` e `mode: cached` non spendono la quota giornaliera.
- Il codice personale e il rate limit proteggono dall'uso anonimo più semplice,
  ma **non sostituiscono un login per più utenti** né impongono una quota
  globale assoluta. Per un'app pubblica a molti utenti serviranno
  autenticazione e controllo quote su storage condiviso.
- I risultati sono stime ScryCheck, non decisioni ufficiali sul bracket
  Commander. Mantieni visibile il collegamento alla pagina ScryCheck.
- Il servizio può modificare il modello di scoring; l'app conserva
  `scoringVersion` insieme al report.
- Anche dopo il cambio della chiave, **non pubblicare l'app ufficiale**
  prima di verificare la preview, importazioni, backup, PWA e analisi reale.

Documentazione: https://scrycheck.com/docs/api
Netlify: https://docs.netlify.com/build/functions/environment-variables/
