# Sistema Email Gmail - Documentazione

## ✅ Implementazione Completata

Il sistema email è stato **completamente migrato** a Gmail API utilizzando l'integrazione Replit OAuth2 per gestione automatica delle credenziali.

## Architettura

### Stack Tecnologico
- **Gmail API**: Google OAuth2 per invio email
- **Replit Integration**: Gestione automatica access token e refresh
- **Firebase Cloud Functions**: Hosting serverless functions email
- **Node.js googleapis**: Client library ufficiale Google

### Vantaggi Gmail API
- ✅ **Gratuito**: Nessun costo per invio email
- ✅ **Affidabile**: Infrastruttura Google con alta deliverability
- ✅ **Sicuro**: OAuth2 gestito da Replit, nessuna password hardcoded
- ✅ **Scalabile**: Limite giornaliero generoso per applicazioni
- ✅ **Zero configurazione**: Integrazione Replit gestisce tutto automaticamente

## File Principali

### 1. functions/src/gmail.ts
Modulo centralizzato per gestione Gmail API:
- `getGmailClient()`: Crea client autenticato (non cachare, token scadono)
- `sendGmailEmail()`: Invia email tramite Gmail API
- Template HTML per tutte le tipologie email

### 2. functions/src/index.ts
Firebase Cloud Functions che espongono endpoint email:
- `sendNewPhotosNotification`: Notifica nuove foto (onRequest + CORS)
- `sendNewPhotosNotificationCall`: Versione callable per compatibility
- `sendGalleryPassword`: Invio credenziali accesso galleria
- `testEmailConfiguration`: Test configurazione email
- `sendWelcomeEmail`: Email benvenuto nuovi iscritti

### 3. client/src/lib/email.ts
Client-side service per chiamare Firebase Functions. Include autenticazione Firebase per HTTP endpoint:
- Ottiene ID token da Firebase Auth current user
- Aggiunge Authorization header `Bearer {token}` alle richieste HTTP
- Fallback graceful se token non disponibile

## Funzioni Email Disponibili

### 1. Notifica Nuove Foto
```typescript
// Firebase Function: sendNewPhotosNotificationCall
await sendNewPhotosNotification({
  galleryName: string,
  newPhotosCount: number,
  uploaderName: string,
  galleryUrl: string,
  recipients: string[]
});
```

**Nota:** L'endpoint HTTP (`sendNewPhotosNotification`) richiede autenticazione Firebase. Il client aggiunge automaticamente il token ID Firebase nell'header `Authorization: Bearer {token}`.

### 2. Password Galleria
```typescript
// Firebase Function: sendGalleryPassword
await sendGalleryPassword({
  recipientEmail: string,
  galleryName: string,
  galleryCode: string,
  galleryPassword?: string
});
```

### 3. Email Benvenuto
```typescript
// Firebase Function: sendWelcomeEmail
await sendWelcomeEmail({
  recipientEmail: string,
  galleryName: string
});
```

### 4. Test Configurazione
```typescript
// Firebase Function: testEmailConfiguration
await testEmailConfiguration({
  testRecipient?: string // Default: gennaro.mazzacane@gmail.com
});
```

## Integrazione Replit Gmail

L'integrazione Replit gestisce automaticamente:

1. **OAuth2 Authentication**: Flow completo gestito da Replit
2. **Access Token Management**: Refresh automatico quando scade
3. **Permissions**: Scope Gmail configurati automaticamente
4. **Security**: Token mai esposti nel codice

### Codice Autenticazione (già implementato)
```typescript
// functions/src/gmail.ts
async function getAccessToken() {
  // Recupera token dall'integrazione Replit
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY || process.env.WEB_REPL_RENEWAL;
  
  // Fetch connection settings con token valido
  connectionSettings = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=google-mail`,
    { headers: { 'X_REPLIT_TOKEN': xReplitToken } }
  ).then(res => res.json());
  
  return connectionSettings.settings.access_token;
}
```

## Template Email HTML

Tutti i template sono responsive e professionali:

### Nuove Foto
- Design elegante con colori brand (#8b5a3c)
- Badge numero foto
- CTA button "Visualizza la Galleria"
- Responsive mobile-first

### Password Galleria
- Codice galleria in monospace
- Password opzionale
- Istruzioni chiare accesso

### Benvenuto
- Messaggio accogliente
- Spiegazione funzionalità notifiche
- Tono friendly e coinvolgente

### Test Email
- Timestamp invio
- Conferma sistema operativo
- Status check visivo

## Deployment

### 1. Deploy Firebase Functions
```bash
cd functions
npm install
firebase deploy --only functions
```

### 2. Verifica Integrazione
L'integrazione Gmail Replit deve essere attiva:
- Connessione OAuth2 configurata
- Permissions Gmail granted
- Access token valido

### 3. Test Produzione
```typescript
// Chiama da client
import { testEmailSystem } from '@/lib/email';
const result = await testEmailSystem();
console.log(result); // { success: true, message: "Test email sent" }
```

## Gestione Errori

Il sistema include robust error handling:

1. **Token Expiration**: Automatic refresh tramite Replit
2. **API Failures**: Logging dettagliato con Firebase Logger
3. **Development Mode**: Skip invio in dev, log informativi
4. **Fallback Queue**: Firestore emailQueue per retry in produzione

## Limiti e Quote

### Gmail API Limits (Free)
- **Invio giornaliero**: ~2000 email/giorno (utente standard)
- **Rate limiting**: ~100 email/minuto
- **Dimensione**: Max 25MB per email

### Best Practices
- Batch recipients quando possibile
- Implementare rate limiting lato application
- Monitorare quota usage via Google Cloud Console

## Migrazione Completata

### Rimosso
- ❌ Brevo/Sendinblue SMTP configuration
- ❌ Nodemailer transporter
- ❌ Hardcoded credentials
- ❌ EMAIL_SYSTEM_DOCS.md (obsoleto)
- ❌ CENTRALIZED_EMAIL_CHECKLIST.md (obsoleto)

### Aggiunto
- ✅ Gmail API client (`functions/src/gmail.ts`)
- ✅ Replit OAuth2 integration
- ✅ Template HTML centralizzati
- ✅ Error handling robusto
- ✅ Documentazione aggiornata

## Troubleshooting

### Email non arrivano
1. Verifica integrazione Replit attiva
2. Check Firebase Functions logs: `firebase functions:log`
3. Verifica quota Gmail non esaurita
4. Controlla spam folder destinatario

### Token errors
1. Reconnect integrazione Gmail in Replit
2. Verifica environment variables corrette
3. Check permissions scope Gmail

### Development testing
Le email NON vengono inviate in development mode per evitare spam. 
Usa `NODE_ENV=production` per test reali.

## Monitoring

### Firebase Console
- Functions logs: Dettagli esecuzione e errori
- Performance: Latency e success rate
- Usage: Invocations count

### Replit Dashboard
- Connection status: Verifica OAuth2 active
- Token expiry: Monitoring automatic refresh

## 🎉 Risultato Finale

**Sistema Email Gmail Completamente Funzionale**

- 📧 Invio email gratuito via Gmail API
- 🔐 OAuth2 sicuro gestito da Replit
- 🚀 Zero configurazione manuale
- ✨ Template HTML professionali
- 📊 Logging e monitoring completo
- 🔄 Fallback resiliente con queue system

Sistema pronto per produzione con affidabilità Google garantita!
