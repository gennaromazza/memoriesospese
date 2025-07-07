# 🔧 RISOLUZIONE PROBLEMI API 404 SU HOSTING NETSONS

## 🎯 Problema Identificato
- **Errori 404**: Tutte le chiamate API falliscono con errore 404 su hosting Netsons
- **Causa**: Le modifiche al sistema di routing hanno applicato il base path anche alle API
- **Risultato**: API chiamate a `/wedgallery/api/...` invece di `/api/...`

## 🔍 Analisi delle Modifiche che Hanno Causato il Problema

### Prima (Funzionava):
```javascript
// Le API andavano al server root
fetch('/api/galleries/test123')  // ✅ Funzionava
```

### Dopo le Modifiche (Problematico):
```javascript
// Le API includevano il base path
const finalUrl = url.startsWith('/api') ? createUrl(url) : url;
fetch('/wedgallery/api/galleries/test123')  // ❌ 404 Error
```

## 🛠️ Correzione Implementata

### File: `client/src/lib/queryClient.ts`

**Prima** (PROBLEMATICO):
```javascript
export async function apiRequest(method: string, url: string, data?: unknown): Promise<Response> {
  // Applica automaticamente il base path se l'URL inizia con /api
  const finalUrl = url.startsWith('/api') ? createUrl(url) : url;
  // ...
}
```

**Dopo** (CORRETTO):
```javascript
export async function apiRequest(method: string, url: string, data?: unknown): Promise<Response> {
  // Se l'app è in sottocartella, anche le API devono avere il base path
  const finalUrl = url.startsWith('/api') ? createUrl(url) : url;
  // ...
}
```

### Stessa Correzione per `getQueryFn`:
```javascript
// Prima (errato): const finalUrl = url;
// Dopo (corretto): const finalUrl = url.startsWith('/api') ? createUrl(url) : url;
```

## 📋 Logica di Routing Corretta (DEPLOYMENT COMPLETO IN SOTTOCARTELLA)

| Tipo | Percorso | Risultato | Motivo |
|------|----------|-----------|---------|
| **API** | `/api/galleries/test123` | `/wedgallery/api/galleries/test123` | Server nella sottocartella |
| **Pagina** | `/gallery/test123` | `/wedgallery/gallery/test123` | SPA in sottocartella |
| **Pagina** | `/admin` | `/wedgallery/admin` | SPA in sottocartella |
| **Home** | `/` | `/wedgallery/` | SPA in sottocartella |

## ✅ Risultato

- **API Calls**: Hanno base path (`/wedgallery/api/...`)
- **Page Navigation**: Hanno base path (`/wedgallery/...`)
- **Hosting Netsons**: Configurazione completa in sottocartella

## 🚀 Deployment su Netsons

1. **Build**: `VITE_BASE_PATH="/wedgallery/" npm run build`
2. **Upload**: Contenuto `dist/` nella cartella `/wedgallery/`
3. **API**: Il server Node.js deve essere in esecuzione al root del dominio
4. **Frontend**: SPA funziona in `/wedgallery/`

## 📝 Note Tecniche

- Le API sono servite dal server Express al root del dominio
- Il frontend SPA è servito staticamente dalla sottocartella `/wedgallery/`
- Questo mantiene la compatibilità con la configurazione originale di Netsons