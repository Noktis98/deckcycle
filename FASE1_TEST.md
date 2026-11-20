# DeckCycle — Fase 1: rotazione, filtri e storico

Questa fase parte dal branch `fase-0-dati` e **non va integrata direttamente in main**.
La Fase 0 non ha ancora superato i test manuali su iPhone; mantenerle separate consente di non pubblicare nulla per errore.

## Modifiche

1. **Filtri colore**: monocolore (W/U/B/R/G) significa «contiene quel colore»; gilde e 5 colori
   richiedono l'identità cromatica esatta. Es. Azorius (WU) non mostra il monobianco,
   il monoblu o Esper; 5 colori mostra soltanto WUBRG.
2. **Rotazione**: i filtri non provocano più il reset di mazzi fuori filtro.
   Il giro avanza automaticamente solo quando tutti i mazzi attivi (non in pausa) sono giocati.
   Un mazzo già giocato o in pausa resta sempre selezionabile manualmente.
3. **Selezione manuale**: viene salvato il flag `selectedManually`; una partita scelta manualmente
   viene registrata come tale anche se il mazzo era ancora disponibile.
4. **Annullamento partita**: se il risultato eliminato aveva chiuso automaticamente il giro,
   l'app può tornare al giro precedente, ma soltanto se non sono state registrate nuove
   partite nel giro successivo. Lo stato `played` viene ricalcolato dallo storico.
5. **Correzione**: pulsante **Correggi** su ogni partita dello storico. Permette di modificare
   vittoria/sconfitta, avversari, comandanti affrontati e note; permette anche di eliminare
   una partita specifica. Una copia preventiva è obbligatoria.
6. **Storico**: mostra 60 risultati per volta e il pulsante **Mostra altre 60 partite**
   consente di raggiungere tutte le partite, senza perdere quelle più vecchie.
7. **Statistiche per mese**: selettore dell'anno, per evitare che gennaio 2025 e gennaio 2026
   si sommino; la classifica mantiene anche le statistiche dei mazzi già eliminati.
8. **PWA**: nuova versione di cache `deckcycle-phase1-v3`.

## Test logici eseguiti in ambiente simulato

- Filtro Azorius esatto, filtro cinque colori, filtro monocolore
- Filtri che nascondono gli ultimi mazzi ancora disponibili
- Avanzamento del giro e ripristino del giro precedente in seguito ad annullamento
- Nessun rollback errato se sono già state registrate partite nel giro successivo
- Ripristino della disponibilità dei mazzi in pausa dopo un nuovo giro
- Storico: 60/75 e poi 75/75 elementi visualizzati
- Classifica dei mazzi eliminati e statistiche per anno 2025/2026
- Parsing/sintassi JavaScript

## Test da eseguire **successivamente** su preview, prima di qualsiasi merge

1. Conservare in File/iCloud un backup JSON **dell'app originale**.
2. Aprire la preview di questa Pull Request e importare il backup nella preview (origine distinta).
3. Applicare filtro Azorius con mazzi monocolore e con mazzi Azorius veri.
4. Avere 3 mazzi attivi: giocarne 2, applicare un filtro che nasconda l'ultimo;
   il giro NON deve ripartire. Togliendo il filtro, il terzo mazzo deve restare sorteggiabile.
5. Giocare il terzo mazzo: deve partire automaticamente un nuovo giro.
6. Annullare subito quel terzo risultato: deve tornare il giro precedente e
   il terzo mazzo deve risultare disponibile.
7. Selezionare manualmente un mazzo disponibile e registrarne la partita:
   nello storico deve essere indicato «scelto manualmente».
8. Correggere una vittoria in sconfitta, modificare le note e verificare il win rate.
9. Eliminare una partita non recente con **Correggi → Elimina partita**;
   il resto dello storico deve rimanere e le statistiche devono aggiornarsi.
10. Con più di 60 partite, verificare **Mostra altre 60 partite**.
11. Controllare che la selezione dell'anno separi i mesi 2025 e 2026.
12. Verificare l'offline e il refresh su Safari/PWA senza cancellare dati.

## Nota sui dati

- Nessuna migrazione a IndexedDB in questa fase.
- Lo schema JSON mantiene `deckcycle_magic_v1` e aggiunge soltanto campi opzionali:
  `selectedManually`, `roundOrigin` e `closedRoundAutomatically` nelle partite.
- Gli storici esistenti senza questi nuovi campi continuano a essere leggibili.
  Il rollback automatico del giro è affidabile per i giri **chiusi dopo** questo aggiornamento;
  per i giri storici precedenti privi del marcatore non viene inventata una transizione.
