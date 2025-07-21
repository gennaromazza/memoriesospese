# Guida Amministrazione Abbonamenti

## 🔧 Dashboard Amministratore

### Accesso Admin Panel
1. **Login come admin**: usa `gennaro.mazzacane@gmail.com`
2. **Vai su `/admin`** (se non esiste, aggiungeremo il pannello)
3. **Accesso automatico** alle funzionalità di gestione

### Funzionalità Admin Disponibili

#### 1. Gestione Utenti (`/admin/users`)
- **Visualizza tutti gli utenti** registrati
- **Modifica piani** di abbonamento manualmente
- **Assegna crediti** extra (gallerie/foto)
- **Bannare/riabilitare** utenti
- **Reset password** per gli utenti

#### 2. Gestione Abbonamenti (`/admin/subscriptions`)
- **Lista tutti gli abbonamenti** attivi
- **Dettagli fatturazione** per utente
- **Storia pagamenti** completa
- **Gestione rimborsi** diretti
- **Upgrade/downgrade** manuali

#### 3. Analytics (`/admin/analytics`)
- **Revenue tracking** mensile
- **Conversioni** per piano
- **Churn rate** abbonamenti
- **Metriche utilizzo** gallerie

## 💰 Gestione Finanziaria

### 1. Stripe Dashboard (Principale)
**URL**: https://dashboard.stripe.com

#### Revenue Overview
- **Monthly Recurring Revenue (MRR)**
- **Subscription growth** trends
- **Failed payments** monitoring
- **Churn analysis**

#### Customer Management
```
- Ricerca customer per email
- Visualizza subscription history
- Gestisci payment methods
- Processa rimborsi
- Aggiorna billing info
```

#### Webhook Monitoring
```
- Verifica webhook delivery
- Debug failed webhooks  
- Retry failed events
- Monitor API errors
```

### 2. Firebase Console Admin

#### Firestore Database Access
**Path**: `users/{uid}/subscription/current`

**Campi Subscription**:
```javascript
{
  plan: 'free' | 'starter' | 'pro' | 'premium',
  active: boolean,
  expiresAt: Date | null,
  stripeCustomerId: string,
  stripeSubscriptionId: string,
  currentPeriodEnd: Date,
  cancelAtPeriodEnd: boolean,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

#### Functions Logs
- **Monitor webhook** execution
- **Debug subscription** errors
- **Track API calls** to Stripe

## 🛠️ Operazioni Admin Comuni

### 1. Upgrade Manuale Utente
```javascript
// Via Firebase Console
// Path: users/{uid}/subscription/current
{
  plan: 'pro',           // Cambia piano
  active: true,
  expiresAt: null,       // null = non scade
  // Altri campi...
}
```

### 2. Gestione Rimborsi
```javascript
// Via Stripe Dashboard
1. Trova customer
2. Vai a subscription
3. Click "Refund" 
4. Seleziona ammontare
5. Motivo rimborso
```

### 3. Reset Abbonamento
```javascript
// Emergency reset via Firestore
// Set plan to 'free' and active: false
{
  plan: 'free',
  active: false,
  expiresAt: new Date() // Imposta scadenza immediata
}
```

### 4. Crediti Extra (Manuale)
```javascript
// Path: users/{uid}/credits (nuova collection)
{
  extraGalleries: 5,     // Gallerie bonus
  extraPhotos: 10000,    // Foto bonus
  grantedBy: 'admin',
  reason: 'Customer support',
  expiresAt: Date
}
```

## 📊 Monitoraggio Performance

### Key Metrics da Tracciare
1. **MRR (Monthly Recurring Revenue)**
2. **Customer Lifetime Value (CLV)**
3. **Churn Rate** per piano
4. **Conversion Rate** Free → Paid
5. **Average Revenue Per User (ARPU)**

### Report Automatici (da Implementare)
```javascript
// Monthly reports via email
- Revenue summary
- New subscriptions
- Cancellations
- Top performing plans
- Customer support tickets
```

## 🚨 Gestione Problemi Frequenti

### 1. Pagamento Fallito
**Azione**:
1. Stripe invia email automatica al customer
2. Retry automatico per 3-4 volte
3. Se continua a fallire → subscription canceled
4. Admin può riattivare manualmente

### 2. Customer Vuole Cancellare
**Processo**:
1. **Self-service**: Customer Portal Stripe
2. **Assistito**: Admin cancella da Stripe Dashboard
3. **Retention**: Offri downgrade invece di cancellazione

### 3. Upgrade Request Fallito
**Debug**:
1. Check Firebase Functions logs
2. Verifica webhook delivery
3. Test manual subscription in Stripe
4. Sync data Firebase ← → Stripe

### 4. Accesso Negato a Funzionalità
**Verifica**:
```javascript
// Check user subscription status
1. Firebase: users/{uid}/subscription/current
2. Stripe: customer subscription status
3. App cache: localStorage clear
4. Force refresh: window.location.reload()
```

## 🔧 Tools Amministrazione

### 1. Stripe CLI (Avanzato)
```bash
# Install
npm install -g stripe

# Login
stripe login

# List customers
stripe customers list

# Get subscription
stripe subscriptions retrieve sub_xxx

# Create test subscription
stripe subscriptions create \
  --customer cus_xxx \
  --items '[{"price":"price_xxx"}]'
```

### 2. Firebase Admin SDK (Script Manuali)
```javascript
// Script per bulk operations
const admin = require('firebase-admin');

// Update all users to premium
const batch = admin.firestore().batch();
// ... batch operations
```

### 3. Custom Admin Panel (da Aggiungere)
```javascript
// Componenti necessari:
- UserSubscriptionManager
- BulkOperationsPanel  
- RevenueAnalytics
- SupportTicketSystem
```

## 📞 Supporto Customer

### Template Risposte Comuni

#### Problema Fatturazione
```
Ciao [Nome],

Ho verificato il tuo account e vedo che c'è stato un problema con il pagamento.
Ho risolto manualmente e il tuo piano [Piano] è ora attivo.

Per evitare problemi futuri, ti consiglio di aggiornare il metodo di pagamento
nel Customer Portal: [link]

Fammi sapere se hai altre domande.

Best,
Team Memorie Sospese
```

#### Richiesta Upgrade
```
Ciao [Nome],

Perfetto! Ho aggiornato il tuo account al piano [Piano].
Ora hai accesso a:
- [Feature 1]
- [Feature 2]
- [Feature 3]

Le nuove funzionalità sono attive immediatamente.

Best,
Team Memorie Sospese
```

### Escalation Process
1. **L1**: FAQ e Customer Portal
2. **L2**: Email support con admin manual fix
3. **L3**: Stripe support per payment issues
4. **L4**: Developer intervention

## 📈 Growth & Expansion

### Upgrade Incentives
1. **Usage-based notifications**: "Hai usato 8/10 foto"
2. **Feature teasing**: Mostra funzionalità locked
3. **Limited time offers**: Sconto primo mese
4. **Success stories**: Case study altri fotografi

### Retention Strategies
1. **Exit intent surveys**: Perché cancelli?
2. **Downgrade option**: Pro → Starter invece di Free
3. **Pausa subscription**: 1-3 mesi gratis
4. **Win-back campaigns**: Email sequence post-cancellazione