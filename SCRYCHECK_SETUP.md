# DeckCycle × ScryCheck — guida alla versione di prova

Questa funzione permette di analizzare **le liste Commander già importate in DeckCycle**. Il codice è su un branch di prova: non modifica il sito ufficiale finché non viene approvata la pubblicazione.

## Funzioni disponibili

- Dalla scheda **Mazzi → Lista** si vede il pulsante **🧪 Analizza con ScryCheck** dopo aver salvato una lista Moxfield.
- Analisi su richiesta: **Power Level**, intervallo di affidabilità, **Bracket stimato**, velocità stimata di vittoria, cinque indicatori (velocità, consistenza, interazione, efficienza e chiusura), avvisi e link alla pagina completa su ScryCheck.
- Prima dell'invio appare una conferma: **lista e analisi diventano pubbliche su ScryCheck**, anche se la lista era stata soltanto incollata.
- Il risultato viene conservato in **IndexedDB** per quel mazzo, e inserito nel **backup JSON** sotto la proprietà archive.scrycheck (schemaVersion 3).
- Se la lista cambia, l'analisi precedente resta visibile ma **è segnalata come non aggiornata**; una nuova analisi sovrascrive il risultato locale precedente.
- **Rileggi analisi salvata** recupera gratuitamente la valutazione già pubblicata tramite GET, senza una nuova analisi giornaliera.
- I risultati non cambiano automaticamente il Bracket impostato manualmente in DeckCycle.
- L'app offline mostra i risultati già salvati, senza poterne richiedere di nuovi.

## PRIMA DI ABILITARE: chiedi la rotazione della chiave

La chiave API precedentemente incollata in una ricerca Google **non è stata usata per implementare o testare** il collegamento. È consigliabile revocarla e sostituirla prima di configurare la funzione.

Non incollare la nuova chiave in ChatGPT, nel repository GitHub, nei file pubblici, nel manifest o in un file netlify.toml.

## PASSO 1 — Imposta due variabili private su Netlify

Apri [Netlify](https://app.netlify.com) → progetto **deckcycle** → **Project configuration / Site configuration → Environment variables**.

Crea due variabili **nel contesto Deploy previews** quando disponibile, con ambito **Functions**:

1. **SCRYCHECK_API_KEY**: la **nuova** chiave privata che ti invierà ScryCheck.
2. **SCRYCHECK_ACCESS_CODE**: un tuo **codice personale diverso dalla chiave API**, di almeno 12 caratteri. Sceglilo tu e non condividerlo.

Non scrivere nessuno dei valori nel codice. Dopo averle salvate, avvia un **nuovo deploy della Preview**: le Netlify Functions usano le variabili disponibili al momento della pubblicazione.

Il codice personale viene richiesto all'interno di DeckCycle; non devi mai digitare la chiave API nell'app. Dopo una richiesta riuscita il codice personale è conservato **solo nella sessione Safari**, non nei backup. Limite server: 6 richieste/minuto per IP e dominio. Riduce gli abusi, ma non sostituisce autenticazione e quota globale per un servizio multiutente.

## PASSO 2 — Prova sull'app di anteprima

1. Esporta prima un backup JSON del tuo archivio, conservandolo nell'app File o su iCloud. **Non cancellare la PWA**.
2. Apri la **Deploy Preview** della versione completa (PR #5, se la piattaforma la genera).
3. Vai in **Mazzi → Lista** su un mazzo Commander, incolla la lista Moxfield e premi **Salva lista**.
4. Nella sezione **🧪 Analisi ScryCheck**, inserisci **SCRYCHECK_ACCESS_CODE**, non la chiave API.
5. Tocca **Analizza con ScryCheck** e conferma la pubblicazione solo se sei d'accordo.
6. Controlla Power Level, bracket, velocità, indicatori e link all'analisi completa.
7. Chiudi e riapri la lista: il risultato locale deve rimanere.
8. Premi **Rileggi analisi salvata**: il GET non spende quota giornaliera.
9. Modifica la lista e salva: il vecchio risultato deve essere segnalato come non aggiornato.
10. Esporta il backup JSON: troverai i risultati in archive.scrycheck.

## Errori più comuni

- **NOT_CONFIGURED**: manca la chiave o il codice nelle variabili Netlify, o serve un nuovo deploy.
- **ACCESS_DENIED**: codice personale errato.
- **UNAUTHORIZED**: chiave ScryCheck revocata o non valida.
- **NOT_ANALYZED**: non esiste un'analisi già pubblicata per questo identificativo.
- **RATE_LIMITED / QUOTA_EXCEEDED**: attendi il reset indicato dal server, senza ripetere richieste.
- **NETWORK_FAILED**: rete o server temporaneamente irraggiungibili.

Il risultato di ScryCheck è **una stima informativa**, non un giudizio ufficiale del sistema Commander. Rispetta i limiti ScryCheck e la privacy delle liste.

Documentazione: https://scrycheck.com/docs/api
Configurazione Netlify: https://docs.netlify.com/build/functions/environment-variables/
