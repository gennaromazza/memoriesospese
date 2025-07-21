# Guida Completa: Test degli Abbonamenti Stripe

## 🧪 Come Testare il Sistema Abbonamenti

### 1. Configurazione Test Stripe

Per testare senza pagamenti reali, dovresti usare le chiavi di test Stripe:

```bash
# Chiavi TEST (per sviluppo)
VITE_STRIPE_PUBLIC_KEY=pk_test_...
# Nel Firebase Functions config:
stripe.secret_key=sk_test_...
```

**NOTA IMPORTANTE**: Attualmente stai usando chiavi LIVE. Per test sicuri, usa le chiavi TEST dal dashboard Stripe.

### 2. Testing Flusso di Abbonamento

#### A. Test Creazione Account
1. Vai su `/register` o `/login`
2. Crea un nuovo account
3. Verifica che l'utente abbia piano "free" di default

#### B. Test Upgrade a Piano Premium
1. **Accedi come utente autenticato**
2. **Vai su `/pricing`** oppure clicca "Prezzi" nella navigazione
3. **Seleziona un piano** (es. Pro €29/mese)
4. **Procedi al checkout Stripe**
5. **Usa carte di test Stripe**:
   ```
   Carta Successo: 4242 4242 4242 4242
   Data: qualunque futura (es. 12/28)
   CVC: qualunque 3 cifre (es. 123)
   ```
6. **Completa il pagamento**
7. **Verifica redirect** alla success page
8. **Controlla in Firebase** che subscription sia salvata

#### C. Test Gestione Abbonamento
1. **Vai su `/profile`** dopo l'abbonamento
2. **Verifica stato abbonamento** mostrato correttamente
3. **Click "Gestisci Abbonamento"**
4. **Testa Stripe Customer Portal**:
   - Aggiorna metodo pagamento
   - Cambia piano
   - Annulla abbonamento

### 3. Testing Controlli Accesso

#### A. Limiti Creazione Gallerie
```javascript
// Test su /galleries o componente creazione
Piano Free: max 2 gallerie
Piano Starter: max 5 gallerie  
Piano Pro/Premium: illimitate
```

#### B. Limiti Upload Foto
```javascript
// Test upload foto
Piano Free: max 10 foto per galleria
Piano Starter: max 5,000 foto per galleria
Piano Pro: max 25,000 foto per galleria
Piano Premium: illimitate
```

#### C. Funzionalità Premium
```javascript
// Test accesso funzionalità
Watermark personalizzato: Solo Pro/Premium
Download ZIP: Solo Premium
Export CSV: Solo Pro/Premium
```

### 4. Test Webhook Stripe

I webhook gestiscono automaticamente:
- **Abbonamento attivato**: `checkout.session.completed`
- **Pagamento ricorrente**: `invoice.payment_succeeded`
- **Pagamento fallito**: `invoice.payment_failed`
- **Abbonamento cancellato**: `customer.subscription.deleted`

**Verifica**: Controlla Firebase Firestore collection `users/{uid}/subscription/current`

## 🔧 Tools per Testing

### 1. Stripe Dashboard
- **Test Mode**: https://dashboard.stripe.com/test
- **Webhook logs**: Verifica chiamate webhook
- **Customer list**: Vedi clienti creati
- **Subscription list**: Monitora abbonamenti

### 2. Firebase Console
- **Firestore Database**: Controlla dati subscription
- **Functions Logs**: Debug errori webhook
- **Authentication**: Verifica utenti registrati

### 3. Chrome DevTools
```javascript
// Console browser - verifica stato utente
console.log(user);
console.log(planType);
console.log(features);
```

## 🚨 Problemi Comuni e Soluzioni

### 1. Webhook Non Funziona
```bash
# Controlla URL webhook Stripe
https://console.firebase.google.com/functions

# Endpoint webhook dovrebbe essere:
https://YOUR-REGION-YOUR-PROJECT.cloudfunctions.net/stripeWebhook
```

### 2. Piano Non Aggiornato
```javascript
// Forza refresh hook subscription
window.location.reload();

// O controlla Firebase Firestore manualmente
```

### 3. Redirect Loop Checkout
```javascript
// Verifica success_url e cancel_url nel checkout
// Dovrebbero puntare a URL validi dell'app
```

## 📋 Checklist Completa Test

- [ ] **Registrazione utente** → Piano Free automatico
- [ ] **Upgrade a Starter** → Checkout + webhook + access controls
- [ ] **Upgrade a Pro** → Watermark + CSV export abilitati  
- [ ] **Upgrade a Premium** → ZIP download abilitato
- [ ] **Customer Portal** → Gestione billing funzionante
- [ ] **Cancellazione** → Downgrade a Free automatico
- [ ] **Limiti gallerie** → Rispettati per ogni piano
- [ ] **Limiti foto** → Controllati durante upload
- [ ] **Funzionalità premium** → Abilitate/disabilitate correttamente

## 🔄 Test Automatizzati (Opzionale)

Per test avanzati, puoi usare Stripe CLI:

```bash
# Installa Stripe CLI
stripe listen --forward-to localhost:5001/webhook

# Simula webhook
stripe trigger checkout.session.completed
```

## 📞 Supporto

Se hai problemi:
1. **Stripe Dashboard** → Logs per errori webhook
2. **Firebase Console** → Functions logs per debug
3. **Browser DevTools** → Network tab per errori API
4. **Firestore** → Verifica dati subscription salvati