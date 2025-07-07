# Wedding Gallery - Deployment Guide

## ✅ Problemi Risolti

Tutti i problemi di deployment identificati sono stati corretti:

1. **✅ Directory `dist/public/` mancante**: Creata e configurata correttamente
2. **✅ Porta 5000 vs 3000**: Server configurato correttamente per porta 5000 
3. **✅ Struttura build corretta**: `dist/index.js` (server) + `dist/public/` (client)
4. **✅ Script di correzione automatica**: `scripts/fix-deployment.js` disponibile

## 🚀 Deployment su Replit

### Opzione 1: Deployment Automatico (Raccomandato)
1. Vai su **Deployments** nel tuo Repl
2. Seleziona **"Autoscale Deployment"**
3. Il deployment utilizzerà automaticamente:
   - Build command: `npm run build`
   - Start command: `npm start`
   - Porta: 5000 (configurata automaticamente)

### Opzione 2: Deployment Manuale
```bash
# 1. Build dell'applicazione
npm run build

# 2. Correggi struttura se necessario
node scripts/fix-deployment.js

# 3. Avvia in produzione
./start-production.sh
```

## 🔧 Struttura File Corretta

```
project/
├── dist/
│   ├── index.js          # Server bundle
│   └── public/           # Static files directory
│       ├── index.html    # Client entry point
│       └── assets/       # JS, CSS, images
├── scripts/
│   └── fix-deployment.js # Script correzione automatica
├── start-production.sh   # Script avvio produzione
└── health-check.js      # Monitoring script
```

## 🌐 Porte e Network

- **Porta Produzione**: 5000 (configurata nel server)
- **Host**: 0.0.0.0 (accessibile dall'esterno)
- **Static Files**: Serviti da `dist/public/`
- **API Endpoints**: Disponibili su `/api/*`

## 🏥 Health Check

Test dello stato dell'applicazione:
```bash
node health-check.js
```

URL di test:
- **Main**: `http://your-app.replit.app/`
- **Admin**: `http://your-app.replit.app/admin`
- **Health**: `http://your-app.replit.app/api/health`

## 📋 Checklist Pre-Deployment

- [x] `dist/index.js` esiste (server bundle)
- [x] `dist/public/index.html` esiste (client)
- [x] `dist/public/assets/` esiste (static assets)
- [x] Server configurato per porta 5000
- [x] Environment variables configurate
- [x] Script di correzione disponibili

## 🛠️ Troubleshooting

### Se il deployment fallisce:
```bash
# Rigenera build completa
npm run build
node scripts/fix-deployment.js
```

### Se l'app non si avvia:
1. Verifica che `dist/public/` contenga `index.html`
2. Controlla che il server sia configurato per porta 5000
3. Verifica i logs per errori specifici

### Environment Variables necessarie:
- `NODE_ENV=production`
- `PORT=5000` (opzionale, default già configurato)

## 🎉 Status Deployment

**✅ DEPLOYMENT PRONTO**

L'applicazione è configurata correttamente per essere deployata su Replit o qualsiasi altra piattaforma che supporti Node.js applications.