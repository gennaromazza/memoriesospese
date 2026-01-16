# Studio Assistant - Sistema Suggerimenti Intelligenti

## Panoramica
Sistema centralizzato per aiutare il fotografo a gestire consulenze, follow-up preventivi e consegne lavori. Il sistema analizza lo stato dei jobs e suggerisce azioni proattive ogni mattina.

---

## Funzionalità Principali

### 1. Suggerimenti Preventivi Non Firmati

#### Logica Base
- Rileva preventivi inviati/visionati ma non firmati dopo X giorni
- Suggerisce di contattare il cliente
- Bottone WhatsApp con messaggio precompilato professionale/confidenziale

#### Stato Follow-Up (Miglioria)
Traccia lo stato di contatto per evitare spam:
```typescript
quoteFollowUpStatus: 
  | 'never_contacted'    // Mai contattato
  | 'contacted_once'     // Contattato 1 volta
  | 'contacted_twice'    // Contattato 2 volte
  | 'abandoned'          // Archiviato/abbandonato
```

**Regole:**
- Dopo 2 follow-up → priorità diminuisce
- Suggerimento soft: "Valuta se archiviare questo preventivo"

#### Varianti Messaggio Automatiche
Evita effetto "spam" con toni diversi:
```typescript
messageVariant: 'gentle' | 'direct' | 'final'
```

**Esempi:**
- `gentle`: "Ciao [Nome]! Spero tutto bene. Volevo sapere se hai avuto modo di visionare il preventivo..."
- `direct`: "Ciao [Nome]! Ti scrivo per un aggiornamento sul preventivo per [Evento]..."
- `final`: "Capisco se nel frattempo avete fatto altre valutazioni, resto comunque a disposizione."

---

### 2. Suggerimenti Lavori da Consegnare 🔥

#### Logica Base
- Rileva jobs con evento passato da X mesi e non ancora consegnati
- Chiede "Hai consegnato questo lavoro?"
- Se "Sì" → marca come consegnato, passa al prossimo
- Se "No" → chiedi motivazione (1 tap) e flagga

#### Motivazione Rapida (Miglioria)
Quando l'utente clicca "No", mostra opzioni rapide:
```
⏳ In lavorazione
📸 In attesa selezione cliente  
🖨️ In stampa
❓ Altro
```

Salva come:
```typescript
pendingReason?: 'editing' | 'client_waiting' | 'printing' | 'other'
```

**Benefici:**
- Lista ordinata per motivazione
- Suggerimenti futuri più intelligenti
- Dashboard "Lavori in Corso" categorizzata

---

### 3. Suggerimenti Consulenze

#### Logica Base
Suggerisce consulenze appropriate in base allo stato del job:
- Evento passato 2-4 settimane → "Prima Chiacchierata"
- Post-produzione 1-2 mesi → "Visione Foto"
- Lavoro quasi pronto → "Consegna"
- Verifica consulenze già richieste/completate per evitare duplicati

#### Peso Consulenze (Miglioria)
Non tutte le consulenze hanno lo stesso "peso" lavorativo:
```typescript
consultationWeight: 1 | 2 | 3
```

**Esempi:**
| Tipo Consulenza | Peso |
|-----------------|------|
| Prima Chiacchierata | 1 |
| Visione | 2 |
| Consegna | 1 |
| Visione + Scelta Album | 3 |

**Calcolo carico settimanale:**
```typescript
weeklyLoad = sum(consultation.weight)
```
Molto più realistico del semplice "numero consulenze".

---

### 4. Lista "Lavori da Svolgere"

#### Contenuto Base
- Pagina dedicata con tutti i jobs flaggati come "da lavorare"
- Per ogni job: nome evento, data, stato, link rapido consulenza
- Priorità basata su anzianità

#### Micro-Motivazione (Miglioria)
Per ogni job mostra **perché** è nella lista:
```
"⏰ Evento di 4 mesi fa – non ancora consegnato"
"📌 Marcato come 'da lavorare' 12 giorni fa"
"📸 In attesa selezione cliente da 3 settimane"
```

**Benefici:**
- Riduce ansia
- Aumenta fiducia nel sistema
- Contesto immediato senza cliccare

---

## Logica Date Intelligenti

### Configurazione Template Consulenze
Ogni template consulenza avrà:
```typescript
interface ConsultationTemplate {
  // ... campi esistenti
  giorniPreparazione: number;  // Default: 0
  weight: 1 | 2 | 3;           // Peso per carico settimanale
}
```

### Regole Suggerimento Date

1. **Giorni preparazione = blocco invisibile** 🔥
   - I giorni di preparazione NON vengono mostrati al cliente
   - Bloccano silenziosamente il calendario
   - Cliente vede solo: "Disponibilità consigliata: dal 12 al 18"

2. **Solo giorni lavorativi**: Lun-Ven (configurabile in futuro)

3. **Evita accumulo**: Calcola `weeklyLoad` con pesi, non numeri
   - Se `weeklyLoad >= 8` → settimana piena, suggerisci altra

4. **Link precompilato**: Genera URL con `?dateFrom=...&dateTo=...`

---

## Architettura Tecnica

### Struttura File
```
client/src/components/studio-assistant/
├── StudioAssistant.tsx          # Componente principale
├── SuggestionCard.tsx           # Card singolo suggerimento
├── WorkPendingList.tsx          # Lista lavori da svolgere
├── DailyRitual.tsx              # Modalità "Rituale del Mattino"
├── useStudioSuggestions.ts      # Hook centrale
└── suggestion-rules.ts          # Regole configurabili
```

### Schema Suggerimenti (Backend)
```typescript
interface Suggestion {
  id: string;
  jobId?: string;
  quoteId?: string;
  type: 'unsigned_quote' | 'pending_delivery' | 'consultation';
  createdAt: Timestamp;
  lastShownAt: Timestamp;
  dismissedAt?: Timestamp;
  actionTaken?: 'contacted' | 'booked' | 'completed' | 'archived';
  priority: 'high' | 'medium' | 'low';
  followUpCount?: number;        // Per preventivi
  pendingReason?: string;        // Per lavori
  suggestedDates?: {             // Per consulenze
    from: string;
    to: string;
  };
}
```

**Regole visualizzazione:**
- Non mostrare stesso suggerimento identico ogni mattina
- Aumenta priorità se ignorato X giorni
- Sparisce solo se azione reale eseguita

### Hook useStudioSuggestions
```typescript
const {
  suggestions,        // Lista suggerimenti filtrati
  loading,           // Stato caricamento
  markAsDone,        // Marca come completato
  dismiss,           // Ignora/archivia
  performAction,     // Esegui azione (WhatsApp, prenota, etc.)
  stats              // Statistiche (tempo stimato, conteggi)
} = useStudioSuggestions({ 
  mode: 'full' | 'compact' | 'job-specific',
  jobId?: string 
});
```

### Endpoint Backend
```
GET /api/studio-assistant/suggestions
POST /api/studio-assistant/suggestions/:id/action
PATCH /api/studio-assistant/suggestions/:id/dismiss
```

---

## UX Daily Flow: "Rituale del Mattino" 🔥

### Concetto
Trasforma il sistema da "lista problemi" a "assistente motivante":

```
"Buongiorno! Hai 3 azioni consigliate oggi (⏱ ~6 min)"

[Azione 1] → 1 tap → esegui → "✔ Fatto!" (animazione)
[Azione 2] → ...
[Azione 3] → ...

"🎉 Tutto fatto! Ottimo lavoro oggi."
```

### Micro-Reward Psicologico
- Animazione celebrativa quando completi azione
- Counter "X/Y completati oggi"
- Messaggio finale di incoraggiamento

---

## Integrazione Pagine

| Pagina | Modalità | Cosa mostra |
|--------|----------|-------------|
| AdminDashboard | full + ritual | Widget completo + "Rituale del Mattino" |
| JobDetailPage | job-specific | Solo suggerimenti per quel job |
| JobsListPage | badge | Indicatori visivi sui job che richiedono azione |
| CalendarioManager | compact | Alert per consulenze da prenotare |

---

## Task di Implementazione

### Fase 1: Database & Configurazione
- [ ] Aggiungere campo `giorniPreparazione` ai Template Consulenze
- [ ] Aggiungere campo `weight` ai Template Consulenze (1-3)
- [ ] Creare collection `studioSuggestions` con schema completo
- [ ] Aggiungere campo `pendingReason` ai jobs

### Fase 2: Backend
- [ ] Implementare endpoint `GET /api/studio-assistant/suggestions`
- [ ] Implementare endpoint `POST /api/studio-assistant/suggestions/:id/action`
- [ ] Implementare logica calcolo date intelligenti (preparazione + carico pesi)
- [ ] Implementare logica follow-up preventivi con varianti messaggio

### Fase 3: Componenti Frontend
- [ ] Creare struttura cartella `components/studio-assistant`
- [ ] Implementare hook `useStudioSuggestions` con firma completa
- [ ] Creare componente `SuggestionCard` con azioni
- [ ] Creare componente `StudioAssistant` principale
- [ ] Creare componente `WorkPendingList` con motivazioni
- [ ] Creare componente `DailyRitual` per modalità mattutina

### Fase 4: Integrazioni
- [ ] Integrare in AdminDashboard (widget + ritual)
- [ ] Integrare in JobDetailPage (job-specific)
- [ ] Aggiungere badge indicatori in JobsListPage

### Fase 5: Polish & Test
- [ ] Test responsività mobile/tablet/desktop
- [ ] Verificare coerenza UI palette sage/beige
- [ ] Implementare animazioni micro-reward
- [ ] Test flusso completo end-to-end

---

## Note UI/UX

### Stile Visivo
- Palette: sage/beige esistente
- Card con bordi arrotondati e ombre sottili
- Badge priorità:
  - 🔴 Rosso: Urgente (preventivo 14+ giorni, 0 follow-up)
  - 🟡 Giallo: Medio (job 3+ mesi, già contattato)
  - 🟢 Verde: Normale (suggerimento standard)
- Animazioni celebrative per completamento

### Responsività
- Mobile: stack verticale, swipe actions
- Tablet: griglia 2 colonne
- Desktop: griglia 3 colonne o sidebar

---

## Messaggi WhatsApp Precompilati

### Preventivo - Variante Gentle
```
Ciao [Nome]! Spero tutto bene. 
Volevo sapere se hai avuto modo di visionare il preventivo che ti ho inviato per [NomeEvento]. 
Resto a disposizione per qualsiasi chiarimento!
```

### Preventivo - Variante Direct
```
Ciao [Nome]! 
Ti scrivo per un aggiornamento sul preventivo per [NomeEvento].
Fammi sapere se hai domande o se possiamo procedere!
```

### Preventivo - Variante Final
```
Ciao [Nome]!
Capisco se nel frattempo avete fatto altre valutazioni per [NomeEvento].
Resto comunque a disposizione se in futuro aveste bisogno. Un caro saluto!
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

## Cose GIÀ PERFETTE (da non modificare)

✔ Divisione per tipo suggerimento  
✔ Integrazione contestuale (JobDetailPage)  
✔ Badge priorità colorati  
✔ Uso WhatsApp invece di email  
✔ Architettura modulare frontend  
✔ Sistema booking con dateFrom/dateTo esistente  

---

## Dipendenze Esistenti da Sfruttare
- `shared/phone-utils.ts` - Generazione link WhatsApp
- Sistema template consulenze esistente
- Sistema booking consulenze con supporto dateFrom/dateTo
- Calendario con analisi disponibilità
- Collection `consultations` per deduplicazione

---

*Documento creato: Gennaio 2026*  
*Ultimo aggiornamento: Gennaio 2026 - Aggiunte migliorie UX avanzate*
