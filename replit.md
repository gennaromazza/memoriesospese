# Wedding Gallery - Applicazione Completa

## 🎯 STATO ATTUALE: CONVERSIONE A FIREBASE-ONLY

L'applicazione è stata convertita da full-stack (React + Node.js + Express) a **Firebase-only** per semplificare il deployment e eliminare la dipendenza dal backend.

## 🏗️ Architettura Attuale

### Frontend (React + Vite)
- **Framework**: React 18 con TypeScript
- **Routing**: Wouter per navigazione client-side
- **UI**: Tailwind CSS + Shadcn/ui components
- **Build**: Vite per sviluppo e produzione

### Backend (Firebase)
- **Database**: Firestore per gallerie, foto, commenti, likes
- **Storage**: Firebase Storage per immagini e voice memos
- **Auth**: Firebase Authentication per login admin
- **Hosting**: Replit Deployments

## 📁 Struttura del Progetto

```
project/
├── client/                    # Frontend React
│   ├── src/
│   │   ├── components/        # Componenti UI
│   │   ├── hooks/            # Custom hooks
│   │   ├── lib/              # Utilities e servizi
│   │   └── pages/            # Pagine dell'app
├── server/                   # Backend (deprecato)
├── shared/                   # Tipi condivisi
├── scripts/                  # Script di build e deploy
└── docs/                     # Documentazione
```

## 🚀 Deployment su Replit

### Configurazione Automatica
Il deployment è configurato per utilizzare:
- **Build Command**: `npm run build`
- **Run Command**: `npm start` (serve statico)
- **Porta**: 5000 (configurata automaticamente)

### Variabili d'Ambiente Necessarie
```bash
# Firebase Configuration
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef

# Application Settings
VITE_BASE_PATH="/wedgallery"    # Per sottocartella
NODE_ENV=production
```

## 🔧 Funzionalità Migrate a Firebase

### ✅ Completate
- **Gallerie e Foto**: Lettura diretta da Firestore
- **Sistema Like**: Firebase Firestore con real-time updates
- **Commenti**: Firestore con validazione client-side
- **Autenticazione**: Firebase Auth per admin
- **Storage**: Firebase Storage per immagini

### 🚧 In Conversione
- **Statistiche**: Migrazione da API REST a aggregazioni Firestore
- **Voice Memos**: Spostamento completo su Firebase Storage
- **Email**: Integrazione con servizi esterni (EmailJS/Resend)

## 📊 Benefici della Conversione

### ✅ Vantaggi
- **Deployment Semplificato**: Solo frontend statico
- **Scalabilità**: Firebase gestisce automaticamente il carico
- **Real-time**: Aggiornamenti in tempo reale senza polling
- **Costi Ridotti**: No server sempre attivo
- **Manutenzione**: Meno componenti da gestire

### ⚠️ Considerazioni
- **Offline**: Limitazioni senza connection
- **Query Complesse**: Alcune query richiedono refactoring
- **Vendor Lock-in**: Dipendenza da Firebase

## 🔗 Link Utili

- **App Live**: [Your Replit URL]
- **Admin Panel**: [Your Replit URL]/admin
- **Firebase Console**: [Firebase Project Console]
- **Replit Console**: [Replit Project URL]

## 📝 Note di Sviluppo

### Comandi Principali
```bash
# Sviluppo
npm run dev

# Build produzione
npm run build

# Deploy su Replit
# Usa il pulsante Deploy nel dashboard