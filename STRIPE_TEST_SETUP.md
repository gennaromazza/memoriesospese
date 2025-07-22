# 🧪 Configurazione Stripe Test Environment 

## ✅ Setup Completato 

**ENVIRONMENT ATTUALE: DEVELOPMENT (TEST MODE)**
- ✅ Chiave pubblica test attiva in `.env`
- ✅ Chiave segreta test configurata in `functions/src/stripe.ts`
- ✅ Price ID di test configurati per tutti i piani
- ✅ Webhook test configurato

**Le tue CHIAVI DI PRODUZIONE sono al sicuro:**
- 🔒 Commentate in `.env` (linea 29)
- 🔒 Configurate per `NODE_ENV=production` in functions
- 🔒 Attivazione automatica al deployment

## 🧪 Come Testare

### 1. Carte di Test Stripe
Usa queste carte per testare i pagamenti (tutte accettate):

**Successo:**
- `4242 4242 4242 4242` (Visa)
- `4000 0566 5566 5556` (Visa debit)
- `5555 5555 5555 4444` (Mastercard)

**Fallimento:**
- `4000 0000 0000 0002` (Carta declinata)
- `4000 0000 0000 9995` (Fondi insufficienti)

### 2. Dettagli Carta Test
- **Scadenza:** Qualsiasi data futura (es. 12/28)
- **CVC:** Qualsiasi 3 cifre (es. 123)
- **Nome:** Qualsiasi nome
- **CAP:** Qualsiasi CAP valido (es. 20100)

### 3. Piani di Test Configurati

#### Free Plan
- **Price ID:** Gratuito (nessun pagamento)
- **Prezzo:** €0/mese
- **Test:** Registrazione gratuita e accesso immediato

#### Starter Plan  
- **Price ID:** `price_1OODKjEfHcSzngQqtest_starter`
- **Prezzo:** €10/mese  
- **Test:** Pagamento abbonamento con carte test Stripe

#### Pro Plan
- **Price ID:** `price_1OODKjEfHcSzngQqtest_pro`
- **Prezzo:** €20/mese
- **Test:** Abbonamento premium con tutte le funzionalità Pro

#### Premium Plan
- **Price ID:** `price_1OODKjEfHcSzngQqtest_premium`
- **Prezzo:** €40/mese
- **Test:** Piano completo con download ZIP e storage illimitato

## 🔄 Flusso di Test Completo

1. **Registrazione Fotografo** → `/photographer-register`
2. **Selezione Piano** → Vai a `/pricing`
3. **Checkout Test** → Usa carte di test sopra
4. **Verifica Abbonamento** → Dashboard utente
5. **Test Funzionalità** → Watermark, export, etc.

## 🚀 Passaggio a Produzione

Per andare live:
1. Cambia `NODE_ENV=production` 
2. Decommentare chiavi live in `.env`
3. Configurare webhook Stripe per produzione
4. Deploy su dominio finale

## 📧 Webhook Test
- URL test: `https://your-domain/api/stripe-webhook`
- Secret test: `whsec_test_1234567890abcdef`
- Eventi: subscription_created, payment_succeeded, etc.

## 🎯 TEST RAPIDO - Prova Subito

1. **Vai a:** `/landing` → Clicca "Inizia Gratis"
2. **Registra fotografo** con email test
3. **Vai a pricing:** Scegli piano Starter/Pro/Premium  
4. **Usa carta test:** `4242 4242 4242 4242`
5. **Completa checkout** e verifica abbonamento attivo

## 💡 Note Importante
- ✅ In test mode NON ci sono addebiti reali
- ✅ Tutti i pagamenti sono simulati  
- ✅ Le tue chiavi di produzione rimangono sicure e separate
- ✅ Puoi testare cancellazioni e aggiornamenti abbonamenti
- ✅ Checkout reindirizza correttamente dopo successo/cancellazione