
# 📧 Sistema Email Queue con Rate Limiting

## Panoramica

Sistema robusto di gestione code email per Gmail API, con:
- ✅ **Rate limiting** conforme a limiti Google (90/min, 1800/day)
- ✅ **Distributed lock** per Cloud Functions scalabili
- ✅ **Retry automatico** con backoff
- ✅ **Priorità e scheduling** flessibili
- ✅ **Monitoraggio real-time** via dashboard

## Architettura

```
Client/Server → EmailQueue.enqueue() → Firestore (emailQueue collection)
                                              ↓
                              Cloud Scheduler (ogni minuto)
                                              ↓
                              processEmailQueue() [Cloud Function]
                                              ↓
                              Distributed Lock (Firestore locks/emailQueue)
                                              ↓
                              Batch Processing (10 email/batch)
                                              ↓
                              Gmail API (via sendGmailEmail)
```

## Utilizzo

### Enqueue Email

```typescript
import { EmailQueue } from './email-queue';

// Email semplice
await EmailQueue.enqueue({
  to: 'cliente@example.com',
  subject: 'Benvenuto',
  htmlContent: '<h1>Ciao!</h1>',
  priority: 'high'
});

// Email con metadata per tracking
await EmailQueue.enqueue({
  to: ['user1@example.com', 'user2@example.com'],
  subject: 'Nuove foto disponibili',
  htmlContent: emailHtml,
  priority: 'normal',
  scheduledFor: new Date(Date.now() + 3600000), // +1 ora
  metadata: {
    type: 'new_photos',
    galleryId: 'abc123'
  }
});
```

### Monitoraggio

```typescript
// Ottieni statistiche queue
const stats = await EmailQueue.getStats();
console.log(stats);
// {
//   pending: 15,
//   processing: 2,
//   sent: 1234,
//   failed: 3,
//   todayCount: 456,
//   lastHourCount: 45
// }
```

### Dashboard HTTP Endpoint

```bash
# GET stats via HTTP (per dashboard React)
curl https://us-central1-PROJECT_ID.cloudfunctions.net/getEmailQueueStats
```

## Rate Limiting

| Limite | Valore | Note |
|--------|--------|------|
| Email/minuto | 90 | Safety: 10 sotto il limite Google (100/min) |
| Email/giorno | 1800 | Safety: 200 sotto il limite Google (2000/day) |
| Batch size | 10 | Email processate per invocazione |
| Delay tra batch | 7 secondi | Distribuisce carico uniformemente |

## Distributed Lock

Il sistema usa Firestore come distributed lock per prevenire processing concorrente:

```typescript
// Document: locks/emailQueue
{
  lockedUntil: 1234567890, // Timestamp
  lockedAt: Date,
  instanceId: 'cloud-function-instance-xyz'
}
```

**Timeout lock**: 2 minuti  
**Rilascio**: Automatico nel `finally` block

## Retry Logic

- **Tentativi massimi**: 3
- **Delay retry**: 5 minuti
- **Backoff**: Semplice (fisso 5 min)

Stati email:
- `pending` → `processing` → `sent` ✅
- `pending` → `processing` → `failed` (after max attempts) ❌
- `pending` → `processing` → `pending` (retry) 🔄

## Logging & Debugging

Tutti i log includono metadata per troubleshooting:

```
📬 Email enqueued: abc123 | recipients=3 | priority=high | type=new_photos | galleryId=gallery_xyz
✅ Email inviata: abc123 | recipients=3 | type=new_photos | galleryId=gallery_xyz
❌ Errore invio email abc123 (attempt 2/3) | type=booking_confirmed | galleryId=N/A: Quota exceeded
```

## Cloud Scheduler Configuration

```bash
# Schedule: Ogni minuto
*/1 * * * *

# Timezone: UTC
# Timeout: 9 minuti (540s)
# Memory: 512MB
```

## Sicurezza

- **Mittenti whitelist**: Solo domini `gennaromazzacane.it` e `memoriesospese.it`
- **CORS**: Origini controllate per endpoint HTTP
- **Secrets**: `REPL_IDENTITY` per accesso Gmail API

## Monitoraggio Produzione

### Dashboard React Component

Usa `<EmailQueueMonitor />` già implementato in `client/src/components/EmailQueueMonitor.tsx`

### Firestore Console

Monitora collection `emailQueue`:
- Filtra per `status == 'failed'` per errori
- Ordina per `createdAt desc` per ultimi invii

## Troubleshooting

### Email bloccate in `processing`

```typescript
// Cloud Function timeout? Controlla lock scaduti:
db.doc('locks/emailQueue').get().then(doc => {
  if (doc.exists && doc.data().lockedUntil < Date.now()) {
    doc.ref.delete(); // Rilascia lock manualmente
  }
});
```

### Rate limit raggiunto

```bash
# Verifica stats correnti
curl https://.../getEmailQueueStats

# Se todayCount >= 1800, attendi 24h
# Se lastHourCount >= 90, attendi 1h
```

## Deployment

Sistema già deployato su Firebase Cloud Functions:

```bash
# Deploy functions
firebase deploy --only functions

# Verifica scheduler attivo
firebase functions:log --only processEmailQueue
```

## Estensioni Future

- [ ] **Webhook Gmail** per tracking opened/clicked
- [ ] **Dead letter queue** per email failed permanenti
- [ ] **Email templates** centralizzati
- [ ] **A/B testing** subject lines
- [ ] **Unsubscribe** automatico

---

**Autore**: Sistema implementato per Memorie Sospese  
**Versione**: 2.0 (con distributed lock)  
**Ultimo aggiornamento**: Gennaio 2025
