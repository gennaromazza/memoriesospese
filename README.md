
# 🎉 Wedding Gallery - Gallerie Fotografiche Matrimoniali

## 📋 Panoramica

Wedding Gallery è un'applicazione web moderna e completa per la gestione di gallerie fotografiche matrimoniali. L'applicazione permette agli sposi di creare gallerie private, condividere foto con gli invitati e raccogliere messaggi vocali ricordo, il tutto con un'interfaccia elegante e funzionalità avanzate.

## ✨ Funzionalità Principali

### 🔐 Sistema di Autenticazione
- **Accesso Admin**: Dashboard per gestire gallerie e contenuti
- **Protezione Gallerie**: Password personalizzate per ogni galleria
- **Domande di Sicurezza**: Livello aggiuntivo di protezione
- **Controllo Accessi**: Gestione granulare dei permessi

### 📸 Gestione Foto
- **Upload Multiplo**: Caricamento simultaneo di più foto
- **Compressione Automatica**: Ottimizzazione immagini fino a 1MB
- **Visualizzazione Lightbox**: Esperienza di navigazione fluida
- **Organizzazione**: Filtri e ordinamento avanzato

### 🎵 Voice Memos
- **Registrazione Audio**: Sistema integrato per messaggi vocali
- **Sblocco Temporizzato**: Messaggi che si attivano a date specifiche
- **Player Integrato**: Riproduzione diretta nell'interfaccia
- **Gestione Completa**: Upload, download ed eliminazione

### 💬 Sistema Sociale
- **Like e Commenti**: Interazioni su foto e voice memos
- **Statistiche**: Dashboard con analisi engagement
- **Attività Recente**: Feed degli ultimi commenti e interazioni
- **Top Contenuti**: Classifica foto più apprezzate

### 📱 Funzionalità Avanzate
- **Responsive Design**: Ottimizzato per tutti i dispositivi
- **PWA Ready**: Installabile come app mobile
- **Real-time Updates**: Aggiornamenti istantanei via Firebase
- **Sistema Email**: Notifiche automatiche SMTP Netsons

## 🏗️ Architettura Tecnica

### Frontend (React + TypeScript)
```
client/
├── src/
│   ├── components/          # Componenti UI riutilizzabili
│   │   ├── ui/             # Libreria componenti base (Shadcn/ui)
│   │   ├── auth/           # Componenti autenticazione
│   │   ├── gallery/        # Componenti specifici gallerie
│   │   └── admin/          # Pannelli amministrazione
│   ├── pages/              # Pagine dell'applicazione
│   ├── hooks/              # Custom hooks React
│   ├── lib/                # Utilities e servizi
│   ├── context/            # Context providers (Auth, Studio)
│   └── assets/             # Risorse statiche
```

### Backend (Express + Firebase)
```
server/
├── middleware/             # Middleware Express (auth, validation)
├── utils/                  # Utilities backend
├── routes.ts              # Definizione API endpoints
├── firebase.ts            # Configurazione Firebase
├── mailer.ts              # Sistema email Netsons
└── index.ts               # Server principale
```

### Database (Firebase Firestore)
```
Collections:
├── galleries/             # Gallerie matrimoniali
│   └── photos/           # Sottocollection foto
├── voiceMemos/           # Messaggi vocali
├── comments/             # Commenti su contenuti
├── likes/                # Like su contenuti
├── users/                # Profili utenti
└── passwordRequests/     # Richieste accesso
```

## 🚀 Installazione e Sviluppo

### Prerequisiti
- Node.js 18+
- Account Firebase
- Configurazione SMTP (Netsons)

### Setup Locale
```bash
# Clona il progetto
git clone <repository-url>
cd wedding-gallery

# Installa dipendenze
npm install

# Configura variabili ambiente
cp .env.example .env
# Modifica .env con le tue configurazioni Firebase

# Avvia sviluppo
npm run dev
```

### Configurazione Firebase
1. Crea progetto su [Firebase Console](https://console.firebase.google.com/)
2. Abilita Firestore, Storage e Authentication
3. Copia configurazione nel file `.env`
4. Configura regole di sicurezza Firestore e Storage

### Variabili Ambiente
```env
# Firebase Configuration
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef

# App Configuration
VITE_BASE_PATH=/wedgallery
NODE_ENV=development

# Email Configuration (Netsons SMTP)
SMTP_HOST=smtp.netsons.com
SMTP_PORT=465
SMTP_USER=your_email@domain.com
SMTP_PASS=your_password
```

## 📱 Struttura delle Pagine

### Pubbliche
- **Home** (`/`): Landing page e ricerca gallerie
- **Gallery Access** (`/gallery/:code`): Inserimento credenziali accesso
- **Gallery View** (`/view/:code`): Visualizzazione galleria completa
- **Request Password** (`/request-password`): Richiesta accesso galleria

### Admin
- **Admin Login** (`/admin`): Autenticazione amministratore
- **Dashboard** (`/admin/dashboard`): Pannello controllo completo
- **User Profile** (`/profile`): Gestione profilo utente
- **Security Test** (`/security-test`): Testing domande sicurezza

## 🔧 API Endpoints

### Gestione Gallerie
```
GET    /api/galleries/:id/access-info      # Info accesso galleria
POST   /api/galleries/:id/verify-access    # Verifica credenziali
PUT    /api/galleries/:id/security-question # Gestione domande sicurezza
```

### Interazioni Sociali
```
GET    /api/galleries/:id/stats/:type/:itemId     # Statistiche like/commenti
POST   /api/galleries/:id/likes/:type/:itemId     # Toggle like
GET    /api/galleries/:id/comments/:type/:itemId  # Lista commenti
POST   /api/galleries/:id/comments/:type/:itemId  # Aggiungi commento
```

### Voice Memos
```
GET    /api/galleries/:id/voice-memos              # Lista voice memos
POST   /api/galleries/:id/voice-memos              # Upload voice memo
PUT    /api/galleries/:id/voice-memos/:id/unlock   # Sblocca manualmente
DELETE /api/galleries/:id/voice-memos/:id          # Elimina voice memo
```

### Analytics e Attività
```
GET    /api/galleries/:id/comments/recent          # Commenti recenti
GET    /api/galleries/:id/photos/top-liked         # Foto più popolari
GET    /api/galleries/:id/voice-memos/recent       # Voice memos recenti
```

## 🎨 Sistema UI/UX

### Design System
- **Tema**: Elegante matrimoniale con palette soft
- **Typography**: Font Playfair Display per eleganza
- **Icons**: Lucide React per coerenza
- **Animations**: Transizioni fluide e micro-interazioni

### Componenti Decorativi
- **Wedding Illustrations**: Elementi grafici tematici
- **Floral Decorations**: Cornici e divisori eleganti
- **Hero Slideshow**: Galleria immagini homepage
- **Background Effects**: Effetti visivi immersivi

### Responsive Design
- **Mobile First**: Ottimizzato per dispositivi mobili
- **Breakpoints**: Supporto tablet e desktop
- **Touch Friendly**: Interfaccia touch-optimized
- **Progressive Enhancement**: Funzionalità avanzate progressive

## 🔐 Sicurezza

### Autenticazione
- Firebase Authentication per admin
- Protezione password personalizzate per gallerie
- Domande di sicurezza aggiuntive
- Session management sicuro

### Validazione Dati
- Middleware di sanitizzazione input
- Validazione schemi Zod
- Rate limiting su endpoint critici
- CORS configurato appropriatamente

### Privacy
- Gallerie private per default
- Controllo accessi granulare
- Possibilità eliminazione dati
- Compliance privacy europee

## 📧 Sistema Email

### Configurazione SMTP Netsons
```typescript
// Configurazione centralizzata
const transporter = nodemailer.createTransporter({
  host: 'smtp.netsons.com',
  port: 465,
  secure: true,
  auth: {
    user: 'email@domain.com',
    pass: 'password'
  }
});
```

### Template Email
- **Welcome Email**: Benvenuto nuovi utenti
- **Photo Notifications**: Notifiche nuove foto
- **Batch Notifications**: Invii multipli ottimizzati
- **HTML Templates**: Design responsive professionale

## 🚀 Deployment su Replit

### Build Produzione
```bash
# Build automatico
npm run build

# Test locale build
npm run preview
```

### Configurazione Deployment
- **Build Command**: `npm run build`
- **Run Command**: `npm start`
- **Port**: 5000 (forwarded 80/443)
- **Base Path**: `/wedgallery`

### Verifica Deployment
1. Build completa senza errori
2. Configurazione Firebase corretta
3. Variabili ambiente impostate
4. Test routing e asset loading
5. Verifica sistema email

## 📊 Performance

### Ottimizzazioni Implementate
- **Code Splitting**: Caricamento lazy componenti
- **Image Compression**: Riduzione automatica dimensioni
- **Caching**: Strategia cache intelligente
- **Bundle Optimization**: Minimizzazione bundle size

### Metriche Target
- **First Load**: < 3 secondi
- **Interaction**: < 100ms
- **Bundle Size**: < 2MB
- **Lighthouse Score**: > 90

## 🧪 Testing

### Endpoint di Test
```
GET    /api/health                    # Health check server
GET    /api/test-email               # Test configurazione email
GET    /security-test                # Test domande sicurezza
```

### Debugging Tools
- **Path Debug**: Informazioni routing sviluppo
- **Auth Debug**: Panel stato autenticazione
- **Error Boundary**: Cattura errori React
- **Console Logging**: Logging strutturato

## 🎯 Roadmap Future

### Funzionalità Pianificate
- [ ] Sistema notifiche push
- [ ] Integrazione social media
- [ ] Backup automatico cloud
- [ ] Analytics avanzate
- [ ] Multi-lingua support
- [ ] App mobile nativa

### Miglioramenti Tecnici
- [ ] Server-side rendering
- [ ] Edge deployment
- [ ] Advanced caching
- [ ] Real-time collaboration
- [ ] AI image tagging
- [ ] Video support

## 🤝 Contribuzioni

### Development Guidelines
1. Seguire convenzioni TypeScript strict
2. Componenti funzionali con hooks
3. Testing unitario per nuove features
4. Documentazione inline completa
5. PR review obbligatorio

### Coding Standards
- **ESLint**: Linting automatico
- **Prettier**: Formatting consistente
- **Conventional Commits**: Messaggi commit standardizzati
- **Type Safety**: TypeScript strict mode

## 📞 Supporto

### Risoluzione Problemi
1. Verifica configurazione Firebase
2. Controlla variabili ambiente
3. Testa connessione SMTP
4. Review console browser errors
5. Check server logs

### Contatti
- **Developer**: [Nome sviluppatore]
- **Repository**: [URL repository]
- **Documentation**: [URL docs]
- **Support**: [Email support]

---

**Versione**: 2.0.0 (Firebase-Only)  
**Ultimo Aggiornamento**: Gennaio 2025  
**Status**: ✅ Production Ready
