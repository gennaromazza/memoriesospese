# Piano Completo Notifiche Email Gmail

## 📊 Analisi Stato Attuale

### ✅ Email Implementate (Gmail API)
1. **Nuove Foto** - Notifica subscribers quando vengono caricate nuove foto
2. **Welcome Email** - Conferma iscrizione alle notifiche galleria
3. **Password Galleria** - Invio credenziali accesso (DA IMPLEMENTARE correttamente)
4. **Test Email** - Verifica configurazione sistema

### ❌ Problemi Critici Identificati

#### 🔴 PROBLEMA PRINCIPALE: Password Galleria Visualizzata Nel Browser
**File:** `client/src/pages/RequestPassword.tsx` (linee 223-226)

**Situazione Attuale:**
Quando un utente richiede la password per accedere a una galleria:
1. Compila form con dati personali
2. Eventuale risposta a domanda di sicurezza
3. **LA PASSWORD VIENE VISUALIZZATA NEL BROWSER** (righe 223-226)

```tsx
<div className="bg-sage/10 border border-sage/30 rounded-lg p-4 mb-6">
  <div className="text-lg font-mono font-bold text-blue-gray">
    {finalPassword}  // ⚠️ PASSWORD ESPOSTA NEL BROWSER
  </div>
</div>
```

**Problema di Sicurezza:**
- ❌ Password visibile a chiunque abbia accesso al browser dell'utente
- ❌ Password potrebbe essere catturata da screenshot
- ❌ Password rimane nella cronologia del browser
- ❌ Nessuna traccia email dell'invio password

**Soluzione Richiesta:**
- ✅ Inviare password via email Gmail API
- ✅ Mostrare messaggio conferma invio email
- ✅ Non visualizzare mai password nel browser
- ✅ Log tracciabile invio email

---

## 📧 Nuove Notifiche Email da Implementare

### 1. 🔐 Password Galleria via Email (PRIORITÀ MASSIMA)

**Descrizione:** Quando un utente richiede accesso alla galleria, inviare password via email invece di mostrarla nel browser.

**Flusso Implementazione:**
```
1. Utente compila form richiesta password
2. Sistema valida dati (inclusa eventuale security question)
3. Sistema invia email con password tramite Gmail API
4. Utente riceve email con:
   - Nome galleria
   - Codice galleria
   - Password galleria
   - Link diretto alla galleria
5. Browser mostra: "Email inviata a [email]! Controlla la tua casella di posta"
```

**Template Email:**
```html
Oggetto: 🔑 Password per la galleria "{galleryName}"

Ciao {firstName} {lastName},

La tua richiesta di accesso è stata approvata!

📸 Galleria: {galleryName}
🔑 Password: {password}
🔗 Link diretto: {galleryUrl}

Usa questa password per accedere alla galleria e visualizzare le foto.

Buona visione!
Memorie Sospese
```

**File da Modificare:**
- `client/src/pages/RequestPassword.tsx` - Rimuovere visualizzazione password
- `client/src/hooks/use-password-request.ts` - Chiamare sendGalleryPassword invece di ritornare password
- `functions/src/gmail.ts` - Template già esistente (verificare)

---

### 2. 💬 Notifica Nuovo Commento

**Descrizione:** Quando qualcuno commenta una foto, notificare il proprietario della galleria e l'uploader della foto.

**Destinatari:**
- Proprietario galleria (admin)
- Uploader foto (se diverso dal proprietario)
- Altri utenti che hanno commentato la stessa foto (opzionale)

**Trigger:** `CommentService.addComment()` in `client/src/lib/comments.ts`

**Template Email:**
```html
Oggetto: 💬 Nuovo commento nella galleria "{galleryName}"

{commenterName} ha lasciato un commento:

"{commentText}"

Foto: {photoUrl}
Galleria: {galleryUrl}

Visualizza e rispondi!
```

---

### 3. ❤️ Notifica Nuovo Like (Opzionale)

**Descrizione:** Notifica quando una foto riceve un like (configurabile, potrebbe generare troppe email).

**Trigger:** `LikeService.toggleLike()` in `client/src/lib/likes.ts`

**Opzioni Implementazione:**
1. **Email immediata** - Ad ogni like (potrebbe essere spam)
2. **Email giornaliera** - Riassunto likes del giorno
3. **Email settimanale** - Report likes settimanale
4. **Soglia** - Solo dopo N likes su una foto

**Template Email (se implementato):**
```html
Oggetto: ❤️ La tua foto ha ricevuto {likeCount} nuovi like!

{likerName} ha messo "mi piace" alla tua foto nella galleria "{galleryName}"

Totale likes: {totalLikes}
Visualizza: {photoUrl}
```

---

### 4. 🎙️ Notifica Voice Memo Sbloccato

**Descrizione:** Quando un voice memo viene sbloccato (dopo unlock date), notificare gli sposi/proprietari galleria.

**Trigger:** Verificare `VoiceMemoService` in `client/src/lib/voiceMemos.ts` - potrebbe servire Cloud Function schedulata

**Template Email:**
```html
Oggetto: 🎙️ Un nuovo messaggio vocale è stato sbloccato!

Ciao {ownerName},

Un messaggio vocale di {guestName} è ora disponibile nella galleria "{galleryName}".

Messaggio: "{memoMessage}"
Durata: {duration} secondi

Ascolta ora: {galleryUrl}#voice-memos

Con affetto,
Memorie Sospese
```

**Nota Implementazione:**
Serve Cloud Function schedulata (Firebase Functions) che:
1. Ogni ora verifica voice memos con `unlockDate` scaduto
2. Marca come `isUnlocked: true`
3. Invia email notifica ai proprietari galleria

---

### 5. 🎉 Conferma Creazione Galleria (Admin)

**Descrizione:** Quando un admin crea una nuova galleria, inviare email di conferma con riepilogo.

**Trigger:** `createGallery()` in `client/src/lib/firebase-api.ts`

**Template Email:**
```html
Oggetto: ✅ Galleria "{galleryName}" creata con successo!

La galleria è stata creata correttamente:

📸 Nome: {galleryName}
📅 Data evento: {eventDate}
📍 Luogo: {location}
🔑 Codice accesso: {galleryCode}
🔐 Password: {galleryPassword}

🔗 Link galleria: {galleryUrl}
🔗 Link admin: {adminUrl}

Prossimi passi:
1. Carica foto di copertina
2. Invita gli ospiti condividendo il link
3. Configura notifiche email

Buon lavoro!
Memorie Sospese Admin
```

---

### 6. 📊 Report Statistiche Galleria (Admin)

**Descrizione:** Report periodico (settimanale/mensile) con statistiche gallerie.

**Frequenza:** Configurabile (settimanale o mensile)

**Contenuto Report:**
- Numero totale gallerie
- Gallerie più attive (foto/commenti/likes)
- Nuove iscrizioni newsletter
- Top foto per likes
- Statistiche voice memos
- Storage utilizzato

**Template Email:**
```html
Oggetto: 📊 Report Settimanale Memorie Sospese

Ciao Admin,

Ecco il report della settimana scorsa:

📸 Gallerie Attive: {activeGalleries}
🆕 Nuove Gallerie: {newGalleries}
📷 Foto Caricate: {photosUploaded}
💬 Commenti: {commentsCount}
❤️ Likes: {likesCount}
🎙️ Voice Memos: {voiceMemosCount}

🏆 Galleria Più Popolare: {topGalleryName}
- Foto: {topGalleryPhotos}
- Likes: {topGalleryLikes}

💾 Storage: {storageUsed} / {storageTotal}

Visualizza dashboard: {adminDashboardUrl}

Buona settimana!
Memorie Sospese
```

**Implementazione:**
- Firebase Cloud Function schedulata (Cloud Scheduler)
- Cron job: ogni lunedì alle 09:00
- Aggregazione dati da Firestore
- Invio email a admin configurato

---

### 7. 🔔 Notifica Richiesta Accesso Galleria (Admin)

**Descrizione:** Quando qualcuno richiede accesso a una galleria protetta, notificare l'admin.

**Trigger:** Quando viene creato record in `gallery-access` collection

**Template Email:**
```html
Oggetto: 🔔 Nuova richiesta di accesso - Galleria "{galleryName}"

Un utente ha richiesto accesso alla galleria:

👤 Nome: {firstName} {lastName}
📧 Email: {email}
🤝 Relazione: {relation}

Galleria: {galleryName}
Data richiesta: {requestDate}

Approva o rifiuta la richiesta: {adminUrl}/access-requests

Memorie Sospese Admin
```

---

### 8. ⚠️ Alert Sistema (Admin)

**Descrizione:** Notifiche automatiche per eventi importanti del sistema.

**Eventi da Monitorare:**
1. **Storage quasi pieno** (>80%)
2. **Errori critici** ripetuti (>10 in 1 ora)
3. **Upload falliti** (>5 consecutive failures)
4. **Limite email Gmail** quasi raggiunto
5. **Attività sospette** (es. troppe richieste password)

**Template Email:**
```html
Oggetto: ⚠️ [ALERT] {alertType} - Memorie Sospese

ALERT SISTEMA: {alertType}

Dettagli:
{alertDetails}

Timestamp: {timestamp}
Severità: {severity}

Azione richiesta: {actionRequired}

Dashboard: {adminDashboardUrl}

Memorie Sospese System
```

---

## 🛠️ Implementazione Tecnica

### Firebase Cloud Functions da Creare

#### 1. Email Password Galleria (modifica esistente)
```typescript
// functions/src/index.ts
export const sendGalleryPasswordEmail = onCall(async (request) => {
  const { recipientEmail, galleryName, galleryCode, galleryPassword, firstName, lastName } = request.data;
  
  const htmlContent = createGalleryPasswordEmailHTML(
    galleryName, 
    galleryCode, 
    galleryPassword,
    firstName,
    lastName
  );
  
  await sendGmailEmail(recipientEmail, subject, htmlContent);
});
```

#### 2. Notifica Nuovo Commento
```typescript
export const sendCommentNotification = onCall(async (request) => {
  const { photoId, commentText, commenterName, galleryOwnerEmail } = request.data;
  // Implementazione...
});
```

#### 3. Voice Memo Sblocco (Scheduled Function)
```typescript
export const checkUnlockedVoiceMemos = onSchedule("every 1 hours", async (event) => {
  // Query voice memos con unlockDate < now e isUnlocked = false
  // Marca come unlocked
  // Invia email ai proprietari galleria
});
```

#### 4. Report Statistiche (Scheduled Function)
```typescript
export const sendWeeklyReport = onSchedule("every monday 09:00", async (event) => {
  // Aggrega statistiche settimanali
  // Invia email report a admin
});
```

### Template HTML Email da Creare

File: `functions/src/gmail.ts`

Aggiungere:
- `createCommentNotificationHTML()`
- `createLikeNotificationHTML()`
- `createVoiceMemoUnlockedHTML()`
- `createGalleryCreatedHTML()`
- `createWeeklyReportHTML()`
- `createAccessRequestHTML()`
- `createSystemAlertHTML()`

### Client-Side Updates

**File da Modificare:**

1. **RequestPassword.tsx**
   - Rimuovere visualizzazione password (righe 207-238)
   - Chiamare `sendGalleryPasswordEmail` Cloud Function
   - Mostrare conferma invio email

2. **comments.ts**
   - Aggiungere chiamata `sendCommentNotification` dopo `addComment`

3. **voiceMemos.ts**
   - Preparare per scheduled function (solo metadata, function lato server)

4. **firebase-api.ts (createGallery)**
   - Aggiungere chiamata `sendGalleryCreatedEmail`

---

## 📋 Piano di Implementazione Prioritario

### Fase 1: FIX CRITICO (Immediate - 1-2 ore)
1. ✅ Modificare RequestPassword.tsx per inviare password via email
2. ✅ Testare flusso completo richiesta password
3. ✅ Verificare ricezione email

### Fase 2: NOTIFICHE CORE (1-2 giorni)
1. ✅ Implementare notifica nuovi commenti
2. ✅ Implementare email conferma creazione galleria
3. ✅ Testare entrambe le notifiche

### Fase 3: VOICE MEMOS (1 giorno)
1. ✅ Creare Cloud Function schedulata sblocco voice memos
2. ✅ Implementare email notifica sblocco
3. ✅ Testare con voice memo test

### Fase 4: ADMIN TOOLS (1-2 giorni)
1. ✅ Implementare report statistiche settimanale
2. ✅ Implementare notifica richieste accesso
3. ✅ Implementare alert sistema
4. ✅ Dashboard admin per configurazione email

### Fase 5: OPZIONALI (se necessario)
1. ⚪ Notifiche likes (con configurazione)
2. ⚪ Email digest giornaliero/settimanale utenti
3. ⚪ Newsletter automatica

---

## 🔍 Verifica Sistema Esistente

### Test Email Nuove Foto
```typescript
// Test da eseguire
1. Crea galleria test
2. Iscriviti alle notifiche (2-3 email test)
3. Carica nuove foto
4. Verifica ricezione email notifica
5. Controlla logs Firebase Functions
```

### Controlli Pre-Implementazione
- [ ] Gmail API funziona correttamente
- [ ] Integrazione Replit OAuth2 attiva
- [ ] Firebase Functions deployed
- [ ] Template email esistenti funzionanti
- [ ] Limite email Gmail non raggiunto

---

## 📊 Metriche di Successo

### KPI Email System
1. **Deliverability Rate**: >98% email consegnate
2. **Open Rate**: >40% email aperte
3. **Error Rate**: <1% errori invio
4. **Response Time**: <2 secondi invio email
5. **User Satisfaction**: Feedback positivo su notifiche

### Monitoring
- Firebase Functions logs
- Gmail API quota usage
- Email bounce rate
- User feedback on notifications

---

## 🚨 Considerazioni Importanti

### Limiti Gmail API (Free)
- **Quota giornaliera**: ~2000 email/giorno
- **Rate limit**: ~100 email/minuto
- **Monitoring**: Implementare tracking quota usage

### Privacy & GDPR
- [ ] Opt-in esplicito per ogni tipo notifica
- [ ] Unsubscribe link in ogni email
- [ ] Privacy policy aggiornata
- [ ] Consenso tracciato in Firestore

### Best Practices
1. **Batching**: Raggruppa notifiche simili
2. **Throttling**: Limita frequenza email per utente
3. **Personalizzazione**: Nome utente in ogni email
4. **Mobile-First**: Template responsive
5. **A/B Testing**: Ottimizza subject lines

---

## 📝 Checklist Finale

### Prima di Deploy
- [ ] Tutti i template email testati
- [ ] Error handling robusto
- [ ] Logging completo
- [ ] Rate limiting implementato
- [ ] Fallback mechanisms pronti
- [ ] Documentazione aggiornata
- [ ] Test end-to-end completati

### Post-Deploy
- [ ] Monitor logs prime 24h
- [ ] Verifica deliverability
- [ ] Raccolta feedback utenti
- [ ] Ottimizzazione template
- [ ] Tracking metriche

---

**Documento creato:** 2025-10-16
**Ultima modifica:** 2025-10-16
**Versione:** 1.0
