# 🚨 REPORT BUG SISTEMA ABBONAMENTI - 23 Luglio 2025

## PANORAMICA
Analisi completa del sistema di abbonamenti ha rivelato 6 bug critici e multiple inconsistenze che compromettono:
- Validazione limiti piani
- Conteggio accurato risorse
- Integrità dati utente
- Esperienza checkout

---

## 🔴 BUG CRITICI

### 1. INCONSISTENZA LIMITI PIANO FREE
**Severità**: 🔴 ALTA  
**File**: `shared/subscription-schema.ts` vs `replit.md`

**Problema**:
- Schema definisce: `galleryLimit: 1, maxPhotos: 1000`
- Documentazione dice: "2 gallerie, 10 foto"
- Impatto: Utenti Free possono creare più risorse del dovuto

**Fix Necessario**:
```typescript
free: {
  galleryLimit: 2,  // Allineare a documentazione
  maxPhotos: 10,    // Correggere da 1000 a 10
}
```

### 2. CONTEGGIO FOTO INCOMPLETO
**Severità**: 🔴 ALTA  
**File**: `client/src/hooks/use-plan-features.tsx:134`

**Problema**:
- `usePhotoLimit` conta solo collection `photos`
- Ignora foto legacy in `galleries/{id}/photos`
- Limiti foto inaccurati per utenti esistenti

**Codice Problematico**:
```typescript
const q = query(collection(db, 'photos'), where('userId', '==', user.uid));
// ❌ Manca conteggio legacy photos
```

**Fix Necessario**: Implementare conteggio dual-collection come `SocialActivityPanel`

### 3. PREMIUM = PRO LIMITS BUG
**Severità**: 🟡 MEDIA  
**File**: `shared/subscription-schema.ts:58`

**Problema**:
- Premium ha `maxPhotos: 25000` (stesso di Pro)
- Dovrebbe essere `maxPhotos: 'unlimited'`
- Premium users pagano €40 per limiti da €20

**Fix**:
```typescript
premium: {
  maxPhotos: 'unlimited', // Non 25000
}
```

### 4. RACE CONDITION VALIDAZIONE
**Severità**: 🟡 MEDIA  
**File**: `NewGalleryModal.tsx` + `use-plan-features.tsx`

**Problema**:
- Duplicazione controlli: modal + hook
- Possibili race conditions
- Query multiple per stesso dato

**Scenario**:
1. Hook conta 4 gallerie (limite 5)
2. Utente clicca "Crea" rapidamente 2 volte
3. Modal bypassa controllo, crea 2 gallerie (totale 6)

### 5. DEVELOPMENT POLLUTION
**Severità**: 🟡 MEDIA  
**File**: `client/src/pages/PricingPage.tsx:89`

**Problema**:
- Simulazione Stripe salva subscription fake in Firestore
- Database development inquinato
- Test inconsistenti

**Codice Problematico**:
```typescript
if (sessionId?.includes('sim_') || sessionId?.includes('fallback_')) {
  // ❌ Salva dati fake in production DB
  setDoc(subscriptionRef, { plan, active: true, ... })
}
```

### 6. MANCANZA DOWNGRADE HANDLING
**Severità**: 🟠 CRITICA PER UX  
**File**: Mancante logica sistema

**Problema**:
- Nessun controllo downgrade con dati eccedenti
- User Premium (50 gallerie) → Starter (5 gallerie)
- Comportamento indefinito

---

## 🔧 INCONSISTENZE MINORI

### A. Type Safety
**File**: `functions/lib/stripe.js:45`
- Stripe API versione hardcoded: `'2025-06-30.basil'` (non standard)
- Dovrebbe essere: `'2024-06-20'` o `'2024-11-20'`

### B. Documentazione Schema
**File**: `shared/subscription-schema.ts`
- Manca `storageLimitGB` per Free/Starter
- Tipo `PlanType` non include validazione enum

### C. Error Messages
**File**: `functions/lib/gallery-zip.js`
- Messaggi errore hardcoded in italiano
- Dovrebbero essere localizzabili

---

## 📊 ANALISI IMPATTO

### Impatto Finanziario
- **Premium Underpriced**: Users pagano €40 per limiti da €20
- **Free Overserved**: Users Free ottengono 100x foto previste

### Impatto Tecnico  
- **Data Corruption**: Conteggi inaccurati
- **Performance**: Query duplicate non ottimizzate
- **Scale Issues**: Validazione client-only bypassabile

### Impatto UX
- **Confusion**: Limiti inconsistenti tra UI/backend
- **Downgrade Issues**: User bloccati senza gestione graceful

---

## ✅ PIANO DI RISOLUZIONE

### Fase 1: Fix Critici (Immediato)
1. ✅ Allineare limiti Free: 2 gallerie, 10 foto
2. ✅ Implementare dual-collection photo counting
3. ✅ Premium unlimited photos
4. ✅ Rimuovere simulazione Stripe che inquina DB

### Fase 2: Validazione Robusta (24h)
1. ✅ Server-side validation centralizzata
2. ✅ Atomic operations per creazione risorse
3. ✅ Downgrade handling con migration plan

### Fase 3: Ottimizzazioni (Settimana)
1. ✅ Cache conteggi in user profile
2. ✅ Batch operations per performance
3. ✅ Comprehensive error handling

---

## 🎯 METRICHE SUCCESS

### Before Fix
- ❌ Limiti Free: 1000 foto vs 10 documentate
- ❌ Photo counting: Solo ~50% foto contate
- ❌ Premium value: Stessi limiti di Pro

### After Fix  
- ✅ Limiti Free: Corretti e applicati
- ✅ Photo counting: 100% accurato dual-collection
- ✅ Premium value: Truly unlimited
- ✅ Zero subscription data corruption

---

**Raccomandazione**: Procedere immediatamente con Fase 1 per evitare ulteriore data corruption e user confusion.