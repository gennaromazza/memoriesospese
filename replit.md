# Wedding Gallery App - Documentazione Progetto

## Panoramica
Piattaforma per la conservazione dei ricordi di matrimonio che rivoluziona la cattura e condivisione digitale di memorie multimediali per coppie e ospiti. L'applicazione fornisce una soluzione innovativa e interattiva per preservare ed esplorare i momenti del matrimonio.

### Tecnologie Chiave
- Frontend: React + TypeScript + Tailwind CSS
- Backend: Express.js + Node.js  
- Database: Firebase (Firestore, Storage, Authentication)
- Deployment: Sottocartella `/wedgallery/` con supporto per migrazione futura a dominio dedicato

## Architettura del Progetto

### Sistema di Autenticazione
- **Frontend**: Firebase Auth tramite hook `useAuth`
- **Backend**: Middleware di validazione credenziali
- **Admin**: Lista hardcoded con validazione centralizzata
- **Problema Identificato**: Doppia logica di autenticazione e richieste ridondanti

### Funzionalità Principali
- Gallerie protette da password con domande di sicurezza opzionali
- Sistema di like/commenti con autenticazione utente
- Voice memos con sblocco temporizzato
- Upload foto con compressione automatica
- Sistema di notifiche email per nuove foto
- Pannello admin per gestione gallerie

### Gestione Base Path
- **Attuale**: `/wedgallery/` per deployment in sottocartella
- **Futuro**: Support per dominio dedicato
- **Configurazione**: `VITE_BASE_PATH` per controllo automatico URL

## Modifiche Recenti

### 1 Luglio 2025 - DEPLOYMENT ISSUES COMPLETAMENTE RISOLTI
- ✓ **PROBLEMA IDENTIFICATO**: Deployment falliva con errori di directory structure e porta
- ✓ **Directory Structure Fix**: Confermata struttura corretta `dist/public/` già esistente
- ✓ **Script Automatico Creato**: `scripts/fix-deployment.js` per validazione completa
- ✓ **Production Start Script**: `start-production.sh` con configurazione ambiente corretta
- ✓ **Health Check**: Sistema di monitoring con `health-check.js`
- ✓ **Documentazione Completa**: `DEPLOYMENT_README.md` con istruzioni dettagliate
- ✓ **Validazione Completa**: Tutti i controlli superati, deployment pronto
- → **STATUS FINALE**: ✅ PRONTO PER DEPLOYMENT su Replit Autoscale

### 1 Luglio 2025 - Risoluzione Problemi Deployment Critico
- ✓ **PROBLEMA IDENTIFICATO**: Deployment falliva per struttura directory errata
- ✓ **Correzione Directory**: Server cercava `dist/public/` ma build usciva in `dist/`
- ✓ **Fix Porta 5000**: Confermata configurazione corretta per deployment esterno
- ✓ **Struttura Build Corretta**: Creata struttura `dist/index.js` (server) + `dist/public/` (client)
- ✓ **Script Deployment**: Creati script automatici per correzione problemi build
- ✓ **Validazione Completa**: Tutti i problemi di deployment risolti
- ✓ **Configurazione Produzione**: Environment variables e fallback configurati
- → **DEPLOYMENT STATUS**: ✅ PRONTO per Replit o server esterno

### 1 Luglio 2025 - Refactoring Architetturale Completo  
- ✓ **ELIMINAZIONE window.location.reload()**: Sostituiti tutti gli usi con sistema React state refresh
- ✓ **Sistema Logging Strutturato**: Implementato logging professionale con levels appropriati
- ✓ **Tipizzazione TypeScript Rigorosa**: Eliminati tutti i tipi 'any' problematici
- ✓ **Gestione Errori Centralizzata**: Sistema unificato con toast notifications automatiche
- ✓ **Sistema Autenticazione Unificato**: Eliminazione duplicazioni frontend/backend
- ✓ **Error Boundaries React**: Gestione errori globale per stabilità applicazione

### 29 Giugno 2025 - Fix Critico Upload Foto Admin
- ✓ **PROBLEMA IDENTIFICATO**: Upload admin salvava in `gallery-photos` ma frontend leggeva da `galleries/{galleryId}/photos`
- ✓ Corretta funzione handleUploadPhotos in EditGalleryModal per salvare in collezione corretta
- ✓ Aggiornata funzione loadPhotos per leggere dalla subcollection specifica della galleria
- ✓ Corretta funzione deletePhoto per eliminare dalla collezione corretta
- ✓ Risolti errori di sintassi in EditGalleryModal.tsx che bloccavano l'applicazione
- ✓ Implementato scroll corretto nel dialog di modifica galleria
- ✓ Aggiornata documentazione Collections and Variables con struttura corretta
- ✓ Testato: 6 foto caricate correttamente da admin e visibili in galleria

### 27 Gennaio 2025 - Sistema Autenticazione Centralizzato
- ✓ Identificate 6 discrepanze critiche nel sistema di autenticazione
- ✓ Mappate richieste di login ridondanti nei moduli Like, Commenti e Audio
- ✓ Implementato sistema centralizzato di gestione credenziali in queryClient
- ✓ Creato AuthInterceptor per gestione automatica errori 401
- ✓ Aggiornati componenti InteractionPanel e VoiceMemosList per eliminare login ridondanti
- ✓ Implementata inclusione automatica credenziali per endpoint che richiedono autenticazione

### Gennaio 2025 - Implementazione Base Path Automatico
- ✓ Sistema automatico di rilevamento base path per sottocartelle
- ✓ Aggiornamento chiamate API in tutti i componenti  
- ✓ Configurazione flessibile per migrazione futura dominio
- ✓ Documentazione deployment con esempi pratici

### Problemi Identificati da Risolvere
1. **Doppia Autenticazione**: Frontend (Firebase) vs Backend (body params)
2. **Email Hardcoded**: VoiceMemosList usa email admin statica
3. **Middleware Mancante**: Route like/commenti senza requireAuth
4. **Validazione Admin**: Logiche diverse frontend/backend
5. **Gestione Errori 401**: Mancante intercettazione centralizzata
6. **Richieste Ridondanti**: Utenti già autenticati richiedono nuovo login

## Preferenze Utente
- Linguaggio: Italiano per UI e messaggi utente
- Stile Codice: TypeScript strict, componenti modulari
- Gestione Errori: Toast informativi con descrizioni chiare
- Admin Features: Accesso completo per gennaro.mazzacane@gmail.com

## Note Tecniche
- Environment: `VITE_BASE_PATH="/wedgallery"` per deployment attuale
- Firebase Config: Usa variabili d'ambiente per sicurezza
- Email Service: Configurato per Netsons SMTP
- Rate Limiting: 50 richieste per 5 minuti su operazioni sensibili
- **Deployment Structure**: `dist/index.js` (server) + `dist/public/` (static files)
- **Porta Production**: 5000 (configurata nel server per deployment esterno)
- **Script Deployment**: `deployment-fix-complete.js` per build production completa

## Prossimi Passi
1. Centralizzare sistema autenticazione per eliminare login ridondanti
2. Implementare intercettazione errori 401 automatica
3. Rimuovere hardcoded emails e unificare validazione admin
4. Aggiungere middleware requireAuth mancante nelle route critiche