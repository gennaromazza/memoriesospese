#!/bin/bash
set -euo pipefail

echo "=== Timezone ROLLBACK – Ripristino ultimo backup ==="

LATEST_BACKUP=$(ls -d timezone_backup_* 2>/dev/null | sort | tail -n 1 || true)

if [ -z "$LATEST_BACKUP" ]; then
  echo "❌ Nessuna cartella timezone_backup_* trovata, impossibile fare rollback."
  exit 1
fi

echo "Userò il backup: $LATEST_BACKUP"

cd "$LATEST_BACKUP"

# Copia ogni file del backup sopra la root del progetto
find . -type f | while read FILE; do
  SRC="$FILE"
  DEST="../${FILE#./}"
  echo "Ripristino $DEST"
  mkdir -p "$(dirname "$DEST")"
  cp "$SRC" "$DEST"
done

cd ..

echo "✅ Rollback completato. Codice riportato allo stato del backup $LATEST_BACKUP."
