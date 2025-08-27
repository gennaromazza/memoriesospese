# Checklist Implementazione Sistema Questionario Coppie

## 📋 Fase 1: Struttura Dati e Tipi TypeScript
- [ ] Definire tipi TypeScript per questionnaire, couple, answers in `shared/schema.ts`
- [ ] Definire tipi per faqSets collection
- [ ] Creare interfacce per token, link e stati

## 📋 Fase 2: Firestore Schema Extensions  
- [ ] Aggiornare Firestore rules per supportare nuove collections
- [ ] Implementare helper functions per questionnaire in Firebase
- [ ] Testare write/read permissions per diverse tipologie utenti

## 📋 Fase 3: Componente Faq.tsx (Admin)
- [ ] Creare component base con layout admin
- [ ] Implementare CRUD per faqSets collection
- [ ] Aggiungere form per gestione 10 domande fisse (q1-q10)
- [ ] Implementare toggle attivazione set domande
- [ ] Aggiungere validazione e error handling
- [ ] Testare funzionalità complete

## 📋 Fase 4: Routing e Navigazione
- [ ] Aggiungere route `/admin/faq` in App.tsx
- [ ] Aggiungere route `/admin/galleries/:galleryId/questionnaire`
- [ ] Aggiungere route pubblica `/q/:galleryId` con query params
- [ ] Testare navigazione e protezioni

## 📋 Fase 5: QuestionnaireManager.tsx (Admin)
- [ ] Creare layout base con sezioni principali
- [ ] Implementare toggle enable/disable questionario
- [ ] Aggiungere select per set domande attivo
- [ ] Implementare generazione token sicuri (crypto-random)
- [ ] Creare generazione link univoci per bride/groom
- [ ] Aggiungere visualizzazione stato compilazione
- [ ] Implementare pulsante esportazione risposte
- [ ] Testare tutte le funzionalità admin

## 📋 Fase 6: Sistema Token e Validazione
- [ ] Implementare generazione token sicuri (32-48 bytes)
- [ ] Creare funzione validazione token
- [ ] Aggiungere gestione scadenza token (90 giorni)
- [ ] Implementare rate limiting per submit
- [ ] Testare sicurezza e validazioni

## 📋 Fase 7: QuestionnaireForm.tsx (Pubblico)
- [ ] Creare component base con validazione token
- [ ] Implementare lettura parametri URL (galleryId, token, role)
- [ ] Aggiungere caricamento set domande attivo
- [ ] Creare form multi-step (1 domanda per step)
- [ ] Implementare navigazione Avanti/Indietro
- [ ] Aggiungere autosave ogni 2-3 secondi
- [ ] Implementare ripresa progressi da draft
- [ ] Aggiungere controlli privacy e consenso
- [ ] Implementare submit finale con validazioni
- [ ] Testare UX completa per bride e groom

## 📋 Fase 8: ResponseExportButton.tsx (Admin)
- [ ] Creare component con modal export
- [ ] Implementare lettura dati coppia e risposte
- [ ] Creare template generator per prompt ChatGPT
- [ ] Formattare output secondo specifiche esatte
- [ ] Aggiungere funzionalità copia negli appunti
- [ ] Testare export con dati reali

## 📋 Fase 9: Integrazione Admin Dashboard
- [ ] Aggiungere link nel menu admin per `/admin/faq`
- [ ] Integrare QuestionnaireManager nelle gallery details
- [ ] Aggiornare GalleryHeader con nuovo pulsante
- [ ] Testare navigazione completa

## 📋 Fase 10: Set Domande Predefinito
- [ ] Creare script/funzione per inserimento set iniziale
- [ ] Caricare 10 domande predefinite in faqSets
- [ ] Impostare primo set come attivo
- [ ] Verificare caricamento corretto

## 📋 Fase 11: Sicurezza Firestore Rules
- [ ] Aggiornare rules per faqSets (solo admin)
- [ ] Estendere rules per galleries con questionnaire/answers
- [ ] Implementare validazione token nelle rules
- [ ] Testare accessi per admin/pubblico/ospiti
- [ ] Verificare isolamento dati tra bride/groom

## 📋 Fase 12: UX e Styling
- [ ] Applicare styling coerente con design system
- [ ] Implementare progress bar e indicatori loading
- [ ] Aggiungere animazioni e transizioni
- [ ] Ottimizzare responsive design
- [ ] Testare accessibilità (focus, aria-labels)

## 📋 Fase 13: Error Handling e Edge Cases
- [ ] Gestire token scaduti o invalidi
- [ ] Aggiungere fallback per set domande mancanti
- [ ] Implementare retry logic per save failures
- [ ] Gestire concurrent editing
- [ ] Testare scenari limite

## 📋 Fase 14: Testing e Validazione
- [ ] Test funzionalità admin complete
- [ ] Test esperienza utente bride/groom
- [ ] Test export prompt ChatGPT
- [ ] Validare sicurezza e permessi
- [ ] Test su dispositivi mobili
- [ ] Performance testing con dati reali

## 📋 Fase 15: Documentazione e Deploy
- [ ] Aggiornare replit.md con nuove funzionalità
- [ ] Documentare API e componenti principali
- [ ] Preparare guide per utilizzo admin
- [ ] Deploy e test produzione
- [ ] Validazione finale con stakeholder

---

## 🎯 Stato Attuale: PIANIFICAZIONE COMPLETATA
**Prossimo Step:** Attesa approvazione per iniziare Fase 1

### Note Implementazione:
- Priorità massima su sicurezza e privacy
- UX semplice e intuitiva per le coppie
- Export template preciso per ChatGPT
- Architettura scalabile per futuri miglioramenti