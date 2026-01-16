# Studio Assistant - Sistema Suggerimenti Intelligenti

## Panoramica
Sistema centralizzato per aiutare il fotografo a gestire consulenze, follow-up preventivi e consegne lavori. Il sistema analizza lo stato dei jobs e suggerisce azioni proattive ogni mattina.

---

## Funzionalità Principali

### 1. Suggerimenti Preventivi Non Firmati
- Rileva preventivi inviati/visionati ma non firmati dopo X giorni
- Suggerisce di contattare il cliente
- Bottone WhatsApp con messaggio precompilato professionale/confidenziale
- Esempio messaggio: "Ciao [Nome]! Spero tutto bene. Volevo sapere se hai avuto modo di visionare il preventivo che ti ho inviato. Resto a disposizione per qualsiasi chiarimento!"

### 2. Suggerimenti Lavori da Consegnare
- Rileva jobs con evento passato da X mesi e non ancora consegnati
- Chiede "Hai consegnato questo lavoro?"
- Se "Sì" → marca come consegnato, passa al prossimo
- Se "No" → flagga come "da lavorare", aggiunge a lista dedicata

### 3. Suggerimenti Consulenze
- Suggerisce consulenze appropriate in base allo stato del job
- Esempi:
  - Evento passato 2-4 settimane → "Prima Chiacchierata"
  - Post-produzione 1-2 mesi → "Visione Foto"
  - Lavoro quasi pronto → "Consegna"
- Verifica se consulenze già richieste/completate per evitare duplicati

### 4. Lista "Lavori da Svolgere"
- Pagina dedicata con tutti i jobs flaggati come "da lavorare"
- Per ogni job: nome evento, data, stato, link rapido per prenotare consulenza
- Priorità basata su anzianità

---

## Logica Date Intelligenti

### Configurazione Template Consulenze
Ogni template consulenza avrà un nuovo campo:
- `giorniPreparazione`: numero di giorni lavorativi necessari per preparare la consulenza (default: 0)
- Esempio: "Visione" = 1 giorno, "Prima Chiacchierata" = 0 giorni

### Regole Suggerimento Date
1. **Considera giorni preparazione**: Se una Visione richiede 1 giorno prep e c'è già una Visione lunedì → martedì è bloccato → suggerisce da mercoledì
2. **Solo giorni lavorativi**: Lun-Ven (configurabile in futuro)
3. **Evita accumulo**: Se una settimana ha già 4+ consulenze "pesanti", suggerisce settimane meno impegnate
4. **Analisi carico settimanale**: Conta consulenze per settimana e propone range date ottimali
5. **Link precompilato**: Genera URL con `?dateFrom=...&dateTo=...` per limitare date disponibili al cliente

---

## Architettura Tecnica

### Struttura File
```
client/src/components/studio-assistant/
├── StudioAssistant.tsx          # Componente principale (modalità: full/compact/job-specific)
├── SuggestionCard.tsx           # Card singolo suggerimento con azioni
├── WorkPendingList.tsx          # Lista lavori da svolgere
├── useStudioSuggestions.ts      # Hook per logica suggerimenti
└── suggestion-rules.ts          # Regole configurabili
```

### Endpoint Backend
```
GET /api/studio-assistant/suggestions
```
Restituisce:
- Lista suggerimenti raggruppati per tipo
- Per ogni suggerimento: jobId, tipo azione, priorità, date suggerite, messaggio WhatsApp precompilato

### Integrazione Pagine
| Pagina | Modalità | Cosa mostra |
|--------|----------|-------------|
| AdminDashboard | full | Widget completo con tutte le sezioni |
| JobDetailPage | job-specific | Solo suggerimenti per quel job |
| JobsListPage | badge | Indicatori sui job che richiedono azione |
| CalendarioManager | compact | Alert per consulenze da prenotare |

---

## Task di Implementazione

### Fase 1: Configurazione
- [ ] Aggiungere campo `giorniPreparazione` ai Template Consulenze (default 0)
- [ ] Aggiungere campo `workStatus` ai jobs (pending/in_progress/delivered) o flag `needsWork`

### Fase 2: Backend
- [ ] Creare collection `consultationSuggestions` per tracciare stato suggerimenti
- [ ] Implementare endpoint `GET /api/studio-assistant/suggestions`
- [ ] Implementare logica calcolo date intelligenti (considera preparazione, carico settimanale, giorni lavorativi)

### Fase 3: Componenti Frontend
- [ ] Creare struttura cartella `components/studio-assistant`
- [ ] Implementare hook `useStudioSuggestions`
- [ ] Creare componente `SuggestionCard` con azioni (WhatsApp, Sì/No, Prenota)
- [ ] Creare componente `StudioAssistant` principale
- [ ] Creare componente `WorkPendingList`

### Fase 4: Integrazioni
- [ ] Integrare in AdminDashboard (widget completo)
- [ ] Integrare in JobDetailPage (suggerimenti job-specific)
- [ ] Aggiungere badge indicatori in JobsListPage

### Fase 5: Test e Rifinitura
- [ ] Test responsività su mobile/tablet/desktop
- [ ] Verificare coerenza UI con palette esistente (sage/beige)
- [ ] Test flusso completo: suggerimento → azione → tracking

---

## Note UI/UX

### Stile Visivo
- Palette: sage/beige esistente dell'applicazione
- Card con bordi arrotondati e ombre sottili
- Badge colorati per priorità:
  - 🔴 Rosso: Urgente (preventivo non firmato da 14+ giorni)
  - 🟡 Giallo: Medio (job da consegnare da 3+ mesi)
  - 🟢 Verde: Normale (suggerimento consulenza standard)
- Animazioni sottili per feedback azioni

### Responsività
- Mobile: stack verticale, card a larghezza piena
- Tablet: griglia 2 colonne
- Desktop: griglia 3 colonne o layout sidebar

---

## Messaggi WhatsApp Precompilati

### Preventivo Non Firmato
```
Ciao [Nome]! Spero tutto bene. 
Volevo sapere se hai avuto modo di visionare il preventivo che ti ho inviato per [NomeEvento]. 
Resto a disposizione per qualsiasi chiarimento!
```

### Invito Consulenza Visione
```
Ciao [Nome]! 
Sono felice di comunicarti che le foto del tuo [TipoEvento] sono pronte per la visione! 
Ti propongo di fissare un appuntamento per vederle insieme. 
Sei disponibile tra il [DataInizio] e il [DataFine]?
```

### Promemoria Consegna
```
Ciao [Nome]! 
Volevo aggiornarti sullo stato del tuo [TipoEvento]. 
Quando ti farebbe comodo passare per il ritiro?
```

---

## Dipendenze Esistenti da Sfruttare
- `shared/phone-utils.ts` - Generazione link WhatsApp
- Sistema template consulenze esistente
- Sistema booking consulenze con supporto dateFrom/dateTo
- Calendario con analisi disponibilità

---

*Documento creato: Gennaio 2026*
*Ultimo aggiornamento: In attesa implementazione*
