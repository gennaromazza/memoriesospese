
# 📸 Memorie Sospese - Documentazione Completa

## 📖 Cos'è Memorie Sospese (Spiegazione Semplice)

**Memorie Sospese** è come un "album fotografico intelligente online" per matrimoni ed eventi speciali.

### 👁️ Cosa Vede l'Utente (Frontend)
Immagina un sito web dove:
- Gli **ospiti** possono vedere le foto del matrimonio in gallerie private protette da password
- Possono **caricare le proprie foto** scattate durante la festa (come condividere su Instagram, ma privato)
- Possono mettere **"Mi piace"** e **commentare** le foto, proprio come sui social network
- Possono registrare **messaggi vocali segreti** per gli sposi (che si sbloccano in date speciali)
- Gli **sposi** possono **prenotare servizi fotografici** direttamente dal sito, scegliendo data e pacchetto
- Possono **scegliere le foto preferite** da stampare sull'album di matrimonio

### ⚙️ Come Funziona Dietro le Quinte (Backend)
Il sistema automatizza tutto per il fotografo:
- **Archivia le foto** in modo sicuro su server cloud (come Google Drive professionale)
- **Invia email automatiche** quando ci sono nuove foto o conferme prenotazioni
- **Gestisce i pagamenti** tracciando acconti e saldi degli ordini
- **Protegge le gallerie** con password e domande di sicurezza
- **Organizza le prenotazioni** con calendari automatici che evitano doppie prenotazioni
- **Genera promemoria** e notifiche per sposi e fotografo

In pratica, è come avere un **assistente digitale** che lavora 24/7 per gestire gallerie fotografiche, prenotazioni e ordini, lasciando al fotografo solo la parte creativa del lavoro.

---

## 🎯 Panoramica Tecnica dell'Applicazione

**Memorie Sospese** è una piattaforma web completa per la gestione e condivisione di gallerie fotografiche matrimoniali, con funzionalità avanzate di booking, gestione ordini, questionari personalizzati e molto altro.

---

## 👥 FUNZIONALITÀ PER I CLIENTI

### 🏠 Homepage Pubblica

#### Navigazione Principale
- **Hero Section Dinamica**: Slideshow con immagini personalizzabili dallo studio
- **Ricerca Gallerie**: Sistema di ricerca per codice galleria o nome evento
- **Campagne Booking**: Banner automatico con campagne attive e countdown
- **Sezione "Come Funziona"**: Guida step-by-step per gli ospiti
- **Contatti Studio**: Informazioni complete con mappa Google Maps integrata
- **Footer Social**: Link diretti ai social network dello studio

#### Servizi Fotografici Disponibili
- **Catalogo Prodotti**: Visualizzazione pacchetti fotografici con prezzi e dettagli
- **Campagne Stagionali**: Offerte speciali con temi personalizzati (Natale, San Valentino, ecc.)
- **Sistema di Prenotazione**: Booking online con calendario interattivo

### 🔐 Accesso alle Gallerie

#### Modalità di Accesso
1. **Gallerie Standard**: 
   - Accesso tramite password fornita dal fotografo
   - Sistema di richiesta password via email
   - Opzionale: domande di sicurezza personalizzate

2. **Gallerie Speciali Tematiche**:
   - Accesso tramite PIN univoco (4 cifre)
   - Temi stagionali personalizzati (Natale, Carnevale, Halloween, ecc.)
   - Interfaccia grafica a tema

#### Autenticazione Ospiti
- **Registrazione Semplificata**: Email e nome per caricare foto
- **Login Persistente**: Sessione salvata per accessi futuri
- **Recupero Password**: Sistema automatico via email
- **Profilo Utente**: Gestione dati personali e avatar

### 📷 Visualizzazione Galleria

#### Interfaccia Principale
- **Griglia Fotografica Responsiva**: Adattamento automatico a tutti i dispositivi
- **Lightbox Avanzato**: Visualizzazione full-screen con controlli touch
- **Filtri e Ordinamento**:
  - Per data e ora di scatto
  - Modalità ordine crescente/decrescente
  - Filtro solo foto selezionate (in modalità selezione)

#### Funzionalità di Visualizzazione
- **Zoom e Pan**: Controlli zoom con gesture touch
- **Download Foto**: Scaricamento diretto in alta qualità
- **Navigazione Veloce**: Swipe tra foto (mobile) e frecce tastiera (desktop)
- **Contatore Progressivo**: Indicatore posizione foto (es. 5/120)

### 🎨 Galleria Interattiva

#### Sistema Social
- **Like alle Foto**: Un like per utente autenticato
- **Commenti**: Sistema di commenti con thread
- **Risposte ai Commenti**: Conversazioni strutturate
- **Notifiche Real-time**: Aggiornamenti istantanei di like/commenti

#### Avatar Personalizzati
- **Immagine Profilo**: Upload avatar personalizzato
- **Fallback Intelligente**: Generazione iniziali colorate
- **Watermark Studio**: (Solo piani Premium) Logo personalizzato sulle foto

### 📤 Upload Foto Ospiti

#### Caricamento Facilitato
- **Drag & Drop**: Interfaccia intuitiva per upload multiplo
- **Compressione Automatica**: Riduzione dimensioni file lato client
- **Protezione Duplicati**: Sistema di rilevamento file già caricati
- **Progress Bar**: Indicatore stato upload in tempo reale
- **Batch Upload**: Caricamento simultaneo fino a 50 foto

#### Gestione Foto Caricate
- **Watermark Automatico**: (Piani a pagamento) Logo studio applicato
- **Metadata Preservati**: Conservazione dati EXIF
- **Distinzione Visiva**: Badge "Ospite" sulle foto degli invitati

### 🎤 Vocali Segreti

#### Funzionalità Innovative
- **Registrazione Diretta**: Registratore vocale integrato nel browser
- **Upload File Audio**: Supporto file audio esterni (max 50MB)
- **Messaggi con Sblocco Temporizzato**: 
  - Impostazione data di sblocco personalizzata
  - Note testuali associate
  - Anteprima bloccata per altri utenti

#### Player Audio Avanzato
- **Controlli Completi**: Play/Pause, Seek, Volume, Reset
- **Visualizzazione Forma d'Onda**: Progress bar interattiva
- **Download Audio**: Scaricamento messaggi vocali
- **Like e Commenti**: Sistema social anche per i vocali

### 📋 Questionario Coppia (Token Based)

#### Accesso Sicuro
- **Link Univoci**: URL personalizzati per sposa e sposo
- **Token Crittografati**: Sistema di autenticazione a 32-48 bytes
- **Scadenza Automatica**: Validità 90 giorni
- **Sessioni Temporanee**: 15 minuti di validità dopo login

#### Compilazione Questionario
- **Form Multi-Step**: Una domanda per volta per UX ottimale
- **Autosave Progressi**: Salvataggio automatico ogni 5-10 secondi
- **Backup Locale**: Mirror in localStorage per recupero
- **Navigazione Avanti/Indietro**: Modifica risposte precedenti
- **Privacy e Consenso**: Checkbox obbligatori GDPR

#### Tipologie Domande
- Campi di testo brevi
- Aree di testo estese
- Domande personalizzabili dallo studio

### 📦 Sistema di Prenotazione Servizi

#### Catalogo Prodotti
- **Visualizzazione Dettagliata**: 
  - Foto prodotto
  - Descrizione completa
  - Prezzo e sconti
  - Numero foto incluse
  - Badge categoria (Album, Stampe, Digitale, Video, Pacchetto)

#### Campagne Booking Stagionali
- **Interfaccia Personalizzata**: Temi grafici stagionali
- **Informazioni Chiare**:
  - Date validità campagna
  - Orari disponibilità
  - Prodotti associati
  - Pause giornaliere

#### Calendario Prenotazioni
- **Selezione Data**: Calendario interattivo con disponibilità in tempo reale
- **Slot Orari**: Visualizzazione fasce orarie disponibili
- **Giorni Esclusi**: Chiusure automatiche (festivi, domeniche, ecc.)
- **Durata Servizio**: Indicazione durata shooting (es. 120 min)

#### Form Prenotazione
- **Dati Cliente**: Nome, cognome, email, telefono/WhatsApp
- **Prodotti Selezionabili**: Scelta singola o multipla da catalogo
- **Note Personalizzate**: Campo libero per richieste speciali
- **Privacy**: Consenso trattamento dati GDPR

#### Conferma e Notifiche
- **Email Automatica**: Riepilogo prenotazione al cliente
- **Stato Prenotazione**: In attesa, Confermata, Completata, Annullata
- **Link Gestione**: Accesso rapido per modifiche/cancellazioni

### 🎬 Video e Multimedia

#### Integrazione YouTube
- **Carosello Video**: Slider multiplo con anteprima thumbnail
- **Player Embedded**: Riproduzione diretta in pagina
- **Playlist Automatica**: Navigazione tra più video

#### Immagini Copertina Duali
- **Mobile (9:16)**: Immagine ottimizzata verticale
- **Desktop (16:9)**: Immagine ottimizzata orizzontale
- **Crop Tool Avanzato**: Editor integrato per ritaglio perfetto
- **Anteprima Live**: Visualizzazione preview prima del salvataggio

### 📖 Libro Storia Coppia (Story Book)

#### Visualizzazione Romantica
- **Interfaccia Libro Digitale**: Paginazione stile libro
- **Capitoli Strutturati**:
  - Prologo
  - L'Attesa
  - L'Incontro
  - La Festa
  - Le Promesse
  - La Celebrazione
  - L'Eternità

#### Contenuti Arricchiti
- **Citazioni Poetiche**: Citazioni d'autore con badge tematici
- **Citazioni Religiose**: Versetti e testi sacri
- **Citazioni Moderne**: Frasi contemporanee
- **Note Fotografo**: Annotazioni professionali
- **Temi Personalizzati**: Colori e stili configurabili

### 🔔 Notifiche Email Automatiche

#### Email Ricevute dai Clienti
1. **Nuove Foto Caricate**: Notifica ospiti quando vengono aggiunte foto
2. **Password Galleria**: Invio automatico password via email
3. **Conferma Prenotazione**: Riepilogo dettagliato booking
4. **Approvazione Prenotazione**: Conferma admin ricevuta
5. **Rifiuto Prenotazione**: Notifica annullamento con motivazione
6. **Acconto Ricevuto**: Conferma pagamento acconto con dettaglio transazione
7. **Saldo Ricevuto**: Conferma pagamento saldo e chiusura ordine

---

## 🔧 FUNZIONALITÀ AMMINISTRATORE

### 🔐 Accesso Admin

#### Autenticazione Sicura
- **Login Email/Password**: Sistema Firebase Authentication
- **Email Hardcoded**: Solo email predefinita `gennaro.mazzacane@gmail.com`
- **Sessioni Persistenti**: Login salvato con flag localStorage
- **Logout Sicuro**: Pulizia completa sessioni e cache

### 📊 Dashboard Amministratore

#### Schermata Principale
- **Schede Organizzate**:
  - 📷 Gallerie
  - 👥 Utenti
  - 🎬 Slideshow
  - 🔑 Richieste Password
  - 📧 Stato Email
  - ❓ Questionari
  - ⚙️ Impostazioni Studio
  - 💰 Cassa
  - 📅 Prenotazioni
  - 📋 Commesse
  - 🎨 Temi Speciali
  - 📦 Prodotti
  - 🎯 Campagne

#### Statistiche Rapide
- Contatori visualizzazioni per ogni sezione
- Badge "Nuovo" per richieste non gestite
- Filtri e ricerca avanzata

### 📷 Gestione Gallerie

#### Creazione Galleria
- **Informazioni Base**:
  - Nome evento/coppia
  - Codice univoco (generato automaticamente)
  - Data evento
  - Luogo
  - Descrizione
  
- **Impostazioni Avanzate**:
  - Password protezione
  - Domande di sicurezza (opzionali)
  - Numero domande richieste (1-3)
  - Deadline selezione foto
  - Enforcement deadline (blocco dopo scadenza)

- **Gestione Visibilità**:
  - Galleria attiva/disattiva
  - Conteggio visualizzazioni
  - Tracking ultima visualizzazione

- **Cover Duali**:
  - Upload immagine mobile (9:16)
  - Upload immagine desktop (16:9)
  - Crop tool integrato
  - Anteprima responsive

- **Video YouTube**:
  - Supporto URL multipli
  - Carosello automatico
  - Ordinamento manuale

- **Collegamento Booking** (se presente):
  - Badge indicatore "Da Prenotazione"
  - Link rapido alla prenotazione
  - Visualizzazione prodotti associati

- **Gallerie Speciali Tematiche**:
  - Selezione tema stagionale
  - Generazione PIN automatico (4 cifre)
  - Invio PIN via email al cliente

#### Modifica Galleria
- **Tutte le impostazioni creazione** modificabili
- **Gestione Password**:
  - Cambio password
  - Invio nuova password via email
  - Modifica domande di sicurezza

- **Gestione Story Book**:
  - Upload capitoli storia coppia
  - Editor citazioni poetiche/religiose/moderne
  - Note fotografo
  - Tema e colore principale

- **Selezione Foto Cliente**:
  - Attivazione modalità selezione
  - Configurazione numero foto richieste
  - Multi-prodotto: assegnazione foto a singoli prodotti
  - Deadline con enforcement
  - Visualizzazione stato compilazione
  - Export selezioni per stampa

#### Eliminazione Galleria
- **Sicurezza**:
  - Dialog conferma con digitazione nome galleria
  - Warning chiaro su eliminazione permanente
  
- **Cascata**:
  - Eliminazione tutte le foto (Storage + Firestore)
  - Eliminazione commenti e like
  - Eliminazione vocali segreti
  - Pulizia analytics

#### Workspace Gestione Foto
- **Pannello Dedicato** per ogni galleria:
  - Upload batch foto (fino a 100 contemporanee)
  - Preview thumbnails
  - Eliminazione selettiva
  - Riordinamento (opzionale)
  - Watermark automatico (piani Premium)
  - Statistiche foto per tipo (fotografo/ospite)

### 👥 Gestione Utenti

#### Visualizzazione Utenti
- **Tabella Completa**:
  - Nome, Email, Ruolo
  - Data registrazione
  - Ultimo accesso
  - Numero gallerie visitate
  - Foto caricate totali

- **Ricerca e Filtri**:
  - Ricerca per nome/email
  - Ordinamento per data/attività

#### Azioni su Utenti
- **Modifica Profilo**:
  - Cambio nome
  - Cambio ruolo (Guest/User/Admin)
  
- **Reset Password**: Invio email reset automatica
- **Visualizza Dettagli**: Storia completa attività utente
- **Eliminazione**: Rimozione definitiva account

#### Export Dati
- **Excel Export**:
  - Nome, Email, Ruolo
  - Data registrazione, Ultimo accesso
  - Numero gallerie, Foto caricate
  - ID Gallerie visitate

### 🎬 Gestione Slideshow Homepage

#### Upload Immagini
- **Interfaccia Drag & Drop**:
  - Selezione file immagine
  - Testo alternativo (SEO)
  - Upload immediato

#### Gestione Slide
- **Controlli per Immagine**:
  - Toggle Attivo/Disattivo
  - Riordinamento (su/giù)
  - Eliminazione
  - Anteprima

- **Ordinamento Manuale**: Cambio posizione slide nello slideshow

### 🔑 Richieste Password

#### Visualizzazione Richieste
- **Tabella Ordinata** (più recenti prima):
  - Nome richiedente
  - Email
  - Codice galleria
  - Data richiesta
  - Stato (In attesa/Inviata/Rifiutata)

#### Gestione Richieste
- **Approvazione**:
  - Invio automatico email con password
  - Aggiornamento stato
  - Log operazione

- **Rifiuto**:
  - Motivazione opzionale
  - Email notifica al richiedente
  - Marcatura rifiutata

#### Export
- **Excel con filtri**:
  - Tutte le richieste
  - Solo approvate
  - Solo in attesa
  - Solo rifiutate

### 📧 Stato Email System

#### Monitoraggio Invii
- **Pannello Diagnostico**:
  - Ultime 50 email inviate
  - Data/ora invio
  - Destinatario
  - Tipo email
  - Stato (Inviata/Fallita)
  - Dettagli errore (se presente)

#### Statistiche
- Totale email inviate oggi
- Tasso successo/fallimento
- Email in coda

#### Test System
- **Invio Email Test**: Verifica configurazione SMTP/Gmail API

### ❓ Gestione Questionari Coppia

#### Modalità Globale (Senza Galleria)
- **Gestione FAQ Sets**:
  - Visualizzazione tutti i set di domande
  - Indicatore set attivo
  - Creazione nuovo set
  - Modifica set esistenti
  - Eliminazione set (se non in uso)
  - Attivazione/Disattivazione set

#### Modalità Galleria Specifica
- **Configurazione Questionario**:
  - Toggle abilitazione per galleria
  - Selezione set domande da usare
  - Informazioni coppia:
    - Nome sposa
    - Nome sposo
    - Data matrimonio
    - Email sposa
    - Email sposo

- **Generazione Token**:
  - Token sicuro per sposa (32-48 bytes + SHA-256)
  - Token sicuro per sposo
  - URL univoci generati automaticamente
  - Scadenza 90 giorni
  - Pulsante copia link rapido

- **Visualizzazione Stato**:
  - Sposa: Non iniziato / In corso / Completato
  - Sposo: Non iniziato / In corso / Completato
  - Progress bar percentuale
  - Data ultima modifica

- **Export Risposte**:
  - Generazione prompt ChatGPT strutturato
  - Template invariabile con:
    - Contesto matrimonio
    - Domande e risposte bride/groom
    - Richiesta output formattato
  - Modal con textarea read-only
  - Pulsante copia per ChatGPT
  - Utilizzo per generazione contenuti album

#### Gestione FAQ Sets (Admin → FAQ)
- **Creazione Set**:
  - Titolo set
  - Minimo 1 domanda, consigliato 10
  - Aggiunta dinamica domande
  - Tipologia domanda (text/textarea)
  - Riordinamento domande (su/giù)
  - Rimozione domande singole

- **Set Predefinito**:
  - Pulsante inizializzazione automatica
  - 10 domande standard pre-configurate
  - Attivazione automatica primo set

- **Attivazione Set**:
  - Solo un set attivo per volta
  - Badge verde "Attivo"
  - Nuovi questionari usano set attivo

### 💰 Gestione Cassa

#### Registro Cassa
- **Operazioni Tracciabili**:
  - Entrate (contanti, carta, bonifico, PayPal)
  - Uscite con categorie
  - Note descrittive
  - Data/ora automatica
  - Collegamento ordini (opzionale)

#### Report Finanziari
- **Filtri Avanzati**:
  - Per data (oggi, settimana, mese, personalizzato)
  - Per tipo operazione (tutte, entrate, uscite)
  - Per metodo pagamento

- **Statistiche**:
  - Totale entrate periodo
  - Totale uscite periodo
  - Saldo netto
  - Grafici andamento

#### Export Contabilità
- **Excel/CSV**:
  - Data, Tipo, Importo
  - Metodo pagamento
  - Descrizione, Note
  - Ordine collegato

### 📅 Gestione Prenotazioni (Bookings)

#### Visualizzazione Prenotazioni
- **Filtri Multipli**:
  - Per stato (In attesa, Confermate, Completate, Annullate)
  - Per intervallo temporale:
    - Oggi
    - Domani
    - Prossima settimana
    - Prossimo mese
  - Ricerca per nome/email/campagna
  - Ordinamento date crescente

- **Card Prenotazione**:
  - Dati cliente (nome, email, telefono)
  - Data e ora shooting
  - Campagna associata
  - Prodotti selezionati (lista espandibile)
  - Stato con badge colorati
  - Note cliente
  - Badge "NUOVA" per prenotazioni non viste

#### Azioni Prenotazione
- **Approvazione**:
  - Invio email conferma automatica
  - Cambio stato "Confermata"
  - Marca come vista
  
- **Rifiuto**:
  - Campo motivazione
  - Email notifica cliente
  - Cambio stato "Annullata"

- **Modifica Dati**:
  - Nome, cognome, email, telefono
  - Note interne
  - Cambio manuale stato

- **Creazione Ordine da Booking**:
  - Dialog rapido con campi pre-popolati
  - Calcolo automatico totale da prodotti
  - Creazione galleria opzionale
  - Collegamento automatico booking→ordine

- **Creazione Galleria da Booking**:
  - **Multi-Prodotto**: Dropdown per scegliere quale prodotto usare
  - Dialog con campi pre-compilati
  - Generazione codice automatico
  - Collegamento automatico booking→galleria

- **Eliminazione**:
  - Conferma con alert
  - Eliminazione permanente
  - Pulizia riferimenti

#### Prenotazioni Manuali
- **Creazione Admin**:
  - Selezione campagna
  - Data/ora manuale
  - Dati cliente
  - Selezione prodotti
  - Note
  - Stato predefinito "Confermata"

#### Navigazione Integrata
- **Link Rapidi**:
  - Da prenotazione a ordine collegato
  - Da prenotazione a galleria collegata
  - Highlight automatico ordine/galleria

### 📋 Gestione Ordini (Orders)

#### Visualizzazione Ordini
- **Filtri**:
  - Per stato (Bozza, In lavorazione, Completato, Annullato)
  - Per booking collegato
  - Ricerca per nome cliente/prodotto/galleria

- **Card Ordine**:
  - Numero ordine (YYYYMMDD-XXXX)
  - Cliente (da booking o manuale)
  - Prodotti con quantità
  - Totale ordine, Acconto, Saldo
  - Badge stato
  - Badge "Custom" per prodotti one-time
  - Indicatore galleria collegata
  - Cronologia transazioni

#### Gestione Pagamenti
- **Registrazione Acconto**:
  - Importo parziale personalizzabile
  - Metodo (Contanti, Carta, Bonifico, PayPal)
  - Note opzionali
  - Supporto acconti multipli
  - Email automatica al cliente con cronologia
  - Aggiornamento saldo automatico
  - Integrazione cassa automatica

- **Registrazione Saldo**:
  - Calcolo automatico saldo rimanente
  - Metodo pagamento
  - Note opzionali
  - Email automatica conferma pagamento completo
  - Chiusura ordine automatica
  - Integrazione cassa automatica

#### Modifica Ordine
- **Dialog Editing Completo**:
  - Cliente (nome, email)
  - Prodotti da catalogo (multi-selezione)
  - **Prodotti Custom**: 
    - Aggiunta prodotto personalizzato
    - Nome e numero foto custom
    - Toggle "Salva nel catalogo"
    - Badge "Custom" in UI
  - Calcolo totale automatico
  - Modifica acconto/saldo
  - Note interne

#### Cambio Stato Ordine
- **Stati Disponibili**:
  - Bozza → In lavorazione → Completato
  - Annullato (da qualsiasi stato)

#### Cronologia Transazioni
- **Visualizzazione Dettagliata**:
  - Data/ora transazione
  - Tipo (Acconto/Saldo)
  - Importo
  - Metodo pagamento
  - Note
  - Email inviata (✓/✗)

#### Navigazione Integrata
- **Link Rapidi**:
  - Da ordine a booking collegato
  - Da ordine a galleria collegata
  - Highlight automatico booking/galleria

### 📦 Gestione Prodotti Catalogo

#### Creazione Prodotto
- **Informazioni Base**:
  - Nome prodotto
  - Descrizione
  - Categoria (Album, Stampe, Digitale, Video, Pacchetto)
  
- **Pricing**:
  - Prezzo base (€)
  - Sconto percentuale (0-100%)
  - Prezzo finale calcolato automaticamente

- **Contenuto**:
  - Numero foto incluse
  - Immagini prodotto (max 5)
  - Upload con compressione automatica
  - Carousel preview

- **Stato**:
  - Attivo/Disattivo
  - Prodotti disattivi non visibili in booking

#### Modifica Prodotto
- Tutte le informazioni modificabili
- Gestione immagini (aggiungi/rimuovi)

#### Eliminazione Prodotto
- Alert conferma
- Eliminazione permanente

#### Statistiche
- Totale prodotti
- Prodotti attivi
- Prodotti disattivati

### 🎯 Gestione Campagne Booking

#### Creazione Campagna
- **Informazioni Base**:
  - Nome campagna
  - Descrizione
  - Codice univoco (generato automaticamente)

- **Date e Anticipi**:
  - Data inizio validità
  - Data fine validità
  - Giorni anticipo slider homepage (0-30)
  - Blocco prenotazioni prima inizio (checkbox)

- **Tema Grafico**:
  - Selezione tema stagionale (Natale, Carnevale, San Valentino, Pasqua, Halloween)
  - Nessun tema (default)

- **Orari Lavorativi**:
  - Apertura (es. 09:00)
  - Inizio pausa (es. 13:00)
  - Fine pausa (es. 14:30)
  - Chiusura (es. 19:00)
  - Durata shooting in minuti (es. 120)

- **Disponibilità**:
  - Giorni esclusi (Domenica, Lunedì, ... Sabato)
  - Multi-selezione per chiusure settimanali

- **Prodotti Associati**:
  - Selezione multipla da catalogo prodotti
  - Solo prodotti selezionati visibili in booking

- **Immagini**:
  - Immagine slider homepage (opzionale)
  - Immagine pagina booking (opzionale)
  - Upload con compressione automatica

- **Stato**:
  - Attiva/Disattiva

#### Modifica Campagna
- Tutte le impostazioni modificabili
- Gestione immagini (upload/rimozione)

#### Eliminazione Campagna
- Alert conferma
- Verifica prenotazioni collegate

#### URL Pubblico
- Generazione automatica: `/prenota/{codice-campagna}`
- Pulsante copia link
- Link condivisibile diretto ai clienti

### 🎨 Gestione Gallerie Speciali Tematiche

#### Visualizzazione Temi Disponibili
- Natale 🎄
- Carnevale 🎭
- San Valentino 💕
- Pasqua 🐰
- Halloween 🎃

#### Informazioni Tema
- Nome tema
- Icona rappresentativa
- Colore primario
- Descrizione

#### Creazione Galleria Tematica
- Selezione tema da lista
- Generazione PIN automatico (4 cifre)
- Invio PIN via email al cliente
- Impostazione copertina tematica
- Interfaccia grafica personalizzata

### ⚙️ Impostazioni Studio

#### Informazioni Studio
- **Dati Base**:
  - Nome studio
  - Slogan
  - Indirizzo completo
  - Telefono
  - Email
  - Sito web

- **Social Links**:
  - Facebook
  - Instagram
  - Twitter/X

- **About**:
  - Descrizione studio
  - Storia
  - Mission

- **Logo**:
  - Upload logo studio
  - Utilizzo in navbar e footer

#### Testi Personalizzabili

**Hero Section**:
- Titolo principale (es. "Catturiamo i momenti più preziosi")
- Sottotitolo (es. "Ogni scatto racconta una storia unica")
- Testo pulsante CTA (es. "Trova la tua galleria")

**Sezione WhatsApp**:
- Titolo (es. "Contattaci su WhatsApp")
- Sottotitolo (es. "Siamo qui per te")
- Testo descrittivo
- Testo pulsante (es. "Scrivici su WhatsApp")

#### Salvataggio
- Pulsante "Salva Impostazioni"
- Aggiornamento immediato homepage

---

## 🔄 INTEGRAZIONI E AUTOMAZIONI

### 📧 Sistema Email (Gmail API)

#### Email Automatiche Clienti
1. **Nuove Foto**: Notifica caricamento foto in galleria
2. **Password Galleria**: Invio password dopo approvazione richiesta
3. **Conferma Booking**: Riepilogo prenotazione
4. **Approvazione Booking**: Conferma fotografo
5. **Rifiuto Booking**: Notifica annullamento
6. **Acconto Ricevuto**: Conferma pagamento parziale con cronologia
7. **Saldo Ricevuto**: Conferma completamento pagamento

#### Email Amministratore
1. **Nuova Prenotazione**: Notifica admin per approvazione
2. **Nuova Richiesta Password**: Alert richiesta accesso galleria

### 📊 Analytics e Tracking

#### Metriche Gallerie
- Contatore visualizzazioni
- Data ultima visualizzazione
- Tracking utenti unici
- Foto caricate (fotografo vs ospiti)

#### Metriche Utenti
- Ultimo accesso
- Gallerie visitate
- Foto caricate totali
- Interazioni (like/commenti)

### 🔐 Sistema di Sicurezza

#### Autenticazione Multi-Livello
- Admin: Email/Password Firebase
- Clienti: Email/Password o Anonymous
- Gallerie: Password + Domande Sicurezza opzionali
- Questionari: Token crittografati con scadenza

#### Rate Limiting
- Protezione brute-force login
- Limitazione richieste API
- Throttling upload foto

#### Privacy e GDPR
- Consenso esplicito dati
- Privacy policy integrata
- Termini e condizioni
- Diritto all'oblio (eliminazione account)

---

## 📱 RESPONSIVE DESIGN

### Dispositivi Supportati
- 📱 **Mobile**: < 768px (phone)
- 📱 **Tablet**: 768px - 1024px
- 💻 **Desktop**: > 1024px
- 🖥️ **Large Desktop**: > 1440px

### Ottimizzazioni Mobile
- Touch gestures (swipe, pinch-to-zoom)
- Hamburger menu responsive
- Caricamento immagini ottimizzato
- Lazy loading
- Interfacce touch-friendly

---

## 🛠️ STACK TECNOLOGICO

### Frontend
- **React** + **TypeScript**
- **Tailwind CSS** per styling
- **Wouter** per routing
- **React Query** per state management
- **shadcn/ui** componenti UI

### Backend
- **Firebase Firestore** (database)
- **Firebase Storage** (file storage)
- **Firebase Authentication** (autenticazione)
- **Firebase Functions** (serverless)
- **Express.js** (API server opzionale)

### Servizi Esterni
- **Gmail API** (invio email)
- **Google Calendar API** (gestione booking slots)
- **Stripe** (pagamenti - futura implementazione)

---

## 📦 DEPLOYMENT

### Hosting
- **Firebase Hosting** per SPA
- **Replit** per sviluppo e staging
- **Subdirectory support** per installazioni custom

### Build & Deploy
- Build automatizzato con Vite
- Deploy con Firebase CLI
- Ottimizzazione bundle
- Minificazione assets

---

## 🔮 ROADMAP FUTURI SVILUPPI

### Pianificati
- [ ] Integrazione Stripe per pagamenti online
- [ ] App mobile nativa (React Native)
- [ ] Sistema recensioni pubbliche
- [ ] Marketplace stampe personalizzate
- [ ] AI per selezione automatica migliori foto
- [ ] Editor foto online integrato
- [ ] Condivisione diretta social network
- [ ] QR Code per accesso rapido gallerie

---

## 📞 SUPPORTO

### Contatti Sviluppo
- **Email**: gennaro.mazzacane@gmail.com
- **GitHub**: Repository privato
- **Documentazione**: `/docs` directory

### Manutenzione
- **Backup**: Automatici giornalieri Firebase
- **Monitoraggio**: Firebase Crashlytics
- **Log**: Cloud Functions logs
- **Uptime**: 99.9% SLA Firebase

---

**Versione Documentazione**: 1.0  
**Ultimo Aggiornamento**: Gennaio 2025  
**Autore**: Memorie Sospese Development Team
