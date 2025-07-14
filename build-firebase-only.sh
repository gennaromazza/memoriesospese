#!/bin/bash

# Build script per Firebase-Only SPA
# Salta TypeScript check server e compila solo client

echo "🔥 Building Firebase-Only SPA..."

# Rimuovi dist precedente
rm -rf dist

# Build solo client con Vite (senza TypeScript check server)
echo "📦 Building client with Vite..."
cd client && npx vite build --emptyOutDir --outDir ../dist

# Verifica che il build sia completato
if [ -d "../dist" ]; then
    echo "✅ Build completato con successo!"
    echo "📁 Files generati in ./dist/"
    ls -la ../dist/
else
    echo "❌ Build fallito - cartella dist non trovata"
    exit 1
fi

echo "🚀 Firebase-Only SPA ready for deployment!"