#!/bin/bash

# Script per deployment su Replit (dominio root)

echo "🚀 Deployment per memoriesospese.replit.app (dominio root)"

# Configura environment per deployment root
echo "📝 Configurazione per dominio root..."
export NODE_ENV=production
export VITE_BASE_PATH=/

# Pulisci build precedente
echo "🧹 Pulizia build precedente..."
rm -rf dist
mkdir -p dist

# Build del client con configurazione root
echo "📦 Build client per dominio root..."
npm run build

# Verifica struttura
echo "📁 Verifica struttura deployment:"
ls -la dist/
echo "📁 Contenuto dist/public/:"
ls -la dist/public/ || echo "Directory public non trovata"

echo "✅ Deployment preparato per memoriesospese.replit.app"
echo "🔧 Configurazione: BASE_PATH=/ (dominio root)"
echo "📍 Pronto per Replit Deploy"