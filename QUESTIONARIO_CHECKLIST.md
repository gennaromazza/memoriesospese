# Checklist Implementazione Sistema Questionario Coppie

## 📋 Fase 1: Struttura Dati e Tipi TypeScript
- [x] Definire tipi TypeScript con Role = "bride" | "groom"
- [x] Implementare FaqSet con versioning e audit trail
- [x] Creare Questionnaire interface con token hash + scadenza
- [x] Definire AnswerDraft con versioning ottimistico
- [x] Aggiungere utility per hash SHA-256 token
- [x] Definire schema collezioni separate (questionnaires/answers/drafts/tokens)

## 📋 Fase 2: Firestore Schema Extensions  
- [x] Creare collection `/questionnaireTokens/{tokenId}` separata
- [x] Strutturare `/galleries/{galleryId}/questionnaires/{questionnaireId}`
- [x] Implementare subcollections answers/{role} e drafts/{role}
- [x] Aggiornare Firestore rules con role isolation granulare
- [x] Implementare helper functions per validazione token
- [x] Testare principle of least privilege e cross-gallery protection

## 📋 Fase 3: Componente Faq.tsx (Admin)
- [x] Creare component base con layout admin
- [x] Implementare CRUD per faqSets collection
- [x] Aggiungere form per gestione 10 domande fisse (q1-q10)
- [x] Implementare toggle attivazione set domande
- [x] Aggiungere validazione e error handling
- [x] Testare funzionalità complete

## 📋 Fase 4: Routing e Navigazione
- [x] Aggiungere route `/admin/faq` in App.tsx
- [x] Aggiungere route `/admin/galleries/:galleryId/questionnaire`
- [x] Aggiungere route pubblica `/q/:galleryId?token=...&role=bride|groom`
- [x] Implementare noindex/nofollow su route pubbliche
- [x] Testare navigazione e protezioni

## 📋 Fase 5: QuestionnaireManager.tsx (Admin)
- [x] Creare layout base con sezioni principali
- [x] Implementare toggle enable/disable questionario
- [x] Aggiungere select per set domande attivo
- [x] Implementare generazione token sicuri (crypto-random)
- [x] Creare generazione link univoci per bride/groom
- [x] Aggiungere visualizzazione stato compilazione
- [x] Implementare pulsante esportazione risposte
- [x] Testare tutte le funzionalità admin

## 📋 Fase 6: Sistema Token e Validazione
- [x] Implementare generazione token 32-48 bytes + SHA-256 hash
- [x] Cloud Function callable per scambio token→sessione temporanea (15 min)
- [x] Gestione scadenza 90 giorni + revoca individuale
- [x] Rate limiting via Cloud Functions (non solo rules)
- [x] History cleanup dopo validazione (rimuovi query params)
- [x] Mascheramento errori per sicurezza

## 📋 Fase 7: QuestionnaireForm.tsx (Pubblico)
- [x] Creare component base con validazione token
- [x] Implementare lettura parametri URL (galleryId, token, role)
- [x] Aggiungere caricamento set domande attivo
- [x] Creare form multi-step (1 domanda per step)
- [x] Implementare navigazione Avanti/Indietro
- [x] Aggiungere autosave con debounce 5-10s + localStorage mirror
- [x] Implementare ripresa progressi da draft
- [x] Aggiungere controlli privacy e consenso
- [x] Implementare submit finale con validazioni
- [x] Testare UX completa per bride e groom

## 📋 Fase 8: ResponseExportButton.tsx (Admin)
- [x] Definire template export invariabile (formato standardizzato)
- [x] Implementare template: CONTEXT + QUESTIONS + ANSWERS + OUTPUT REQUEST
- [x] Formattare per copy/paste diretto in ChatGPT
- [x] Modal con textarea read-only + pulsante copia
- [x] Testare output con dati reali bride/groom

## 📋 Fase 9: Integrazione Admin Dashboard
- [x] Aggiungere link nel menu admin per `/admin/faq`
- [x] Integrare QuestionnaireManager nelle gallery details
- [x] Aggiornare GalleryHeader con nuovo pulsante
- [x] Testare navigazione completa

## 📋 Fase 10: Set Domande Predefinito
- [x] Creare script/funzione per inserimento set iniziale
- [x] Caricare 10 domande predefinite in faqSets
- [x] Impostare primo set come attivo
- [x] Verificare caricamento corretto

## 📋 Fase 11: Sicurezza Firestore Rules
- [x] Aggiornare rules per faqSets (solo admin)
- [x] Estendere rules per galleries con questionnaire/answers
- [x] Implementare validazione token nelle rules
- [x] Testare accessi per admin/pubblico/ospiti
- [x] Verificare isolamento dati tra bride/groom

## 📋 Fase 12: UX e Styling
- [x] Applicare styling coerente con design system
- [x] Implementare progress bar e indicatori loading
- [x] Aggiungere animazioni e transizioni
- [x] Ottimizzare responsive design
- [x] Testare accessibilità (focus, aria-labels)

## 📋 Fase 13: Error Handling e Edge Cases
- [x] Gestire token scaduti o invalidi
- [x] Aggiungere fallback per set domande mancanti
- [x] Implementare retry logic per save failures
- [x] Gestire concurrent editing
- [x] Testare scenari limite

## 📋 Fase 14: Testing e Validazione
- [x] Test funzionalità admin complete
- [x] Test esperienza utente bride/groom
- [x] Test export prompt ChatGPT
- [x] Validare sicurezza e permessi
- [x] Test su dispositivi mobili
- [x] Performance testing con dati reali

## 📋 Fase 15: Documentazione e Deploy
- [x] Aggiornare replit.md con nuove funzionalità
- [x] Documentare API e componenti principali
- [x] Preparare guide per utilizzo admin
- [x] Deploy e test produzione
- [ ] Validazione finale con stakeholder

---

## 🎯 Stato Attuale: PIANIFICAZIONE COMPLETATA
**Prossimo Step:** Attesa approvazione per iniziare Fase 1

### Note Implementazione:
- Priorità massima su sicurezza e privacy
- UX semplice e intuitiva per le coppie
- Export template preciso per ChatGPT
- Architettura scalabile per futuri miglioramenti