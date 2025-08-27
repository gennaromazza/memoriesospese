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
- [ ] Creare layout base con sezioni principali
- [ ] Implementare toggle enable/disable questionario
- [ ] Aggiungere select per set domande attivo
- [ ] Implementare generazione token sicuri (crypto-random)
- [ ] Creare generazione link univoci per bride/groom
- [ ] Aggiungere visualizzazione stato compilazione
- [ ] Implementare pulsante esportazione risposte
- [ ] Testare tutte le funzionalità admin

## 📋 Fase 6: Sistema Token e Validazione
- [ ] Implementare generazione token 32-48 bytes + SHA-256 hash
- [ ] Cloud Function callable per scambio token→sessione temporanea (15 min)
- [ ] Gestione scadenza 90 giorni + revoca individuale
- [ ] Rate limiting via Cloud Functions (non solo rules)
- [ ] History cleanup dopo validazione (rimuovi query params)
- [ ] Mascheramento errori per sicurezza

## 📋 Fase 7: QuestionnaireForm.tsx (Pubblico)
- [ ] Creare component base con validazione token
- [ ] Implementare lettura parametri URL (galleryId, token, role)
- [ ] Aggiungere caricamento set domande attivo
- [ ] Creare form multi-step (1 domanda per step)
- [ ] Implementare navigazione Avanti/Indietro
- [ ] Aggiungere autosave con debounce 5-10s + localStorage mirror
- [ ] Implementare ripresa progressi da draft
- [ ] Aggiungere controlli privacy e consenso
- [ ] Implementare submit finale con validazioni
- [ ] Testare UX completa per bride e groom

## 📋 Fase 8: ResponseExportButton.tsx (Admin)
- [ ] Definire template export invariabile (formato standardizzato)
- [ ] Implementare template: CONTEXT + QUESTIONS + ANSWERS + OUTPUT REQUEST
- [ ] Formattare per copy/paste diretto in ChatGPT
- [ ] Modal con textarea read-only + pulsante copia
- [ ] Testare output con dati reali bride/groom

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