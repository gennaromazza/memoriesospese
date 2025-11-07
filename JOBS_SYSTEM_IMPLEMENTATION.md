# Sistema Gestione Lavori - Piano Implementazione Completo

## 📋 Overview

Sistema completo per la gestione di lavori fotografici personalizzati (matrimoni, battesimi, eventi) separato dal sistema di booking campagne esistente.

**Obiettivi:**
- Gestire workflow completo: Lead → Preventivo → Confermato → Shooting → Selezione → Consegna
- Preventivi digitali con firma (fissi/variabili)
- Clausole contrattuali per tipo evento
- Pagamenti programmati integrati con cassa
- Import massivo 900+ lavori legacy

---

## 🏗️ Architettura

### Separazione Sistemi

**1. Booking Campagne** (già esistente)
- Mini-session stagionali (Natale, Carnevale, ecc.)
- Prenotazione online automatica
- Google Calendar integration
- Prodotti selezionabili (opzionale)

**2. Gestione Lavori** (NUOVO)
- Matrimoni, battesimi, eventi personalizzati
- Creazione manuale da admin
- Pipeline workflow completo
- Preventivi personalizzati
- Pagamenti programmati

---

## 📊 Collections Firestore

- `jobs` - Lavori fotografici
- `quotes` - Preventivi digitali
- `paymentSchedules` - Pagamenti programmati
- `contractClauses` - Template clausole contrattuali
- `quoteTemplates` - Template grafici preventivi

---

## 🔄 Workflow End-to-End

1. Lead → Admin crea job manuale
2. Preventivo → Admin crea e invia preventivo
3. Cliente firma → Preventivo accettato
4. Confermato → Crea ordine e payment schedule
5. Shooting → Admin aggiorna stato
6. Selezione → Cliente sceglie foto da galleria
7. Produzione → Admin produce album/stampe
8. Consegnato → Lavoro completato

---

## 📦 Import Legacy

- Upload ZIP con CSV + PDF moduli
- Batch processing 50 lavori/volta
- Parsing PDF per dati economici
- Creazione automatica clienti/jobs/schedules
- Report dettagliato errori/successi

---

**Data creazione:** 7 Novembre 2025  
**Versione:** 1.0
