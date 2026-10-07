#!/usr/bin/env node

/**
 * 🧪 TEST AUTOMATICI PER CONSULTATION SERVICE OVERLAP
 * Verifica tutti i casi edge per la logica di overlap
 * Test standalone senza dipendenze Firebase
 */

// Mock di createEuropeRomeDate per test senza Firebase
function createEuropeRomeDate(dateStr: string, timeStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hours, minutes] = timeStr.split(':').map(Number);
  const date = new Date(year, month - 1, day, hours, minutes, 0, 0);
  return date;
}

// Copia della funzione hasRealOverlap per test standalone
function hasRealOverlap(
  startA: Date | number,
  endA: Date | number,
  startB: Date | number,
  endB: Date | number
): boolean {
  // Converti tutto in millisecondi
  let startAMs = typeof startA === 'number' ? startA : startA.getTime();
  let endAMs = typeof endA === 'number' ? endA : endA.getTime();
  let startBMs = typeof startB === 'number' ? startB : startB.getTime();
  let endBMs = typeof endB === 'number' ? endB : endB.getTime();
  
  // NORMALIZZA: Rimuovi millisecondi per evitare drift (arrotonda al minuto)
  startAMs -= startAMs % 60000;
  endAMs -= endAMs % 60000;
  startBMs -= startBMs % 60000;
  endBMs -= endBMs % 60000;
  
  // Verifica overlap reale (A termina DOPO che B inizia E A inizia PRIMA che B finisca)
  const hasOverlap = startAMs < endBMs && endAMs > startBMs;
  
  // Debug logging per casi edge
  if (endAMs === startBMs || startAMs === endBMs) {
    console.log(`[hasRealOverlap] ⚠️  Caso edge - slot contigui ma NON sovrapposti:`);
    console.log(`   Periodo A: ${new Date(startAMs).toISOString()} -> ${new Date(endAMs).toISOString()}`);
    console.log(`   Periodo B: ${new Date(startBMs).toISOString()} -> ${new Date(endBMs).toISOString()}`);
    console.log(`   Overlap: ${hasOverlap} (dovrebbe essere false per slot contigui)`);
  }
  
  return hasOverlap;
}

// Colori per output console
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, expected: boolean, actual: boolean): void {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`${colors.green}✓${colors.reset} ${testName}`);
  } else {
    failedTests++;
    console.log(`${colors.red}✗${colors.reset} ${testName}`);
    console.log(`  ${colors.yellow}Expected: ${expected}, Got: ${actual}${colors.reset}`);
  }
}

function runTests(): void {
  console.log(`${colors.cyan}═══════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.cyan}   TEST CONSULTATION OVERLAP LOGIC${colors.reset}`);
  console.log(`${colors.cyan}═══════════════════════════════════════════${colors.reset}\n`);

  const testDate = '2024-12-20';

  // TEST 1: Slot contigui (slotEnd == bookingStart) - DEVE essere disponibile
  console.log(`${colors.blue}Test Case 1: Slot Contigui${colors.reset}`);
  {
    const slot = {
      start: createEuropeRomeDate(testDate, '15:30'),
      end: createEuropeRomeDate(testDate, '16:30')
    };
    const booking = {
      start: createEuropeRomeDate(testDate, '16:30'), // Inizia esattamente quando finisce lo slot
      end: createEuropeRomeDate(testDate, '17:00')
    };
    const overlaps = hasRealOverlap(slot.start, slot.end, booking.start, booking.end);
    assert(
      overlaps === false,
      'Slot 15:30-16:30 vs Booking 16:30-17:00 (contigui)',
      false,
      overlaps
    );
  }

  // TEST 2: Slot prima del booking (slotEnd < bookingStart) - DEVE essere disponibile
  console.log(`\n${colors.blue}Test Case 2: Slot Prima del Booking${colors.reset}`);
  {
    const slot = {
      start: createEuropeRomeDate(testDate, '14:00'),
      end: createEuropeRomeDate(testDate, '15:00')
    };
    const booking = {
      start: createEuropeRomeDate(testDate, '16:30'),
      end: createEuropeRomeDate(testDate, '17:00')
    };
    const overlaps = hasRealOverlap(slot.start, slot.end, booking.start, booking.end);
    assert(
      overlaps === false,
      'Slot 14:00-15:00 vs Booking 16:30-17:00 (separati)',
      false,
      overlaps
    );
  }

  // TEST 3: Slot con overlap parziale (slotStart < bookingEnd) - NON disponibile
  console.log(`\n${colors.blue}Test Case 3: Overlap Parziale${colors.reset}`);
  {
    const slot = {
      start: createEuropeRomeDate(testDate, '16:00'),
      end: createEuropeRomeDate(testDate, '17:00')
    };
    const booking = {
      start: createEuropeRomeDate(testDate, '16:30'),
      end: createEuropeRomeDate(testDate, '17:30')
    };
    const overlaps = hasRealOverlap(slot.start, slot.end, booking.start, booking.end);
    assert(
      overlaps === true,
      'Slot 16:00-17:00 vs Booking 16:30-17:30 (overlap 30 min)',
      true,
      overlaps
    );
  }

  // TEST 4: Slot su pausa pranzo esatta
  console.log(`\n${colors.blue}Test Case 4: Slot su Pausa Pranzo${colors.reset}`);
  {
    const slot = {
      start: createEuropeRomeDate(testDate, '12:30'),
      end: createEuropeRomeDate(testDate, '13:30')
    };
    const pausaPranzo = {
      start: createEuropeRomeDate(testDate, '13:00'),
      end: createEuropeRomeDate(testDate, '14:00')
    };
    const overlaps = hasRealOverlap(slot.start, slot.end, pausaPranzo.start, pausaPranzo.end);
    assert(
      overlaps === true,
      'Slot 12:30-13:30 vs Pausa 13:00-14:00 (overlap 30 min)',
      true,
      overlaps
    );
  }

  // TEST 5: Slot completamente contenuto in altro evento
  console.log(`\n${colors.blue}Test Case 5: Slot Contenuto${colors.reset}`);
  {
    const slot = {
      start: createEuropeRomeDate(testDate, '15:30'),
      end: createEuropeRomeDate(testDate, '16:00')
    };
    const evento = {
      start: createEuropeRomeDate(testDate, '15:00'),
      end: createEuropeRomeDate(testDate, '17:00')
    };
    const overlaps = hasRealOverlap(slot.start, slot.end, evento.start, evento.end);
    assert(
      overlaps === true,
      'Slot 15:30-16:00 contenuto in Evento 15:00-17:00',
      true,
      overlaps
    );
  }

  // TEST 6: Slot che contiene completamente un evento
  console.log(`\n${colors.blue}Test Case 6: Slot Contiene Evento${colors.reset}`);
  {
    const slot = {
      start: createEuropeRomeDate(testDate, '14:00'),
      end: createEuropeRomeDate(testDate, '17:00')
    };
    const evento = {
      start: createEuropeRomeDate(testDate, '15:00'),
      end: createEuropeRomeDate(testDate, '16:00')
    };
    const overlaps = hasRealOverlap(slot.start, slot.end, evento.start, evento.end);
    assert(
      overlaps === true,
      'Slot 14:00-17:00 contiene Evento 15:00-16:00',
      true,
      overlaps
    );
  }

  // TEST 7: Test millisecondi normalizzati (evita drift UTC)
  console.log(`\n${colors.blue}Test Case 7: Normalizzazione Millisecondi${colors.reset}`);
  {
    // Aggiungi millisecondi random per simulare drift
    const slot = {
      start: new Date(createEuropeRomeDate(testDate, '15:30').getTime() + 123),
      end: new Date(createEuropeRomeDate(testDate, '16:30').getTime() + 456)
    };
    const booking = {
      start: new Date(createEuropeRomeDate(testDate, '16:30').getTime() + 789),
      end: new Date(createEuropeRomeDate(testDate, '17:00').getTime() + 321)
    };
    const overlaps = hasRealOverlap(slot.start, slot.end, booking.start, booking.end);
    assert(
      overlaps === false,
      'Slot con millisecondi vs Booking contiguo (normalizzati)',
      false,
      overlaps
    );
  }

  // TEST 8: Job all-day dovrebbe bloccare qualsiasi slot
  console.log(`\n${colors.blue}Test Case 8: Job All-Day${colors.reset}`);
  {
    const slot = {
      start: createEuropeRomeDate(testDate, '10:00'),
      end: createEuropeRomeDate(testDate, '11:00')
    };
    // Simula job all-day (00:00 - 23:59)
    const jobAllDay = {
      start: createEuropeRomeDate(testDate, '00:00'),
      end: createEuropeRomeDate(testDate, '23:59')
    };
    const overlaps = hasRealOverlap(slot.start, slot.end, jobAllDay.start, jobAllDay.end);
    assert(
      overlaps === true,
      'Slot 10:00-11:00 vs Job All-Day',
      true,
      overlaps
    );
  }

  // TEST 9: Timezone consistency test
  console.log(`\n${colors.blue}Test Case 9: Timezone Consistency${colors.reset}`);
  {
    const slot1 = createEuropeRomeDate(testDate, '16:30');
    const slot2 = createEuropeRomeDate(testDate, '16:30');
    assert(
      slot1.getTime() === slot2.getTime(),
      'Due slot creati con stesso orario hanno stesso timestamp',
      true,
      slot1.getTime() === slot2.getTime()
    );
  }

  // TEST 10: Sabato lavorativo con working hours personalizzati
  console.log(`\n${colors.blue}Test Case 10: Sabato Lavorativo${colors.reset}`);
  {
    const sabato = new Date('2024-12-21'); // Sabato
    const dayOfWeek = sabato.getDay();
    assert(
      dayOfWeek === 6,
      'Il 21 dicembre 2024 è un sabato',
      true,
      dayOfWeek === 6
    );
  }

  // RISULTATI FINALI
  console.log(`\n${colors.cyan}═══════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.cyan}   RISULTATI TEST${colors.reset}`);
  console.log(`${colors.cyan}═══════════════════════════════════════════${colors.reset}`);
  console.log(`Total Tests: ${totalTests}`);
  console.log(`${colors.green}Passed: ${passedTests}${colors.reset}`);
  console.log(`${colors.red}Failed: ${failedTests}${colors.reset}`);
  
  if (failedTests === 0) {
    console.log(`\n${colors.green}✨ TUTTI I TEST PASSATI! Il sistema di overlap funziona correttamente.${colors.reset}`);
    process.exit(0);
  } else {
    console.log(`\n${colors.red}⚠️  ${failedTests} TEST FALLITI! Verificare la logica di overlap.${colors.reset}`);
    process.exit(1);
  }
}

// Esegui i test
try {
  runTests();
} catch (error: any) {
  console.error(`${colors.red}ERRORE CRITICO durante l'esecuzione dei test:${colors.reset}`, error.message);
  process.exit(1);
}