#!/bin/bash

# Script di build per produzione senza shebang nei file JS

echo "🔧 Preparazione build per deployment..."

# Crea directory dist se non esiste
mkdir -p dist

# Build del client
echo "📦 Building client..."
npm run build:client

# Build del server
echo "🔧 Building server..."
npm run build:server

# Crea struttura corretta per deployment
echo "📁 Creazione struttura deployment..."
mkdir -p dist/public

# Sposta i file del client nella directory public
if [ -d "dist" ]; then
    # Copia tutto tranne index.js nella directory public
    for item in dist/*; do
        if [ "$(basename "$item")" != "index.js" ] && [ "$(basename "$item")" != "public" ]; then
            cp -r "$item" dist/public/
        fi
    done
    echo "✅ Struttura di deployment creata"
else
    echo "❌ Directory dist non trovata"
    exit 1
fi

echo "🚀 Build completato con successo!"
echo "📁 Struttura finale:"
echo "   dist/index.js (server)"
echo "   dist/public/ (client files)"