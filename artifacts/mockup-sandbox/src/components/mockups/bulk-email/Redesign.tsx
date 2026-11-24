import { useMemo, useState } from 'react';
import {
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  FileText,
  Mail,
  Search,
  Send,
  Settings2,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import './_group.css';

type Contact = {
  email: string;
  name: string;
  sourceId: string;
};

type AudienceSource = {
  id: string;
  kind: 'all' | 'job' | 'booking';
  label: string;
  detail: string;
  total: number;
  contacts: Contact[];
};

const audienceSources: AudienceSource[] = [
  {
    id: 'all',
    kind: 'all',
    label: 'Tutti i clienti',
    detail: 'Tutti i contatti presenti nel gestionale',
    total: 186,
    contacts: [
      { email: 'anna.rossi@example.it', name: 'Anna Rossi', sourceId: 'all' },
      { email: 'marco.bianchi@example.it', name: 'Marco Bianchi', sourceId: 'all' },
      { email: 'giulia.esposito@example.it', name: 'Giulia Esposito', sourceId: 'all' },
      { email: 'luca.ferrara@example.it', name: 'Luca Ferrara', sourceId: 'all' },
      { email: 'elena.romano@example.it', name: 'Elena Romano', sourceId: 'all' },
      { email: 'paolo.conti@example.it', name: 'Paolo Conti', sourceId: 'all' },
    ],
  },
  {
    id: 'job-weddings',
    kind: 'job',
    label: 'Matrimoni',
    detail: 'Clienti con un lavoro di matrimonio',
    total: 42,
    contacts: [
      { email: 'anna.rossi@example.it', name: 'Anna Rossi', sourceId: 'job-weddings' },
      { email: 'marco.bianchi@example.it', name: 'Marco Bianchi', sourceId: 'job-weddings' },
      { email: 'elena.romano@example.it', name: 'Elena Romano', sourceId: 'job-weddings' },
      { email: 'sara.de-luca@example.it', name: 'Sara De Luca', sourceId: 'job-weddings' },
    ],
  },
  {
    id: 'job-baptisms',
    kind: 'job',
    label: 'Battesimi',
    detail: 'Clienti con un lavoro di battesimo',
    total: 26,
    contacts: [
      { email: 'anna.rossi@example.it', name: 'Anna Rossi', sourceId: 'job-baptisms' },
      { email: 'paolo.conti@example.it', name: 'Paolo Conti', sourceId: 'job-baptisms' },
    ],
  },
  {
    id: 'campaign-christmas-2025',
    kind: 'booking',
    label: 'Natale 2025',
    detail: 'Conclusa il 6 gennaio 2026',
    total: 31,
    contacts: [
      { email: 'anna.rossi@example.it', name: 'Anna Rossi', sourceId: 'campaign-christmas-2025' },
      { email: 'giulia.esposito@example.it', name: 'Giulia Esposito', sourceId: 'campaign-christmas-2025' },
      { email: 'luca.ferrara@example.it', name: 'Luca Ferrara', sourceId: 'campaign-christmas-2025' },
    ],
  },
  {
    id: 'campaign-communions-2025',
    kind: 'booking',
    label: 'Comunioni 2025',
    detail: 'Conclusa il 30 giugno 2025',
    total: 18,
    contacts: [
      { email: 'marco.bianchi@example.it', name: 'Marco Bianchi', sourceId: 'campaign-communions-2025' },
      { email: 'sara.de-luca@example.it', name: 'Sara De Luca', sourceId: 'campaign-communions-2025' },
    ],
  },
];

const sourceName = new Map(audienceSources.map((source) => [source.id, source.label]));

export function Redesign() {
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([
    'job-weddings',
    'campaign-christmas-2025',
  ]);
  const [search, setSearch] = useState('');
  const [selectedEmails, setSelectedEmails] = useState<Set<string> | null>(null);
  const [subject, setSubject] = useState('Le novità di Image Studio');
  const [activeTab, setActiveTab] = useState<'compose' | 'history'>('compose');
  const [showCampaigns, setShowCampaigns] = useState(true);

  const { uniqueContacts, totalBeforeDedup, duplicateCount } = useMemo(() => {
    const raw = audienceSources
      .filter((source) => selectedSourceIds.includes(source.id))
      .flatMap((source) => source.contacts.map((contact) => ({
        ...contact,
        email: contact.email.trim().toLowerCase(),
      })));

    const byEmail = new Map<string, Contact & { sourceIds: string[] }>();
    raw.forEach((contact) => {
      const existing = byEmail.get(contact.email);
      if (existing) {
        if (!existing.sourceIds.includes(contact.sourceId)) existing.sourceIds.push(contact.sourceId);
      } else {
        byEmail.set(contact.email, { ...contact, sourceIds: [contact.sourceId] });
      }
    });

    return {
      uniqueContacts: [...byEmail.values()],
      totalBeforeDedup: raw.length,
      duplicateCount: raw.length - byEmail.size,
    };
  }, [selectedSourceIds]);

  const searchedContacts = uniqueContacts.filter((contact) =>
    `${contact.name} ${contact.email}`.toLowerCase().includes(search.toLowerCase()),
  );
  const checkedEmails = selectedEmails ?? new Set(uniqueContacts.map((contact) => contact.email));
  const checkedVisible = searchedContacts.filter((contact) => checkedEmails.has(contact.email)).length;
  const selectedCount = checkedEmails.size;

  const toggleSource = (id: string) => {
    setSelectedSourceIds((current) => current.includes(id)
      ? current.filter((item) => item !== id)
      : [...current, id]);
    setSelectedEmails(null);
  };

  const toggleContact = (email: string) => {
    const next = new Set(checkedEmails);
    if (next.has(email)) next.delete(email);
    else next.add(email);
    setSelectedEmails(next);
  };

  const toggleVisibleContacts = () => {
    const next = new Set(checkedEmails);
    const allVisibleChecked = searchedContacts.every((contact) => next.has(contact.email));
    searchedContacts.forEach((contact) => {
      if (allVisibleChecked) next.delete(contact.email);
      else next.add(contact.email);
    });
    setSelectedEmails(next);
  };

  const jobs = audienceSources.filter((source) => source.kind === 'job');
  const campaigns = audienceSources.filter((source) => source.kind === 'booking');

  return (
    <main className="min-h-screen bg-[#f5f6f2] text-[#293e3a]">
      <div className="mx-auto max-w-[1440px] px-5 pb-28 pt-8 sm:px-8">
        <header className="mb-7 flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#657e75]">
              <Mail className="h-4 w-4" />
              Comunicazione clienti
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-[#263d38] sm:text-4xl">
              Invio email
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#687a73]">
              Prepara un messaggio e scegli chi riceverà la comunicazione.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-[#d5e0d9] bg-white px-3.5 py-2 text-sm text-[#456a5c] shadow-sm">
            <BadgeCheck className="h-4 w-4" />
            Resend collegato
          </div>
        </header>

        <div className="mb-6 flex gap-1 border-b border-[#dfe5df]">
          <button
            type="button"
            onClick={() => setActiveTab('compose')}
            className={`border-b-2 px-4 py-3 text-sm font-semibold transition ${activeTab === 'compose' ? 'border-[#4e786b] text-[#315e51]' : 'border-transparent text-[#7a8982] hover:text-[#3c5b50]'}`}
          >
            Nuovo invio
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition ${activeTab === 'history' ? 'border-[#4e786b] text-[#315e51]' : 'border-transparent text-[#7a8982] hover:text-[#3c5b50]'}`}
          >
            <Clock3 className="h-4 w-4" />
            Storico invii
            <span className="rounded-full bg-[#eef2ee] px-2 py-0.5 text-[11px] text-[#63766d]">10</span>
          </button>
        </div>

        {activeTab === 'history' ? (
          <section className="rounded-2xl border border-[#e0e6e0] bg-white p-8 shadow-sm">
            <div className="mb-6 flex items-center gap-3">
              <div className="rounded-xl bg-[#eef3ef] p-3 text-[#4b7465]"><Clock3 className="h-5 w-5" /></div>
              <div>
                <h2 className="text-xl font-semibold">Invii recenti</h2>
                <p className="text-sm text-[#738078]">Stato e risultati delle comunicazioni affidate a Resend.</p>
              </div>
            </div>
            <div className="rounded-xl border border-dashed border-[#d4ded6] p-8 text-center text-sm text-[#728079]">
              La cronologia reale resterà invariata quando questa schermata verrà integrata.
            </div>
          </section>
        ) : (
          <>
            <div className="mb-5 grid grid-cols-3 gap-2 sm:max-w-[590px]">
              {[
                { number: '01', label: 'Messaggio', active: true },
                { number: '02', label: 'Destinatari', active: selectedSourceIds.length > 0 },
                { number: '03', label: 'Revisione', active: false },
              ].map((step) => (
                <div key={step.number} className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 ${step.active ? 'border-[#c8d9cf] bg-[#edf4ef]' : 'border-[#e3e8e3] bg-white/70'}`}>
                  <span className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${step.active ? 'bg-[#527a6c] text-white' : 'bg-[#edf0ec] text-[#89958e]'}`}>{step.number}</span>
                  <span className={`text-sm font-semibold ${step.active ? 'text-[#375f52]' : 'text-[#8a958e]'}`}>{step.label}</span>
                </div>
              ))}
            </div>

            <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(390px,0.82fr)]">
              <section className="overflow-hidden rounded-2xl border border-[#e0e6e0] bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf0ec] px-5 py-4 sm:px-7">
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#eff4f0] text-[#4d7668]"><Mail className="h-5 w-5" /></div>
                    <div>
                      <h2 className="font-semibold text-[#2f4941]">Il tuo messaggio</h2>
                      <p className="text-xs text-[#7a8982]">Personalizza oggetto e contenuto prima dell'invio.</p>
                    </div>
                  </div>
                  <button type="button" className="flex items-center gap-2 rounded-lg border border-[#dce4de] px-3 py-2 text-xs font-semibold text-[#50675e] hover:bg-[#f5f8f5]">
                    <FileText className="h-4 w-4" /> Carica template <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="space-y-5 px-5 py-6 sm:px-7">
                  <div>
                    <label htmlFor="redesign-from" className="mb-2 block text-xs font-bold uppercase tracking-wide text-[#6b7d74]">Mittente</label>
                    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#dce4de] bg-[#fbfcfa] px-3.5 py-3">
                      <span className="rounded-md bg-[#e7f0ea] px-2 py-1 text-xs font-semibold text-[#456a59]">Image Studio</span>
                      <input id="redesign-from" aria-label="Indirizzo mittente" className="min-w-[220px] flex-1 bg-transparent text-sm text-[#344c43] outline-none" defaultValue="newsletter@imagestudiofotografico.com" />
                      <BadgeCheck className="h-4 w-4 text-[#54826c]" />
                    </div>
                    <p className="mt-1.5 text-xs text-[#85918b]">Dominio verificato; le risposte arrivano allo studio.</p>
                  </div>

                  <div>
                    <label htmlFor="redesign-subject" className="mb-2 block text-xs font-bold uppercase tracking-wide text-[#6b7d74]">Oggetto</label>
                    <input
                      id="redesign-subject"
                      value={subject}
                      onChange={(event) => setSubject(event.target.value)}
                      className="w-full rounded-xl border border-[#dce4de] bg-white px-3.5 py-3 text-sm font-medium text-[#344c43] outline-none transition focus:border-[#7ea18f] focus:ring-2 focus:ring-[#e1ece5]"
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      {['{nome}', '{cognome}', '{nome_completo}'].map((token) => (
                        <button key={token} type="button" onClick={() => setSubject((value) => `${value} ${token}`)} className="rounded-md bg-[#f0f4f0] px-2 py-1 text-[11px] font-semibold text-[#57756a] hover:bg-[#e4eee7]">
                          {token}
                        </button>
                      ))}
                      <span className="self-center text-[11px] text-[#8a958f]">campi personalizzati</span>
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <label htmlFor="redesign-body" className="text-xs font-bold uppercase tracking-wide text-[#6b7d74]">Contenuto</label>
                      <div className="inline-flex rounded-lg border border-[#dce4de] bg-[#f8faf8] p-1 text-xs">
                        <button type="button" className="rounded-md bg-white px-3 py-1.5 font-semibold text-[#476c5e] shadow-sm">Editor</button>
                        <button type="button" className="rounded-md px-3 py-1.5 text-[#829089]">HTML</button>
                      </div>
                    </div>
                    <textarea
                      id="redesign-body"
                      rows={11}
                      defaultValue={`Ciao {nome},

abbiamo preparato alcune novità fotografiche per te.

Scopri le nuove proposte di Image Studio.

A presto,
Gennaro`}
                      className="w-full resize-y rounded-xl border border-[#dce4de] bg-[#fbfcfa] px-4 py-3 font-mono text-sm leading-6 text-[#41564d] outline-none focus:border-[#7ea18f] focus:ring-2 focus:ring-[#e1ece5]"
                    />
                    <div className="mt-2 flex items-center justify-between text-xs text-[#89958e]">
                      <span>Puoi usare testo e contenuti HTML.</span>
                      <button type="button" className="font-semibold text-[#4d7566] hover:underline">Anteprima email</button>
                    </div>
                  </div>
                </div>
              </section>

              <section className="overflow-hidden rounded-2xl border border-[#d9e4dc] bg-white shadow-sm">
                <div className="border-b border-[#edf0ec] bg-[#f8faf8] px-5 py-4 sm:px-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#e8f1eb] text-[#4e7768]"><Users className="h-5 w-5" /></div>
                      <div>
                        <h2 className="font-semibold text-[#2f4941]">Scegli i destinatari</h2>
                        <p className="text-xs text-[#7a8982]">Puoi sommare più gruppi alla stessa email.</p>
                      </div>
                    </div>
                    <span className="rounded-full bg-[#e7f2ea] px-3 py-1 text-xs font-bold text-[#3d7059]">{selectedCount} unici</span>
                  </div>
                </div>

                <div className="space-y-5 px-5 py-5 sm:px-6">
                  <div className="flex items-center gap-2 rounded-xl border border-[#e1e9e3] bg-[#fbfcfa] px-3.5 py-3">
                    <Search className="h-4 w-4 shrink-0 text-[#85958c]" />
                    <input
                      aria-label="Cerca destinatari"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Cerca nome o email"
                      className="w-full bg-transparent text-sm outline-none placeholder:text-[#9aa59f]"
                    />
                    {search && <button type="button" aria-label="Cancella ricerca" onClick={() => setSearch('')}><X className="h-4 w-4 text-[#87958d]" /></button>}
                  </div>

                  <div className="space-y-4">
                    <div>
                      <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[#859188]">Rubrica e lavori</p>
                      <button
                        type="button"
                        aria-pressed={selectedSourceIds.includes('all')}
                        onClick={() => toggleSource('all')}
                        className={`flex w-full items-center justify-between rounded-xl border px-3.5 py-3 text-left transition ${selectedSourceIds.includes('all') ? 'border-[#8eaf9e] bg-[#eff6f0]' : 'border-[#e4e9e4] hover:border-[#b9c9be] hover:bg-[#fafcf9]'}`}
                      >
                        <span className="flex items-center gap-3">
                          <span className={`grid h-5 w-5 place-items-center rounded-md border ${selectedSourceIds.includes('all') ? 'border-[#54806c] bg-[#54806c] text-white' : 'border-[#cbd5cd] bg-white'}`}>{selectedSourceIds.includes('all') && <Check className="h-3.5 w-3.5" />}</span>
                          <span><span className="block text-sm font-semibold text-[#3c5248]">Tutti i clienti</span><span className="text-xs text-[#839087]">Tutta la rubrica del gestionale</span></span>
                        </span>
                        <span className="text-xs font-semibold text-[#6c8075]">186</span>
                      </button>

                      <div className="mt-2 grid grid-cols-2 gap-2">
                        {jobs.map((source) => {
                          const checked = selectedSourceIds.includes(source.id);
                          return (
                            <button key={source.id} type="button" aria-pressed={checked} onClick={() => toggleSource(source.id)} className={`flex min-h-[62px] items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left transition ${checked ? 'border-[#8eaf9e] bg-[#eff6f0]' : 'border-[#e4e9e4] hover:border-[#b9c9be]'}`}>
                              <span className="flex min-w-0 items-center gap-2.5">
                                <span className={`grid h-4.5 w-4.5 shrink-0 place-items-center rounded border ${checked ? 'border-[#54806c] bg-[#54806c] text-white' : 'border-[#cbd5cd] bg-white'}`}>{checked && <Check className="h-3 w-3" />}</span>
                                <span className="truncate text-xs font-semibold text-[#43574e]">{source.label}</span>
                              </span>
                              <span className="text-[11px] text-[#819087]">{source.total}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <button type="button" onClick={() => setShowCampaigns((value) => !value)} className="mb-2 flex w-full items-center justify-between text-left">
                        <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[#71847a]">
                          <CalendarClock className="h-4 w-4 text-[#648477]" />
                          Campagne di prenotazione concluse
                        </span>
                        <ChevronDown className={`h-4 w-4 text-[#849188] transition ${showCampaigns ? 'rotate-180' : ''}`} />
                      </button>
                      {showCampaigns && (
                        <div className="space-y-2">
                          {campaigns.map((source) => {
                            const checked = selectedSourceIds.includes(source.id);
                            return (
                              <button key={source.id} type="button" aria-pressed={checked} onClick={() => toggleSource(source.id)} className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-3 text-left transition ${checked ? 'border-[#8eaf9e] bg-[#eff6f0]' : 'border-[#e4e9e4] hover:border-[#b9c9be]'}`}>
                                <span className="flex min-w-0 items-center gap-3">
                                  <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border ${checked ? 'border-[#54806c] bg-[#54806c] text-white' : 'border-[#cbd5cd] bg-white'}`}>{checked && <Check className="h-3.5 w-3.5" />}</span>
                                  <span className="min-w-0">
                                    <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#3c5248]">
                                      {source.label}
                                      <span className="rounded-full bg-[#edf1ec] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#718179]">Conclusa</span>
                                    </span>
                                    <span className="mt-0.5 flex items-center gap-1 text-xs text-[#859188]"><Clock3 className="h-3 w-3" />{source.detail}</span>
                                  </span>
                                </span>
                                <span className="shrink-0 text-xs font-semibold text-[#6c8075]">{source.total}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-[#dce8df] bg-[#f3f8f4] p-3.5">
                    <div className="flex items-start gap-2.5">
                      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[#56806b]" />
                      <div>
                        <p className="text-sm font-semibold text-[#426253]">
                          {duplicateCount > 0
                            ? `${duplicateCount} ${duplicateCount === 1 ? 'contatto duplicato rimosso' : 'contatti duplicati rimossi'}`
                            : 'Indirizzi unici'}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-[#71847a]">
                          {duplicateCount > 0
                            ? `${totalBeforeDedup} presenze nei gruppi diventano ${uniqueContacts.length} indirizzi distinti. Ogni email riceve un solo invio.`
                            : 'Selezionando più gruppi, ogni indirizzo email viene conteggiato una sola volta.'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold text-[#65776e]">Contatti inclusi</p>
                      <button type="button" onClick={toggleVisibleContacts} className="text-xs font-semibold text-[#4c7565] hover:underline">
                        {checkedVisible === searchedContacts.length ? 'Deseleziona visibili' : 'Seleziona visibili'}
                      </button>
                    </div>
                    <div className="max-h-[198px] divide-y divide-[#edf0ec] overflow-y-auto rounded-xl border border-[#e4e9e4]">
                      {searchedContacts.slice(0, 6).map((contact) => (
                        <label key={contact.email} className="flex cursor-pointer items-center gap-3 px-3.5 py-2.5 hover:bg-[#fafcf9]">
                          <input type="checkbox" checked={checkedEmails.has(contact.email)} onChange={() => toggleContact(contact.email)} className="h-4 w-4 rounded border-[#c9d4cc] accent-[#4f7869]" />
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#eaf0e9] text-[11px] font-bold text-[#557565]">{contact.name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-semibold text-[#43564d]">{contact.name}</span>
                            <span className="block truncate text-[11px] text-[#87938c]">{contact.email}</span>
                          </span>
                          <span className="hidden max-w-[100px] truncate text-[10px] text-[#89968e] sm:block">
                            {contact.sourceIds.map((id) => sourceName.get(id)).join(' · ')}
                          </span>
                        </label>
                      ))}
                      {searchedContacts.length === 0 && <p className="px-4 py-8 text-center text-sm text-[#859188]">Nessun contatto corrisponde alla ricerca.</p>}
                    </div>
                    {searchedContacts.length > 6 && <p className="mt-2 text-center text-[11px] text-[#859188]">Mostrati 6 di {searchedContacts.length} contatti</p>}
                  </div>
                </div>
              </section>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#dce5dd] bg-white px-5 py-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#eef4ef] text-[#547b6c]"><Settings2 className="h-5 w-5" /></div>
                <div>
                  <p className="text-sm font-semibold text-[#344c42]">Invio pronto per la revisione</p>
                  <p className="text-xs text-[#78877f]">{selectedCount} destinatari selezionati · {selectedSourceIds.length} gruppi sommati</p>
                </div>
              </div>
              <button type="button" disabled={selectedCount === 0 || !subject.trim()} className="inline-flex items-center gap-2 rounded-xl bg-[#426f5e] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#355c4e] disabled:cursor-not-allowed disabled:opacity-50">
                Continua alla revisione <ArrowRight className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-[#7d8c83]">
              <CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-[#789184]" />
              Le campagne mostrate sono concluse e includono prenotazioni non annullate. Se un cliente compare in più gruppi, riceve un solo messaggio.
            </p>
          </>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 border-t border-[#e0e6e0] bg-white/95 px-5 py-3 backdrop-blur sm:hidden">
        <button type="button" disabled={selectedCount === 0} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#426f5e] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">
          <Send className="h-4 w-4" /> Rivedi {selectedCount} destinatari <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </main>
  );
}
