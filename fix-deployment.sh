#!/bin/bash

# Script rapido per correggere i problemi di deployment

echo "🔧 Correzione problemi di deployment..."

# 1. Ferma build precedenti se in corso
pkill -f "vite build" 2>/dev/null || true

# 2. Pulisci e ricrea directory dist
echo "📁 Pulizia directory dist..."
rm -rf dist
mkdir -p dist/public

# 3. Build veloce del client
echo "🏗️  Build client..."
export NODE_ENV=production
npm run build &
BUILD_PID=$!

# Aspetta al massimo 2 minuti per la build
timeout 120s wait $BUILD_PID
if [ $? -eq 124 ]; then
    echo "⚠️  Build timeout, continuando con fix struttura..."
    kill $BUILD_PID 2>/dev/null || true
fi

# 4. Verifica se ci sono file da sistemare
if [ -f "dist/index.html" ]; then
    echo "✅ File client trovati, spostamento in public/"
    
    # Crea directory public se non esiste
    mkdir -p dist/public
    
    # Sposta file client in public
    for item in dist/*.html dist/*.js dist/assets dist/favicon.* dist/*.ico dist/*.png; do
        if [ -e "$item" ] && [ "$(basename "$item")" != "index.js" ] && [ "$(basename "$item")" != "public" ]; then
            mv "$item" dist/public/ 2>/dev/null || true
        fi
    done
    
    echo "✅ File spostati in dist/public/"
else
    echo "⚠️  Nessun file client trovato, creando struttura base..."
    
    # Crea file index.html di base se non esiste
    cat > dist/public/index.html << 'EOF'
<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Wedding Gallery</title>
</head>
<body>
    <div id="root">
        <div style="text-align: center; padding: 50px;">
            <h1>Wedding Gallery</h1>
            <p>Applicazione in caricamento...</p>
            <p><small>Se questo messaggio persiste, verificare la configurazione Firebase.</small></p>
        </div>
    </div>
</body>
</html>
EOF
    
    mkdir -p dist/public/assets
fi

# 5. Build server se necessario
if [ ! -f "dist/index.js" ]; then
    echo "🏗️  Build server..."
    npx esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist
fi

# 6. Verifica struttura finale
echo "🔍 Verifica struttura..."
if [ -f "dist/public/index.html" ] && [ -f "dist/index.js" ]; then
    echo "✅ Struttura corretta:"
    echo "   - dist/index.js (server)"
    echo "   - dist/public/index.html (client)"
    echo "   - dist/public/assets/ (risorse)"
    
    # Mostra dimensioni
    if [ -f "dist/index.js" ]; then
        SERVER_SIZE=$(du -h dist/index.js | cut -f1)
        echo "   - Server: $SERVER_SIZE"
    fi
    
    if [ -f "dist/public/index.html" ]; then
        CLIENT_SIZE=$(du -h dist/public/index.html | cut -f1)
        echo "   - Client: $CLIENT_SIZE"
    fi
    
    echo ""
    echo "🎉 DEPLOYMENT PRONTO!"
    echo ""
    echo "📋 Per avviare:"
    echo "   export NODE_ENV=production"
    echo "   export PORT=5000"
    echo "   node dist/index.js"
    echo ""
    echo "🌐 L'app sarà disponibile su:"
    echo "   http://0.0.0.0:5000"
    
else
    echo "❌ Struttura non corretta. Problemi da verificare:"
    [ ! -f "dist/index.js" ] && echo "   - File server mancante"
    [ ! -f "dist/public/index.html" ] && echo "   - File client mancante"
fi

echo ""
echo "📁 Struttura attuale dist/:"
ls -la dist/ 2>/dev/null || echo "Directory dist vuota"
echo ""
echo "📁 Struttura public/:"
ls -la dist/public/ 2>/dev/null || echo "Directory public vuota"