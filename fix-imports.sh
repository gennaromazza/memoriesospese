#!/bin/bash

# Script per correggere automaticamente tutti gli import con alias @ per il build

echo "🔧 Correzione automatica import per build di produzione..."

# Correggi tutti i file con pattern comuni di import
find client/src -name "*.tsx" -o -name "*.ts" | while read file; do
    echo "Processando: $file"
    
    # Sostituisci import con alias @ nei file
    sed -i 's|from "@/lib/|from "../../lib/|g' "$file"
    sed -i 's|from "@/components/|from "../../components/|g' "$file"
    sed -i 's|from "@/hooks/|from "../../hooks/|g' "$file"
    sed -i 's|from "@/pages/|from "../../pages/|g' "$file"
    sed -i 's|from "@/context/|from "../../context/|g' "$file"
    
    # Aggiusta i path relativi nel caso di file nelle subdirectory
    if [[ "$file" == *"/components/"* ]]; then
        sed -i 's|from "../../lib/|from "../lib/|g' "$file"
        sed -i 's|from "../../hooks/|from "../hooks/|g' "$file"
        sed -i 's|from "../../context/|from "../context/|g' "$file"
    fi
    
    if [[ "$file" == *"/pages/"* ]]; then
        sed -i 's|from "../../components/|from "../components/|g' "$file"
        sed -i 's|from "../../lib/|from "../lib/|g' "$file"
        sed -i 's|from "../../hooks/|from "../hooks/|g' "$file"
        sed -i 's|from "../../context/|from "../context/|g' "$file"
    fi
    
    if [[ "$file" == *"/ui/"* ]]; then
        sed -i 's|from "../lib/|from "../../lib/|g' "$file"
        sed -i 's|from "../hooks/|from "../../hooks/|g' "$file"
    fi
done

echo "✅ Correzione import completata!"
echo "🔨 Avvio build di produzione..."

cd client && NODE_ENV=production VITE_BASE_PATH=/ npm run build