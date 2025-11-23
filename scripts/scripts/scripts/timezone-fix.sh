#!/bin/bash
set -euo pipefail

echo "=== Timezone FIX – Backup + Patch createEvent ==="

# 1) Trova google-calendar.ts nel progetto
GC_PATH=$(find . -name "google-calendar.ts" | head -n 1 || true)

if [ -z "$GC_PATH" ]; then
  echo "❌ File google-calendar.ts non trovato (cerco con find . -name 'google-calendar.ts')"
  exit 1
fi

echo "Trovato google-calendar.ts in: $GC_PATH"

# 2) Crea backup con timestamp
BACKUP_DIR="timezone_backup_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

echo "Creo backup in: $BACKUP_DIR"
mkdir -p "$(dirname "$BACKUP_DIR/$GC_PATH")"
cp "$GC_PATH" "$BACKUP_DIR/$GC_PATH"

echo "✅ Backup completato: $BACKUP_DIR/$GC_PATH"

# 3) Esegui patch via Node (find & replace del blocco createEvent)
node <<'EOF'
const fs = require("fs");
const path = require("path");

// Cerca google-calendar.ts
function findGoogleCalendarTs(startDir) {
  const entries = fs.readdirSync(startDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(startDir, entry.name);
    if (entry.isDirectory()) {
      const res = findGoogleCalendarTs(fullPath);
      if (res) return res;
    } else if (entry.isFile() && entry.name === "google-calendar.ts") {
      return fullPath;
    }
  }
  return null;
}

const gcPath = findGoogleCalendarTs(".");
if (!gcPath) {
  console.error("❌ google-calendar.ts non trovato (ricerca ricorsiva)");
  process.exit(1);
}

console.log("Patch su:", gcPath);

let src = fs.readFileSync(gcPath, "utf8");

// BLOCCO ORIGINALE da sostituire (timed event in createEvent)
const oldBlock = `
  } else if (eventData.start && eventData.end) {
    startField = {
      dateTime: eventData.start.toISOString(),
      timeZone: "Europe/Rome",
    };
    endField = {
      dateTime: eventData.end.toISOString(),
      timeZone: "Europe/Rome",
    };
  } else {
`;

// BLOCCO NUOVO: costruisce dateTime “floating” Europe/Rome
const newBlock = `
  } else if (eventData.start && eventData.end) {
    // Normalizza a dateTime "floating" in fuso Europe/Rome
    const startLocal = new Date(eventData.start);
    const endLocal = new Date(eventData.end);

    const formatLocal = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const hours = String(d.getHours()).padStart(2, "0");
      const minutes = String(d.getMinutes()).padStart(2, "0");
      const seconds = String(d.getSeconds()).padStart(2, "0");
      // YYYY-MM-DDTHH:mm:ss senza Z → floating nel timeZone indicato
      return (
        year +
        "-" +
        month +
        "-" +
        day +
        "T" +
        hours +
        ":" +
        minutes +
        ":" +
        seconds
      );
    };

    startField = {
      dateTime: formatLocal(startLocal),
      timeZone: "Europe/Rome",
    };
    endField = {
      dateTime: formatLocal(endLocal),
      timeZone: "Europe/Rome",
    };
  } else {
`;

if (!src.includes(oldBlock)) {
  console.error("❌ Blocco originale non trovato in createEvent. Nessuna modifica applicata.");
  process.exit(1);
}

src = src.replace(oldBlock, newBlock);

fs.writeFileSync(gcPath, src);
console.log("✅ Patch applicata con successo a createEvent in", gcPath);
EOF

echo ""
echo "=== COMPLETATO ✅ ==="
echo "Se qualcosa non va, usa scripts/timezone-rollback.sh per tornare indietro."
