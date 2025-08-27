# 🔧 CHECKLIST RISOLUZIONE BUG QUESTIONARI

## 🎯 **PROBLEMI IDENTIFICATI DAI LOG:**

1. **❌ Permission-denied su faqSets**
2. **❌ Validazione Zod: "Devono essere esattamente 10 domande"**  
3. **❌ Funzione createAbsoluteUrl() mancante**
4. **❌ Funzione revokeToken duplicata nel QuestionnaireService**
5. **❌ Schema validation rigid (10 domande fisse)**

---

## 📋 **CHECKLIST RIPARAZIONE SISTEMATICA**

### **1. FIREBASE SECURITY RULES** 
- [x] ✅ **Correggere regole faqSets per permettere creazione system**
  - Problem: Rules non permettono creazione di set predefinito
  - Fix: Aggiornate condizioni di create per `createdBy: 'system'` e `version == 1`

### **2. SCHEMA VALIDATION FLEXIBILITY**
- [x] ✅ **Rendere flessibile validazione domande (1-20 invece di 10 fisse)**
  - Problem: `insertFaqSetSchema` richiede esattamente 10 domande
  - Fix: Cambiato `.length(10)` in `.min(1).max(20)` e aggiornato QuestionKey type

### **3. QUESTIONNAIRE SERVICE FIXES**
- [x] ✅ **Rimuovere funzioni duplicate**
  - Problem: 2 funzioni `revokeToken` e `getAllAnswers` duplicate
  - Fix: Rimosso duplicati e mantenuto implementazioni corrette

- [x] ✅ **Fix funzione createAbsoluteUrl mancante**
  - Problem: Linea 255 usa funzione non definita
  - Fix: Sostituito con `window.location.origin`

### **4. QUESTIONNAIRE MANAGER FIXES**
- [x] ✅ **Inizializzazione automatica in modalità globale**
  - Problem: Errori non gestiti nel caricamento FAQ sets
  - Fix: Aggiunta inizializzazione automatica se nessun set trovato

### **5. FAQ DEFAULTS INITIALIZATION**
- [x] ✅ **Spostare inizializzazione da App.tsx**
  - Problem: Set default chiamato senza autenticazione admin
  - Fix: Rimosso da App.tsx, ora solo nei componenti admin autenticati

### **6. ADMIN DASHBOARD TAB**
- [x] ✅ **Modalità dual-mode già implementata**
  - Problem: Tab questionari non passa `galleryId` correttamente
  - Fix: Già gestito in QuestionnaireManager (modalità globale vs gallery)

### **7. ERROR HANDLING IMPROVEMENT**
- [ ] ✅ **Aggiungere logging strutturato e fallback**
  - Problem: Errori generici non informativi
  - Fix: Console.error più dettagliati + UI fallback

### **8. TESTING FINALE**
- [ ] ✅ **Testare inizializzazione set predefinito**
- [ ] ✅ **Testare CRUD domande dinamiche**  
- [ ] ✅ **Testare tab Admin Dashboard**
- [ ] ✅ **Verificare firestore rules funzionanti**

---

## 🚨 **ORDINE DI ESECUZIONE:**

1. **Schema Flexibility** (permette validazione)
2. **Service Fixes** (rimuove errori codice)
3. **Firebase Rules** (permette operazioni)
4. **Manager Fixes** (migliora UX)
5. **Testing** (verifica tutto funziona)

---

## 📝 **NOTE TECNICHE:**

- **Schema attuale**: Richiede esattamente 10 domande
- **Firebase Rules**: Bloccano creazione automatica set system
- **Service Issues**: Funzioni duplicate e mancanti
- **Manager State**: Non gestisce correttamente errori di inizializzazione

---

**🎯 OBIETTIVO**: Questionari funzionanti con domande flessibili, inizializzazione automatica e CRUD completo.