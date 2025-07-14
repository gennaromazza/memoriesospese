# Wedding Gallery - Deployment Replit

## Problemi Risolti ✅

### 1. Cannot find module '/home/runner/workspace/dist/index.js'
- **Soluzione**: Creato script che genera automaticamente dist/index.js
- **Script**: scripts/fix-replit-deployment.js
- **Risultato**: File dist/index.js sempre presente dopo build

### 2. TypeScript compilation errors
- **Errori**: TS7006, "Expression not callable" in server/production.ts
- **Soluzione**: Corretti import Express e aggiunta type annotation
- **Risultato**: Zero errori TypeScript compilation

### 3. Build command non genera dist/index.js
- **Problema**: npm run build non creava file server necessario
- **Soluzione**: Aggiornato build command in package.json
- **Risultato**: Build command genera sempre dist/index.js

## Struttura Deployment

```
dist/
├── index.js         # Server entry point (OBBLIGATORIO per Replit)
├── package.json     # Dependencies per production
├── index.html       # Client HTML (se disponibile)
└── assets/          # Static assets (se disponibili)
```

## Comandi Deployment

```bash
# Build completo
npm install && npm run build

# Avvio server
node dist/index.js
```

## Architettura

- **Tipo**: Firebase-Only SPA
- **Server**: Express.js minimo per serving static files
- **Client**: React + Firebase SDK
- **Deployment**: Replit Autoscale ready

## Verifica Deployment

1. ✅ dist/index.js esiste e è funzionante
2. ✅ package.json contiene dependencies corrette
3. ✅ Server avvia senza errori TypeScript
4. ✅ Health check disponibile su /health
5. ✅ SPA routing funzionante con fallback

## Note Tecniche

- Port: 5000 (con fallback automatico 5001)
- Host: 0.0.0.0 (external access)
- Static files: serviti da Express
- Error handling: gestione errori globale
- Graceful shutdown: gestione SIGTERM/SIGINT

---

**Status**: ✅ Tutti i problemi di deployment risolti
**Data**: 14 Luglio 2025
**Versione**: 2.0.0
