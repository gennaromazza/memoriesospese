# Firebase Security Rules - Aggiornamento per JobTypes e ContractClauses

## ⚠️ IMPORTANTE
Applica queste regole manualmente nella Firebase Console:
1. Vai su Firebase Console → Firestore Database → Rules
2. Aggiungi le seguenti regole alle regole esistenti
3. Pubblica le modifiche

## Nuove Collections

### 1. jobTypes
Collezione tipi di lavoro personalizzabili.
- **Admin**: Full access (read, write, delete)
- **Authenticated**: Read only (per vedere i tipi disponibili)
- **Anonymous**: No access

### 2. contractClauses
Collezione template clausole contrattuali.
- **Admin**: Full access (read, write, delete)
- **Authenticated**: Read only (per vedere le clausole nei preventivi)
- **Anonymous**: No access

### 3. jobs
Collezione lavori fotografici (già esistente ma serve security rules).
- **Admin**: Full access
- **Authenticated**: Read only dei propri lavori
- **Anonymous**: No access

## Security Rules da Aggiungere

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Helper function: check if user is admin
    function isAdmin() {
      return request.auth != null && request.auth.token.email in [
        'gennaro.mazzacane@gmail.com'
      ];
    }
    
    // Helper function: check if user is authenticated
    function isAuthenticated() {
      return request.auth != null;
    }

    // === JOB TYPES ===
    // Tipi di lavoro personalizzabili
    match /jobTypes/{jobTypeId} {
      allow read: if isAuthenticated();
      allow write, delete: if isAdmin();
    }

    // === CONTRACT CLAUSES ===
    // Template clausole contrattuali
    match /contractClauses/{clauseId} {
      allow read: if isAuthenticated();
      allow write, delete: if isAdmin();
    }

    // === JOBS ===
    // Lavori fotografici (preventivi, contratti, ordini)
    match /jobs/{jobId} {
      allow read: if isAdmin() || 
                     (isAuthenticated() && resource.data.clientEmail == request.auth.token.email);
      allow write: if isAdmin();
      allow delete: if isAdmin();
    }

    // === EXISTING RULES ===
    // Mantieni tutte le regole esistenti per:
    // - galleries
    // - users
    // - bookings
    // - products
    // - orders
    // - clienti
    // - etc.
  }
}
```

## Test dopo applicazione

Dopo aver applicato le regole, testa:

1. **Admin (gennaro.mazzacane@gmail.com)**:
   - ✅ Può leggere jobTypes
   - ✅ Può creare/modificare/eliminare jobTypes
   - ✅ Può leggere contractClauses
   - ✅ Può creare/modificare/eliminare contractClauses
   - ✅ Può leggere/scrivere tutti i jobs

2. **User autenticato (non admin)**:
   - ✅ Può leggere jobTypes (ma non modificare)
   - ✅ Può leggere contractClauses (ma non modificare)
   - ✅ Può leggere solo i propri jobs

3. **Anonymous**:
   - ❌ Non può accedere a nessuna di queste collections

## Seed Data

Dopo aver applicato le Security Rules, esegui il seed dei jobTypes:
1. Apri la console del browser nell'app
2. Digita: `await window.seedJobTypes()`
3. Verifica che crei 8 tipi di lavoro iniziali

## Nota

Queste regole sono conservative e sicure. Puoi affinarle in futuro se necessario, ad esempio:
- Permettere ai clienti di vedere le clausole del loro preventivo specifico
- Aggiungere ruoli custom oltre ad admin
- Implementare validation più granulare sui campi
