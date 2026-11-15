import './_group.css';
import './Proposal.css';

import { useMemo, useState, type FormEvent } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Album,
  ArrowUpRight,
  BookOpen,
  Briefcase,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  Copy,
  ExternalLink,
  FileImage,
  Filter,
  Globe,
  Lock,
  Menu,
  MessageSquareWarning,
  Pencil,
  Plus,
  Printer,
  Search,
  Settings,
  ShoppingBag,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Truck,
  Unlock,
  Wallet,
  X,
} from 'lucide-react';

type Book = {
  id: string;
  name: string;
  galleryName?: string;
  jobId?: string;
  clientName: string;
  version: number;
  pageCount: number;
  versions: number;
  pending?: number;
  approved?: boolean;
  locked?: boolean;
  mockup: 'unassigned' | 'draft' | 'submitted' | 'confirmed';
  mockupDescription?: string;
  shipment?: boolean;
};

const initialBooks: Book[] = [
  {
    id: 'pb-vincenzo',
    name: 'Vincenzo e Ilenia',
    galleryName: 'Matrimonio Vincenzo e Ilenia',
    jobId: 'job-vincenzo',
    clientName: 'Vincenzo e Ilenia',
    version: 3,
    pageCount: 48,
    versions: 3,
    pending: 2,
    mockup: 'unassigned',
  },
  {
    id: 'pb-mattia',
    name: 'Mattia Alma',
    galleryName: 'Matrimonio Mattia Alma',
    jobId: 'job-mattia',
    clientName: 'Mattia Alma',
    version: 2,
    pageCount: 36,
    versions: 2,
    mockup: 'draft',
    mockupDescription: 'Album fotografico · bozza da preparare',
  },
  {
    id: 'pb-biagio',
    name: 'Biagio e Roberta',
    galleryName: 'Matrimonio Biagio e Roberta',
    jobId: 'job-biagio',
    clientName: 'Biagio e Roberta',
    version: 4,
    pageCount: 52,
    versions: 4,
    pending: 1,
    mockup: 'submitted',
  },
  {
    id: 'pb-angelo',
    name: 'Angelo e Carolina',
    galleryName: 'Matrimonio Angelo e Carolina',
    jobId: 'job-angelo',
    clientName: 'Angelo e Carolina',
    version: 2,
    pageCount: 44,
    versions: 2,
    approved: true,
    mockup: 'confirmed',
  },
  {
    id: 'pb-emilio',
    name: 'Emilio e Ilaria',
    clientName: 'Emilio e Ilaria',
    version: 1,
    pageCount: 28,
    versions: 1,
    mockup: 'draft',
    mockupDescription: 'Custodia · bozza da preparare',
  },
  {
    id: 'pb-gennaro',
    name: 'Gennaro e Sara',
    galleryName: 'Matrimonio Gennaro e Sara',
    jobId: 'job-gennaro',
    clientName: 'Gennaro e Sara',
    version: 3,
    pageCount: 50,
    versions: 3,
    approved: true,
    locked: true,
    mockup: 'confirmed',
    shipment: true,
  },
];

type ModalState = 'create' | 'tutorial' | 'changes' | 'editor' | 'delete' | 'print' | null;

const statusText: Record<Book['mockup'], string> = {
  unassigned: 'Modello da assegnare',
  draft: 'Bozza da preparare',
  submitted: 'Da verificare',
  confirmed: 'Confermato dallo studio',
};

type AdminNavSection = {
  id: string;
  label: string;
  icon: LucideIcon;
  items?: string[];
};

const adminNavSections: AdminNavSection[] = [
  { id: 'agenda', label: 'Agenda', icon: Calendar, items: ['Calendario', 'Lista Prenotazioni', 'Campagne', 'Richieste Info', 'Template Richieste', 'Centro Follow-up'] },
  { id: 'lavori', label: 'Lavori & Clienti', icon: Briefcase, items: ['Lista Lavori', 'Clienti', 'Tipi di Lavoro', 'Laboratori', 'Clausole Contrattuali', 'Template Preventivi', 'Moduli Informativi'] },
  { id: 'gallerie', label: 'Gallerie', icon: BookOpen, items: ['Gallerie Eventi', 'Fotolibri', 'Modifiche Fotolibro', 'Questionari', 'Richieste Password', 'Temi Stagionali'] },
  { id: 'comunicazione', label: 'Comunicazione & Sito', icon: Globe, items: ['Sito Pubblico – Portfolio', 'Sito Pubblico – Blog', 'Video', 'Email Massivo', 'Storico Email'] },
  { id: 'cassa', label: 'Cassa', icon: Wallet },
  { id: 'shop', label: 'Shop online', icon: ShoppingBag, items: ['Shop di Natale', 'Stampe online', 'Gift card'] },
  { id: 'impostazioni', label: 'Impostazioni', icon: Settings, items: ['Impostazioni Studio', 'Slideshow Homepage', 'Integrazioni', 'Collaboratori', 'Catalogo Prodotti', 'Categorie Prodotti', 'Statistiche Prodotti', 'Migrazione Foto Legacy', 'Audit Sistema', 'Gestione Backup', 'Migrazione Telefoni', 'Sicurezza Accesso'] },
  { id: 'assistente', label: 'Assistente', icon: Sparkles },
];

export function Proposal() {
  const [books, setBooks] = useState(initialBooks);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'attention' | 'approved'>('all');
  const [modal, setModal] = useState<ModalState>(null);
  const [target, setTarget] = useState<Book | null>(null);
  const [queueOpen, setQueueOpen] = useState(true);
  const [toast, setToast] = useState('');
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<'linked' | 'standalone'>('linked');
  const [newGallery, setNewGallery] = useState('');
  const [expandedNav, setExpandedNav] = useState<string | null>('gallerie');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const active = books.filter((book) => !book.locked);
  const queue = books.filter((book) => book.locked);
  const linked = active.filter((book) => Boolean(book.jobId || book.galleryName));
  const standalone = active.filter((book) => !book.jobId && !book.galleryName);
  const pendingCount = active.reduce((sum, book) => sum + (book.pending || 0), 0);
  const waitingMockups = active.filter((book) => book.mockup === 'submitted').length;
  const approvedCount = active.filter((book) => book.approved).length;

  const visibleBooks = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return (items: Book[]) =>
      items.filter((book) => {
        const matchesText = !needle || `${book.name} ${book.clientName} ${book.galleryName || ''}`.toLocaleLowerCase().includes(needle);
        const matchesFilter =
          filter === 'all' ||
          (filter === 'attention' && ((book.pending || 0) > 0 || book.mockup === 'submitted' || book.mockup === 'unassigned')) ||
          (filter === 'approved' && book.approved);
        return matchesText && matchesFilter;
      });
  }, [filter, query]);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2600);
  };

  const updateBook = (id: string, patch: Partial<Book>) => {
    setBooks((current) => current.map((book) => book.id === id ? { ...book, ...patch } : book));
  };

  const showModal = (kind: ModalState, book?: Book) => {
    setTarget(book || null);
    setModal(kind);
  };

  const handleNavSection = (section: AdminNavSection) => {
    if (section.items) {
      setExpandedNav((current) => current === section.id ? null : section.id);
      return;
    }
    notify(`${section.label} · navigazione di esempio`);
  };

  const handleNavItem = (label: string) => {
    setMobileMenuOpen(false);
    if (label !== 'Fotolibri') notify(`${label} · navigazione di esempio`);
  };

  const copyLink = async (book: Book) => {
    try {
      await navigator.clipboard?.writeText(`https://studio.example/album/${book.id}`);
      notify(`Link cliente copiato · ${book.name}`);
    } catch {
      notify('Link cliente pronto da copiare');
    }
  };

  const createBook = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newName.trim()) return;
    const book: Book = {
      id: `pb-${Date.now()}`,
      name: newName.trim(),
      ...(newType === 'linked' ? { galleryName: newGallery.trim() || 'Lavoro da collegare', jobId: `job-${Date.now()}` } : {}),
      clientName: newName.trim(),
      version: 1,
      pageCount: 0,
      versions: 1,
      mockup: 'unassigned',
    };
    setBooks((current) => [book, ...current]);
    setNewName('');
    setNewGallery('');
    setModal(null);
    notify('Fotolibro creato · pronto per le pagine');
  };

  const confirmDelete = () => {
    if (target) setBooks((current) => current.filter((book) => book.id !== target.id));
    setModal(null);
    notify('Fotolibro eliminato');
  };

  const BookRow = ({ book }: { book: Book }) => {
    const isLinked = Boolean(book.jobId || book.galleryName);
    return (
      <article className="proposal-book" data-testid={`card-photobook-${book.id}`}>
        <div className="proposal-book-art" aria-hidden="true">
          <div className="book-cover"><span>{book.clientName.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span></div>
          <span className="cover-page-count">{book.pageCount}p</span>
        </div>
        <div className="proposal-book-main">
          <div className="proposal-book-titleline">
            <div className="proposal-book-heading">
              <h3>{book.name}</h3>
              <p>{isLinked ? (book.galleryName || 'Senza galleria · lavoro collegato') : 'Fotolibro autonomo'} <span>·</span> {book.clientName}</p>
            </div>
            <span className="version-pill">v{book.version}</span>
          </div>
          <div className="proposal-book-meta">
            <span><FileImage size={14} /> {book.pageCount} pagine</span>
            <span className="meta-dot" />
            <span>{book.versions} {book.versions === 1 ? 'versione' : 'versioni'}</span>
            <span className={`mockup-state mockup-${book.mockup}`}>
              <i /> {statusText[book.mockup]}
            </span>
          </div>
          <div className="proposal-book-badges">
            {(book.pending || 0) > 0 && (
              <button className="status-chip chip-pending" onClick={() => showModal('changes', book)} data-testid={`badge-pending-changes-${book.id}`}>
                <MessageSquareWarning size={13} /> {book.pending} {book.pending === 1 ? 'modifica' : 'modifiche'}
              </button>
            )}
            {book.approved && <span className="status-chip chip-approved" data-testid={`badge-approved-${book.id}`}><CheckCircle2 size={13} /> Approvato</span>}
            {book.locked && <span className="status-chip chip-locked" data-testid={`badge-locked-${book.id}`}><Lock size={12} /> Modifiche bloccate</span>}
          </div>
          <div className="proposal-actions">
            {book.mockup === 'unassigned' && (
              <button className="action-link action-assign" onClick={() => { updateBook(book.id, { mockup: 'draft', mockupDescription: 'Album fotografico · bozza da preparare' }); notify('Modello assegnato'); }}>
                <Sparkles size={14} /> Assegna modello
              </button>
            )}
            <button className="action-primary" onClick={() => showModal('editor', book)} data-testid={`button-edit-photobook-${book.id}`}><Pencil size={14} /> Apri editor</button>
            <button className="action-secondary" onClick={() => copyLink(book)}><Copy size={14} /> Copia link cliente</button>
            {book.approved && !book.locked && (
              <button className="action-secondary" onClick={() => { updateBook(book.id, { approved: false }); notify('Approvazione annullata'); }} data-testid={`button-reset-approval-${book.id}`}>
                <ClipboardCheck size={14} /> Annulla approvazione
              </button>
            )}
            {book.locked ? (
              <button className="action-secondary" onClick={() => { updateBook(book.id, { locked: false, shipment: false }); notify('Album sbloccato · il cliente può riprendere le modifiche'); }} data-testid={`button-unlock-${book.id}`}><Unlock size={14} /> Sblocca</button>
            ) : (
              <button className="action-secondary" onClick={() => showModal('print', book)} data-testid={`button-lock-${book.id}`}><Lock size={14} /> Manda in stampa</button>
            )}
            <button className="action-icon" aria-label={`Elimina ${book.name}`} onClick={() => showModal('delete', book)} data-testid={`button-delete-photobook-${book.id}`}><X size={15} /></button>
          </div>
          {book.locked && book.shipment && (
            <div className="shipment-card">
              <div className="shipment-heading"><Truck size={16} /><strong>Spedizione laboratorio</strong><span className="shipment-status">In preparazione</span></div>
              <p className="shipment-alert"><span /> Spedizione pronta · email non ancora inviata.</p>
              <div className="shipment-details"><span>Laboratorio <b>AlbumLab</b></span><span>Pagine trasferite <b>{book.pageCount}/{book.pageCount}</b></span><span>Scadenza <b>30 giu 2026 · 30 gg</b></span></div>
              <button className="shipment-send" onClick={() => notify('Email al laboratorio inviata')}><Send size={13} /> Invia email al laboratorio</button>
            </div>
          )}
          {book.locked && !book.shipment && (
            <div className="shipment-card shipment-empty">
              <p>Modifiche bloccate. Nessuna spedizione preparata e nessuna email inviata.</p>
              <button className="action-secondary" onClick={() => { updateBook(book.id, { shipment: true }); notify('Spedizione laboratorio preparata'); }}>Prepara spedizione laboratorio</button>
            </div>
          )}
        </div>
      </article>
    );
  };

  const BookSection = ({ title, subtitle, items, id }: { title: string; subtitle: string; items: Book[]; id: string }) => (
    <section className="book-section" data-testid={id}>
      <div className="section-heading">
        <div><h2>{title}</h2><p>{subtitle}</p></div>
        <span className="section-count">{items.length.toString().padStart(2, '0')}</span>
      </div>
      {items.length ? <div className="book-list">{items.map((book) => <BookRow key={book.id} book={book} />)}</div> : (
        <div className="filtered-empty"><BookOpen size={18} /> Nessun fotolibro corrisponde ai filtri.</div>
      )}
    </section>
  );

  return (
    <div className="proposal-shell">
      <aside className={`proposal-sidebar${mobileMenuOpen ? ' mobile-nav-open' : ''}`}>
        <div className="studio-brand">
          <div className="brand-mark"><Album size={19} /></div>
          <div><strong>Image Studio</strong><span>PANNELLO AMMINISTRATIVO</span></div>
          <button className="mobile-nav-toggle" onClick={() => setMobileMenuOpen((open) => !open)} aria-expanded={mobileMenuOpen} aria-label={mobileMenuOpen ? 'Chiudi menu' : 'Apri menu'}>
            {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
        <div className="sidebar-label">NAVIGAZIONE</div>
        <nav className="studio-nav" aria-label="Navigazione amministrativa">
          {adminNavSections.map((section) => {
            const Icon = section.icon;
            const isExpanded = expandedNav === section.id;
            const isCurrent = section.id === 'gallerie';
            return (
              <div className="nav-section" key={section.id}>
                <button
                  className={`nav-section-button${isCurrent ? ' current-section' : ''}`}
                  onClick={() => handleNavSection(section)}
                  aria-expanded={section.items ? isExpanded : undefined}
                >
                  <Icon size={16} />
                  <span>{section.label}</span>
                  {section.items && (isExpanded ? <ChevronDown className="nav-chevron" size={13} /> : <ChevronRight className="nav-chevron" size={13} />)}
                </button>
                {section.items && isExpanded && (
                  <div className="nav-subitems">
                    {section.items.map((item) => (
                      <button
                        key={item}
                        className={`nav-subitem${item === 'Fotolibri' ? ' active' : ''}`}
                        onClick={() => handleNavItem(item)}
                        aria-current={item === 'Fotolibri' ? 'page' : undefined}
                      >
                        <span className="subitem-dot" />
                        <span>{item}</span>
                        {item === 'Modifiche Fotolibro' && pendingCount > 0 && <span className="nav-alert">{pendingCount}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card"><div className="help-icon"><CircleHelp size={16} /></div><strong>Serve una mano?</strong><span>Apri la guida rapida per il flusso album.</span><button onClick={() => showModal('tutorial')}>Vai alla guida <ArrowUpRight size={13} /></button></div>
          <button className="profile-button"><div className="profile-avatar">GM</div><span><strong>Gennaro Mazzacane</strong><small>Amministratore</small></span><Settings2 size={16} /></button>
        </div>
      </aside>

      <main className="proposal-main">
        <header className="proposal-topbar"><div className="breadcrumbs">Pannello amministrativo <ChevronRight size={13} /> Gallerie <ChevronRight size={13} /> <span>Fotolibri</span></div><div className="topbar-right"><span className="workspace-indicator"><i /> Tutto aggiornato</span><button className="topbar-avatar" aria-label="Profilo amministratore">GM</button></div></header>
        <div className="proposal-content">
          <div className="page-heading">
            <div><div className="eyebrow">PRODUZIONE · 06 ALBUM</div><h1>Fotolibri</h1><p>Una vista ordinata di revisioni, approvazioni e stampa.</p></div>
            <div className="heading-actions"><button className="tutorial-button" onClick={() => showModal('tutorial')}><CircleHelp size={15} /> Guida rapida</button><button className="create-button" onClick={() => showModal('create')} data-testid="button-create-photobook"><Plus size={16} /> Nuovo fotolibro</button></div>
          </div>

          <div className="overview-strip">
            <div className="overview-intro"><span className="overview-icon"><Album size={17} /></span><div><strong>Il lavoro, senza rumore.</strong><p>Priorità chiare per tenere ogni album in movimento.</p></div></div>
            <div className="overview-stat"><span>IN LAVORAZIONE</span><strong>{active.length.toString().padStart(2, '0')}</strong></div>
            <div className="overview-stat"><span>DA RIVEDERE</span><strong className={pendingCount ? 'stat-warm' : ''}>{pendingCount.toString().padStart(2, '0')}</strong></div>
            <div className="overview-stat"><span>APPROVATI</span><strong>{approvedCount.toString().padStart(2, '0')}</strong></div>
          </div>

          {pendingCount > 0 && (
            <button className="pending-banner" onClick={() => showModal('changes')} data-testid="banner-pending-changes">
              <span className="pending-banner-icon"><MessageSquareWarning size={17} /></span>
              <span className="pending-banner-copy"><strong>{pendingCount} richieste di modifica</strong><small>Clienti in attesa di una risposta — apri la coda revisioni.</small></span>
              <span className="pending-banner-link">Apri richieste <ArrowUpRight size={14} /></span>
            </button>
          )}

          <div className="list-toolbar">
            <div className="toolbar-title"><span>ALBUM ATTIVI</span><span className="toolbar-rule" /></div>
            <div className="toolbar-controls">
              <label className="search-box"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cerca un album o una coppia" aria-label="Cerca fotolibri" />{query && <button onClick={() => setQuery('')} aria-label="Cancella ricerca"><X size={13} /></button>}</label>
              <label className="filter-box"><Filter size={14} /><select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} aria-label="Filtra fotolibri"><option value="all">Tutti gli stati</option><option value="attention">Richiedono attenzione</option><option value="approved">Approvati</option></select><ChevronDown size={13} /></label>
            </div>
          </div>

          <div className="active-sections">
            <BookSection title="Collegati a un lavoro" subtitle="Album associati a una galleria o a un incarico dello studio." items={visibleBooks(linked)} id="section-linked-photobooks" />
            <BookSection title="Autonomi" subtitle="Album indipendenti, con pagine caricate direttamente nell’editor." items={visibleBooks(standalone)} id="section-standalone-photobooks" />
          </div>

          <section className="print-queue" data-testid="section-archived-photobooks">
            <button className="queue-toggle" onClick={() => setQueueOpen((open) => !open)} aria-expanded={queueOpen} data-testid="button-toggle-archived">
              <span className="queue-icon"><Printer size={16} /></span>
              <span className="queue-title"><strong>Coda di stampa</strong><small>Album bloccati per la produzione</small></span>
              <span className="queue-count">{queue.length}</span>
              {queueOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
            {queueOpen && <div className="queue-content">
              <div className="queue-note"><ShieldCheck size={15} /><p>Il blocco impedisce nuove modifiche, ma non invia l’email al laboratorio. Verifica lo stato della spedizione prima di chiudere il lavoro.</p></div>
              {queue.length ? <div className="book-list">{queue.map((book) => <BookRow key={book.id} book={book} />)}</div> : <div className="queue-empty"><Printer size={21} /><span>Nessun album in stampa.</span><small>Gli album bloccati appariranno qui.</small></div>}
            </div>}
          </section>

          <footer className="proposal-footer"><span>Image Studio <i /> Gestione fotolibri</span><span>{waitingMockups} mockup in revisione <i /> Ultimo aggiornamento oggi, 10:42</span></footer>
        </div>
      </main>

      {toast && <div className="proposal-toast"><Check size={15} />{toast}</div>}
      {modal && <div className="proposal-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null); }}>
        <section className="proposal-modal" role="dialog" aria-modal="true" aria-labelledby="proposal-modal-title">
          <button className="modal-close" onClick={() => setModal(null)} aria-label="Chiudi"><X size={17} /></button>
          {modal === 'create' && <form onSubmit={createBook}>
            <div className="modal-kicker"><Plus size={14} /> NUOVO ALBUM</div><h2 id="proposal-modal-title">Crea un fotolibro</h2><p className="modal-lede">Scegli come iniziare. Potrai aggiungere le pagine e completare il mockup dall’editor.</p>
            <div className="type-choice"><button type="button" className={newType === 'linked' ? 'type-option active' : 'type-option'} onClick={() => setNewType('linked')}><span><BookOpen size={16} /></span><strong>Collegato</strong><small>Con un lavoro o una galleria</small></button><button type="button" className={newType === 'standalone' ? 'type-option active' : 'type-option'} onClick={() => setNewType('standalone')}><span><Album size={16} /></span><strong>Autonomo</strong><small>Senza lavoro associato</small></button></div>
            <label className="modal-field">Nome fotolibro<input autoFocus value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Es. Giulia e Marco" required /></label>
            {newType === 'linked' && <label className="modal-field">Galleria o lavoro<input value={newGallery} onChange={(event) => setNewGallery(event.target.value)} placeholder="Cerca o inserisci un nome" /></label>}
            <div className="modal-actions"><button type="button" className="modal-cancel" onClick={() => setModal(null)}>Annulla</button><button className="create-button" type="submit"><Plus size={15} /> Crea fotolibro</button></div>
          </form>}
          {modal === 'tutorial' && <><div className="modal-kicker"><Sparkles size={14} /> GUIDA RAPIDA</div><h2 id="proposal-modal-title">Dal layout alla stampa</h2><p className="modal-lede">Tre passaggi per accompagnare ogni album, senza perdere il filo.</p><div className="guide-steps"><div><span>01</span><p><strong>Prepara il mockup</strong><small>Assegna un modello e completa l’anteprima di copertina.</small></p></div><div><span>02</span><p><strong>Raccogli l’approvazione</strong><small>Condividi il link cliente e rispondi alle richieste di modifica.</small></p></div><div><span>03</span><p><strong>Chiudi e invia</strong><small>Blocca l’album, prepara i file e conferma l’invio al laboratorio.</small></p></div></div><div className="modal-actions"><button className="modal-cancel" onClick={() => setModal(null)}>Chiudi guida</button><button className="create-button" onClick={() => { setModal(null); notify('Guida completata'); }}>Ho capito <Check size={15} /></button></div></>}
          {modal === 'changes' && <><div className="modal-kicker warm-kicker"><MessageSquareWarning size={14} /> REVISIONI CLIENTE</div><h2 id="proposal-modal-title">{target ? target.name : 'Richieste in attesa'}</h2><p className="modal-lede">{target ? `${target.pending || 0} richieste di modifica da rivedere per la versione ${target.version}.` : `${pendingCount} richieste in attesa dai clienti.`} Apri l’album per verificare i commenti e preparare una nuova versione.</p><div className="change-preview"><span className="change-avatar">{target?.clientName.split(' ').map((part) => part[0]).slice(0, 2).join('') || 'CL'}</span><div><strong>{target?.clientName || 'Richieste clienti'}</strong><small>Ultima richiesta · ieri alle 16:24</small></div><span className="change-count">{target?.pending || pendingCount} da leggere</span></div><div className="modal-actions"><button className="modal-cancel" onClick={() => setModal(null)}>Più tardi</button><button className="create-button" onClick={() => { setModal(null); showModal('editor', target || undefined); }}>Apri revisioni <ArrowUpRight size={15} /></button></div></>}
          {modal === 'editor' && <><div className="modal-kicker"><Pencil size={14} /> EDITOR FOTOLIBRO</div><h2 id="proposal-modal-title">{target?.name || 'Fotolibro'}</h2><p className="modal-lede">Anteprima rapida dell’album. Le pagine e le revisioni si gestiscono nell’editor completo.</p><div className="editor-preview"><div className="editor-cover"><span>{target?.clientName.split(' ').map((part) => part[0]).slice(0, 2).join('') || 'SL'}</span><small>{target?.name}</small></div><div className="editor-details"><span>VERSIONE <b>v{target?.version}</b></span><span>PAGINE <b>{target?.pageCount}</b></span><span>MOCKUP <b>{target ? statusText[target.mockup] : 'Da preparare'}</b></span></div></div><div className="modal-actions"><button className="modal-cancel" onClick={() => setModal(null)}>Chiudi</button><button className="create-button" onClick={() => { setModal(null); notify('Apertura editor in anteprima'); }}>Continua nell’editor <ExternalLink size={14} /></button></div></>}
          {modal === 'delete' && <><div className="modal-kicker danger-kicker"><X size={14} /> ELIMINAZIONE</div><h2 id="proposal-modal-title">Eliminare questo fotolibro?</h2><p className="modal-lede"><strong>{target?.name}</strong> verrà rimosso dall’elenco. Questa azione non può essere annullata.</p><div className="modal-actions"><button className="modal-cancel" onClick={() => setModal(null)}>Mantieni album</button><button className="delete-confirm" onClick={confirmDelete}>Elimina fotolibro</button></div></>}
          {modal === 'print' && <><div className="modal-kicker"><Printer size={14} /> CODA DI STAMPA</div><h2 id="proposal-modal-title">Inviare in stampa?</h2><p className="modal-lede">Bloccherai le modifiche cliente per <strong>{target?.name}</strong>. La spedizione al laboratorio può essere preparata in seguito.</p><div className="print-check"><Lock size={16} /><span><strong>Album in sola lettura</strong><small>Il cliente non potrà più inviare nuove modifiche.</small></span></div><div className="modal-actions"><button className="modal-cancel" onClick={() => setModal(null)}>Annulla</button><button className="create-button" onClick={() => { if (target) updateBook(target.id, { locked: true, shipment: false }); setModal(null); notify('Album bloccato · aggiunto alla coda di stampa'); }}>Conferma e blocca <Lock size={14} /></button></div></>}
        </section>
      </div>}
    </div>
  );
}
