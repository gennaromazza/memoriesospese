# Configurazione Deployment - Base Path

L'applicazione supporta automaticamente sia il deployment in sottocartella che come dominio principale.

## Configurazione Automatica

### Sottocartella (Attuale: `/wedgallery/`)
```bash
# Nel file .env o .env.production
VITE_BASE_PATH="/wedgallery"
```

### Dominio Principale (Futuro)
```bash
# Nel file .env o .env.production
VITE_BASE_PATH=""
# oppure rimuovi completamente la variabile
```

## Come Funziona

L'applicazione utilizza una logica automatica per determinare il base path:

1. **Variabile d'ambiente**: Se `VITE_BASE_PATH` è definita, la usa
2. **Riconoscimento automatico**: Rileva sottocartelle note (`wedgallery`, `gallery`, `app`)
3. **Fallback**: Default a root `/` se non trova pattern noti

## Esempi di URL

### Sottocartella
- **Sito**: `https://gennaromazzacane.it/wedgallery/`
- **API**: `https://gennaromazzacane.it/wedgallery/api/test-email`
- **Foto**: `https://gennaromazzacane.it/wedgallery/gallery/abc123`

### Dominio Principale
- **Sito**: `https://miodominio.com/`
- **API**: `https://miodominio.com/api/test-email`
- **Foto**: `https://miodominio.com/gallery/abc123`

## Migrazione da Sottocartella a Dominio

### Passo 1: Aggiorna Configurazione
```bash
# Cambia in .env.production
VITE_BASE_PATH=""
```

### Passo 2: Rebuild Applicazione
```bash
npm run build
```

### Passo 3: Configura Server Web
```apache
# Per Apache (.htaccess nella root)
RewriteEngine On
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.html [L]
```

```nginx
# Per Nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

## Test Configurazione

Apri la console del browser e verifica:
```javascript
// Controlla configurazione corrente
console.log(window.location.pathname);

// Verifica che le API vengano chiamate correttamente
fetch('/api/test-email').then(r => console.log('API chiamata:', r.url));
```

## Troubleshooting

### Problema: API restituisce 404
- **Causa**: Base path non configurato correttamente
- **Soluzione**: Verifica `VITE_BASE_PATH` e ricompila

### Problema: CSS/JS non si caricano
- **Causa**: Vite base path non allineato
- **Soluzione**: Assicurati che Vite e il runtime usino lo stesso base path

### Problema: Routing non funziona
- **Causa**: Server web non configurato per SPA
- **Soluzione**: Configura fallback a `index.html` per tutte le route

## Note Importanti

- **Variabili d'ambiente**: `VITE_BASE_PATH` deve essere definita al build time
- **Cache**: Pulisci cache browser dopo cambio configurazione
- **Testing**: Testa sempre in ambiente di produzione prima del rilascio
- **Backup**: Salva configurazione funzionante prima di modifiche