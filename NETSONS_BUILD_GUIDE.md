# 🚀 GUIDA BUILD PER HOSTING NETSONS

## 📋 Configurazione Corretta per Deployment in /wedgallery/

### 1. Build con Base Path
```bash
VITE_BASE_PATH="/wedgallery/" npm run build
```

### 2. Struttura di Upload su Netsons
```
gennaromazzacane.it/
├── wedgallery/
│   ├── dist/
│   │   ├── index.js          # Server Express
│   │   └── public/           # Frontend statico
│   │       ├── index.html
│   │       ├── assets/
│   │       └── ...
│   └── node_modules/         # Dependencies
```

### 3. URL di Accesso
- **Frontend**: `https://gennaromazzacane.it/wedgallery/`
- **API**: `https://gennaromazzacane.it/wedgallery/api/...`

## ✅ Verifica Configurazione

### Check Base Path
```javascript
// Deve restituire '/wedgallery'
console.log(import.meta.env.BASE_URL);
```

### Check API Calls
- Le chiamate API devono essere: `/wedgallery/api/galleries/...`
- Le pagine devono essere: `/wedgallery/gallery/...`

## 🔧 Script di Build Automatico

```bash
# Build completo con verifica
npm run build
node scripts/test-url-duplications.cjs
node scripts/test-api-paths.cjs
```

## 📝 Note per Netsons

1. **Server Node.js**: Deve essere avviato nella cartella `/wedgallery/`
2. **Static Files**: Serviti dalla cartella `/wedgallery/dist/public/`
3. **Port**: Server deve ascoltare sulla porta configurata da Netsons
4. **Environment**: Impostare `NODE_ENV=production`

## 🛠️ Troubleshooting

### Se le API danno 404:
- Verificare che il server Node.js sia in esecuzione
- Controllare che il base path sia corretto nelle chiamate
- Verificare i log del server per errori

### Se le pagine non caricano:
- Verificare che `VITE_BASE_PATH="/wedgallery/"` sia impostato durante la build
- Controllare che i file statici siano nella posizione corretta
- Verificare che non ci siano duplicazioni nel path