#!/bin/bash

# Wedding Gallery App - Production Start Script
# Risolve i problemi di deployment identificati

# Colori per output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Wedding Gallery - Avvio Produzione${NC}"
echo "=================================================="

# Verifica file necessari
echo -e "${YELLOW}🔍 Verifica file deployment...${NC}"
if [ ! -f "dist/index.js" ]; then
    echo -e "${RED}❌ Server non trovato. Esegui: npm run build${NC}"
    exit 1
fi

if [ ! -f "dist/public/index.html" ]; then
    echo -e "${RED}❌ Client non trovato. Esegui: node scripts/fix-deployment.js${NC}"
    exit 1
fi

echo -e "${GREEN}✅ File verificati${NC}"

# Imposta variabili d'ambiente per produzione
export NODE_ENV=production
export PORT=5000
export HOST=0.0.0.0

# Informazioni di avvio
echo -e "${YELLOW}🔧 Configurazione:${NC}"
echo "   • Ambiente: $NODE_ENV"
echo "   • Porta: $PORT"
echo "   • Host: $HOST"
echo "   • Static files: dist/public/"
echo ""

# Messaggi pre-avvio
echo -e "${GREEN}🌐 Applicazione disponibile su:${NC}"
echo "   • Principale: http://0.0.0.0:5000"
echo "   • Admin: http://0.0.0.0:5000/admin"
echo "   • Health: http://0.0.0.0:5000/api/health"
echo ""

echo -e "${BLUE}🚀 Avvio server...${NC}"
echo "=================================================="

# Avvia il server
exec node dist/index.js