
# Configurazione Deployment - Firebase Only

## 🎯 Architettura Attuale

L'applicazione è stata convertita a **Firebase-only**, eliminando il backend Node.js/Express.

## 📦 Struttura Deployment

### Client Build
```bash
npm run build
```
Genera:
- `dist/public/` - Assets statici (HTML, CSS, JS)
- `dist/index.js` - Server statico per servire i file

### Firebase Services
- **Firestore**: Database principale
- **Storage**: File e immagini
- **Auth**: Autenticazione admin

## 🔧 Configurazione Replit

### Deployment Settings
```yaml
build: npm run build
run: npm start
port: 5000
```

### Environment Variables
```bash
# Firebase (Obbligatorio)
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=

# App Settings
VITE_BASE_PATH="/wedgallery"
NODE_ENV=production
```

## 🚀 Processo Deploy

### Automatico (Raccomandato)
1. Configura variabili d'ambiente nel Secrets manager
2. Usa "Autoscale Deployment" in Replit
3. Il sistema eseguirà automaticamente build e deploy

### Manuale
```bash
# 1. Build
npm run build

# 2. Deploy
# Usa il pulsante Deploy nel dashboard Replit
```

## 🔍 Verifica Deploy

### Test Endpoints
- **Home**: `https://your-app.replit.app/`
- **Admin**: `https://your-app.replit.app/admin`
- **Gallery**: `https://your-app.replit.app/gallery/[code]`

### Controlli Salute
- [ ] Frontend carica correttamente
- [ ] Firebase connesso (check console)
- [ ] Routing funziona (navigazione diretta URL)
- [ ] Assets caricano (immagini, CSS, JS)

## 🐛 Troubleshooting

### App non si avvia
```bash
# Verifica build
ls -la dist/
# Deve contenere: index.js, public/
```

### Errori Firebase
1. Verifica configurazione in `.env`
2. Controlla regole Firestore/Storage
3. Verifica billing Firebase (se necessario)

### Problemi Routing
1. Verifica `VITE_BASE_PATH` 
2. Controlla configurazione Vite
3. Testa con URL diretti

---
**Nota**: Questa configurazione è ottimizzata per deployment su Replit con Firebase backend.
