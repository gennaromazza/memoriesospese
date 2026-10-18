import "./_group.css";
import { useMemo, useState } from "react";
import {
  ArrowDownUp,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  MapPin,
  MoreHorizontal,
  Search,
  SlidersHorizontal,
  Users,
  Wallet,
} from "lucide-react";

type Job = {
  title: string;
  client: string;
  place: string;
  date?: string;
  day?: string;
  month?: string;
  time?: string;
  kind: string;
  status: string;
  people: string;
  payment: string;
  created?: string;
  quote?: string;
};

const leads: Job[] = [
  {
    title: "Matrimonio — Sofia & Lorenzo",
    client: "Sofia Rinaldi e Lorenzo Greco",
    place: "Tenuta San Bartolomeo · Caserta",
    kind: "Matrimonio",
    status: "Da ricontattare",
    people: "—",
    payment: "—",
    created: "Richiesta ricevuta il 16 ott 2026",
    quote: "Preventivo da preparare",
  },
  {
    title: "Battesimo di Tommaso",
    client: "Francesca De Luca",
    place: "Luogo da definire",
    kind: "Battesimo",
    status: "Preventivo inviato",
    people: "—",
    payment: "—",
    created: "Richiesta ricevuta il 14 ott 2026",
    quote: "In attesa di risposta",
  },
  {
    title: "Matrimonio — Alessia & Paolo",
    client: "Alessia Vitale e Paolo Neri",
    place: "Data e location da definire",
    kind: "Matrimonio",
    status: "Nuovo contatto",
    people: "—",
    payment: "—",
    created: "Richiesta ricevuta il 12 ott 2026",
    quote: "Nessun preventivo",
  },
];

const signed: Job[] = [
  {
    title: "Battesimo di Bianca",
    client: "Giulia e Matteo Ferri",
    place: "Villa Maria · Aversa",
    day: "18",
    month: "OTT",
    date: "Domenica 18 ottobre 2026",
    time: "12:00",
    kind: "Battesimo",
    status: "Firmato",
    people: "2 assegnati",
    payment: "Saldo € 420",
  },
  {
    title: "Matrimonio — Martina & Andrea",
    client: "Martina De Rosa e Andrea Russo",
    place: "Tenuta La Quercia · Caserta",
    day: "24",
    month: "OTT",
    date: "Sabato 24 ottobre 2026",
    time: "14:30",
    kind: "Matrimonio",
    status: "Firmato",
    people: "3 assegnati",
    payment: "Acconto ricevuto",
  },
  {
    title: "Matrimonio — Chiara & Davide",
    client: "Chiara Marino e Davide Esposito",
    place: "Castello di Limatola · Benevento",
    day: "07",
    month: "NOV",
    date: "Sabato 7 novembre 2026",
    time: "15:00",
    kind: "Matrimonio",
    status: "Confermato",
    people: "2 assegnati",
    payment: "Acconto € 600",
  },
  {
    title: "Matrimonio — Elisa & Tommaso",
    client: "Elisa Ricci e Tommaso Bianchi",
    place: "Palazzo Caracciolo · Napoli",
    day: "21",
    month: "NOV",
    date: "Sabato 21 novembre 2026",
    time: "15:30",
    kind: "Matrimonio",
    status: "Firmato",
    people: "4 assegnati",
    payment: "Acconto ricevuto",
  },
];

const past: Job[] = [
  {
    title: "Matrimonio — Chiara & Marco",
    client: "Chiara Lombardi e Marco Ferraro",
    place: "Aversa",
    day: "20",
    month: "DIC",
    date: "Sabato 20 dicembre 2025",
    time: "11:00",
    kind: "Matrimonio",
    status: "Consegnato",
    people: "3 assegnati",
    payment: "Saldato",
  },
  {
    title: "Matrimonio — Elisa & Andrea",
    client: "Elisa Romano e Andrea De Santis",
    place: "Caserta",
    day: "22",
    month: "FEB",
    date: "Domenica 22 febbraio 2026",
    time: "10:30",
    kind: "Matrimonio",
    status: "Consegnato",
    people: "2 assegnati",
    payment: "Saldato",
  },
];

const selectClass =
  "flex h-10 min-w-0 items-center justify-between gap-2 rounded-lg border border-[#d9ded4] bg-[#fffefa] px-3 text-[13px] font-medium text-[#50666a] shadow-[0_1px_2px_rgba(44,63,59,.04)] outline-none focus:border-[#829b89]";

function JobRow({ job, lead = false }: { job: Job; lead?: boolean }) {
  return (
    <article className="group grid grid-cols-1 gap-3 border-t border-[#e9e9df] px-4 py-4 transition-colors hover:bg-[#fbfcf8] sm:grid-cols-[minmax(0,1fr)_150px_118px] sm:items-center sm:px-5">
      <div className="flex min-w-0 items-start gap-3">
        <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${lead ? "bg-[#f4eee1] text-[#9a8056]" : "bg-[#eaf1e9] text-[#67846d]"}`}>
          {lead ? <FileText className="h-[17px] w-[17px]" /> : <CalendarDays className="h-[17px] w-[17px]" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="truncate text-[14px] font-semibold tracking-[-0.015em] text-[#354f54]">{job.title}</h3>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-[.02em] ${lead ? "bg-[#f5efe3] text-[#8b7148]" : "bg-[#edf4ed] text-[#587b61]"}`}>{job.status}</span>
          </div>
          <p className="mt-1 truncate text-[12px] text-[#6f807d]">{job.client}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#81908a]">
            <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{job.place}</span>
            {lead ? (
              <span className="inline-flex items-center gap-1 text-[#9a8056]"><Clock3 className="h-3 w-3" />{job.created}</span>
            ) : (
              <>
                <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{job.people}</span>
                <span className="inline-flex items-center gap-1"><Wallet className="h-3 w-3" />{job.payment}</span>
              </>
            )}
          </div>
        </div>
      </div>
      {lead ? (
        <div className="pl-[52px] text-[12px] text-[#78857e] sm:pl-0 sm:text-right">
          <span className="block font-medium text-[#61746e]">{job.quote}</span>
          <span className="mt-1 block text-[11px]">{job.kind}</span>
        </div>
      ) : (
        <div className="flex items-center gap-3 pl-[52px] sm:justify-end sm:pl-0">
          <div className="text-right">
            <div className="font-['DM_Sans'] text-[11px] font-semibold text-[#687c76]">{job.date}</div>
            <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-[#89958e]"><Clock3 className="h-3 w-3" />{job.time}</div>
          </div>
        </div>
      )}
      <div className="hidden items-center justify-end gap-2 sm:flex">
        {lead && <span className="rounded-md border border-[#e8e5da] px-2 py-1 text-[10px] font-medium text-[#74827d]">{job.kind}</span>}
        <button aria-label={`Altre azioni per ${job.title}`} className="rounded-lg p-2 text-[#82918b] opacity-0 transition-opacity hover:bg-[#f0f3ee] group-hover:opacity-100 focus:opacity-100"><MoreHorizontal className="h-4 w-4" /></button>
      </div>
    </article>
  );
}

export function Proposal() {
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState("Prossimi impegni");
  const [showRange, setShowRange] = useState(false);
  const [selectedTab, setSelectedTab] = useState("Tutti");
  const searchable = (job: Job) => `${job.title} ${job.client} ${job.place} ${job.kind}`.toLowerCase().includes(query.toLowerCase());
  const visibleLeads = useMemo(() => leads.filter(searchable), [query]);
  const visibleSigned = useMemo(() => signed.filter(searchable), [query]);
  const visiblePast = useMemo(() => past.filter(searchable), [query]);
  const showPast = period === "Tutti i periodi";

  return (
    <main className="min-h-screen bg-[#f4f5ef] px-4 py-5 text-[#405b60] [font-family:'DM_Sans',sans-serif] sm:px-7 sm:py-7">
      <div className="mx-auto max-w-[1180px]">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.19em] text-[#82948b]">
              <span className="h-px w-6 bg-[#a8b7a5]" /> Image Studio <span className="text-[#b4b9ae]">/</span> Lavori
            </div>
            <h1 className="font-['Playfair_Display'] text-[32px] leading-none tracking-[-.025em] text-[#355258] sm:text-[38px]">Lavori e appuntamenti</h1>
            <p className="mt-2 text-[13px] text-[#778780]">Prima le richieste da seguire, poi gli eventi in agenda.</p>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-[#e0e4db] bg-[#fbfcf8] px-3 py-2 text-[11px] text-[#72817b]">
            <span className="h-2 w-2 rounded-full bg-[#8aab8b]" />
            <span>Agenda aggiornata</span>
            <span className="mx-1 h-4 w-px bg-[#e4e7de]" />
            <span className="font-medium text-[#516a67]">18 ott 2026</span>
          </div>
        </header>

        <section className="rounded-2xl border border-[#e0e3d9] bg-[#fbfcf8] p-3 shadow-[0_7px_22px_rgba(45,65,57,.035)] sm:p-4">
          <div className="grid gap-2.5 lg:grid-cols-[minmax(235px,1.55fr)_repeat(2,minmax(150px,1fr))]">
            <label className="relative block">
              <Search className="absolute left-3.5 top-3 h-4 w-4 text-[#92a199]" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} className="h-10 w-full rounded-lg border border-[#d9ded4] bg-[#fffefa] pl-10 pr-3 text-[13px] text-[#405b60] outline-none placeholder:text-[#9aa69f] focus:border-[#829b89]" placeholder="Cerca evento, cliente o location…" />
            </label>
            <label className={selectClass}>
              <span className="sr-only">Periodo</span>
              <select value={period} onChange={(event) => setPeriod(event.target.value)} className="w-full appearance-none bg-transparent outline-none">
                <option>Prossimi impegni</option><option>Impegni passati</option><option>Tutti i periodi</option>
              </select><ChevronDown className="h-4 w-4 shrink-0" />
            </label>
            <label className={selectClass}>
              <span className="sr-only">Stato preventivo</span>
              <select className="w-full appearance-none bg-transparent outline-none" defaultValue="Tutti i preventivi">
                <option>Tutti i preventivi</option><option>Firmato / confermato</option><option>Non firmato</option><option>Da inviare / senza preventivo</option>
              </select><ChevronDown className="h-4 w-4 shrink-0" />
            </label>
          </div>
          <div className="mt-2.5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-[repeat(4,minmax(0,1fr))_minmax(155px,1.1fr)]">
            {["Tutti i collaboratori", "Tutti gli anni", "Tutti i mesi", "Tutti i semestri"].map((filter) => (
              <button key={filter} className={selectClass}><span className="truncate">{filter}</span><ChevronDown className="h-4 w-4 shrink-0" /></button>
            ))}
            <button onClick={() => setShowRange((value) => !value)} className={`${selectClass} col-span-2 justify-center gap-2 sm:col-span-1`}><CalendarDays className="h-4 w-4" /> Intervallo date <ChevronDown className="h-4 w-4" /></button>
          </div>
          {showRange && (
            <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-lg bg-[#f1f4ed] p-3 text-xs text-[#70817a]">
              <span className="font-semibold text-[#536b67]">Intervallo personalizzato</span>
              <input aria-label="Data iniziale" type="date" className="rounded-md border border-[#d9ded4] bg-[#fffefa] px-2 py-1.5" />
              <span>al</span>
              <input aria-label="Data finale" type="date" className="rounded-md border border-[#d9ded4] bg-[#fffefa] px-2 py-1.5" />
              <button onClick={() => setShowRange(false)} className="ml-auto rounded-md bg-[#667f73] px-3 py-1.5 font-semibold text-white">Applica</button>
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#ebede5] pt-3">
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#82918a]">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>Filtri attivi</span>
              <span className="rounded-full bg-[#eef3eb] px-2.5 py-1 font-semibold text-[#61786c]">Tutti i tipi <Check className="ml-1 inline h-3 w-3" /></span>
              <span className="hidden sm:inline">3 richieste senza data restano nella coda lead</span>
            </div>
            <button className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#71857b]"><ArrowDownUp className="h-3.5 w-3.5" /> Ordine per data evento</button>
          </div>
        </section>

        <div className="mt-5 flex items-center gap-1 border-b border-[#dfe4da]">
          {["Tutti", "Matrimoni", "Battesimi", "Altri eventi"].map((tab) => (
            <button key={tab} onClick={() => setSelectedTab(tab)} className={`relative px-3 py-2.5 text-[12px] font-semibold transition-colors ${selectedTab === tab ? "text-[#426258]" : "text-[#8a9890] hover:text-[#536e65]"}`}>
              {tab}{tab === "Tutti" && <span className="ml-1.5 text-[10px] text-[#94a199]">7</span>}
              {selectedTab === tab && <span className="absolute inset-x-3 bottom-[-1px] h-[2px] rounded-full bg-[#789681]" />}
            </button>
          ))}
          <div className="ml-auto hidden items-center gap-1 pb-1 text-[11px] text-[#8a9790] sm:flex"><span className="mr-1">Vista</span><button aria-label="Pagina precedente" className="rounded-md border border-[#dfe4da] p-1 hover:bg-white"><ChevronLeft className="h-3.5 w-3.5" /></button><span className="px-1 font-medium text-[#587069]">1 / 12</span><button aria-label="Pagina successiva" className="rounded-md border border-[#dfe4da] p-1 hover:bg-white"><ChevronRight className="h-3.5 w-3.5" /></button></div>
        </div>

        <section className="mt-4 overflow-hidden rounded-2xl border border-[#e0e3d9] bg-[#fffefa] shadow-[0_8px_25px_rgba(45,65,57,.035)]">
          <div className="flex flex-wrap items-center justify-between gap-2 bg-[#f8f8f2] px-4 py-3.5 sm:px-5">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f2eadb] text-[#92794f]"><FileText className="h-4 w-4" /></div>
              <div>
                <h2 className="text-[13px] font-bold tracking-[.015em] text-[#405a5c]">Richieste da seguire</h2>
                <p className="mt-0.5 text-[11px] text-[#849189]">Lead senza data evento confermata</p>
              </div>
              <span className="rounded-full bg-[#eee6d6] px-2 py-0.5 text-[10px] font-bold text-[#8a7249]">{visibleLeads.length}</span>
            </div>
            <span className="text-[11px] text-[#89958d]">Ordinate per ultima attività</span>
          </div>
          {visibleLeads.length ? visibleLeads.map((job) => <JobRow key={job.title} job={job} lead />) : <div className="px-5 py-8 text-center text-sm text-[#86938b]">Nessuna richiesta corrisponde alla ricerca.</div>}
        </section>

        <section className="mt-5 overflow-hidden rounded-2xl border border-[#dce4da] bg-[#fffefa] shadow-[0_8px_25px_rgba(45,65,57,.035)]">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-[#edf3eb] px-4 py-3.5 sm:px-5">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#dce8dc] text-[#5c7b63]"><CalendarDays className="h-4 w-4" /></div>
              <div>
                <h2 className="text-[13px] font-bold tracking-[.015em] text-[#405a5c]">Impegni confermati</h2>
                <p className="mt-0.5 text-[11px] text-[#788a7d]">{period === "Tutti i periodi" ? "Oggi e prossimi, poi archivio degli eventi passati" : period === "Impegni passati" ? "Eventi già svolti" : "Oggi per primo, poi in ordine cronologico"}</p>
              </div>
            </div>
            <span className="rounded-full border border-[#d8e3d7] bg-[#f8fbf5] px-2.5 py-1 text-[10px] font-semibold text-[#64816a]">{visibleSigned.length} in agenda</span>
          </div>
          {period !== "Impegni passati" && (
            <>
              <div className="flex items-center gap-3 border-t border-[#e4e9df] bg-[#fbfcf7] px-4 py-2.5 sm:px-5">
                <span className="rounded-full bg-[#6f8d76] px-2 py-1 text-[9px] font-bold uppercase tracking-[.12em] text-white">Oggi</span>
                <span className="text-[11px] font-medium text-[#708078]">Domenica · 18 ottobre</span>
                <span className="h-px flex-1 bg-[#e6eae1]" />
                <span className="text-[10px] text-[#8b978e]">1 evento</span>
              </div>
              {visibleSigned.slice(0, 1).map((job) => <JobRow key={job.title} job={job} />)}
              <div className="flex items-center gap-3 border-t border-[#e4e9df] bg-[#fbfcf7] px-4 py-2.5 sm:px-5">
                <span className="rounded-full bg-[#e7eee5] px-2 py-1 text-[9px] font-bold uppercase tracking-[.12em] text-[#69806d]">In arrivo</span>
                <span className="text-[11px] font-medium text-[#708078]">Prossimi eventi · ordine cronologico</span>
                <span className="h-px flex-1 bg-[#e6eae1]" />
                <span className="text-[10px] text-[#8b978e]">{Math.max(visibleSigned.length - 1, 0)} eventi</span>
              </div>
              {visibleSigned.slice(1).map((job) => <JobRow key={job.title} job={job} />)}
            </>
          )}
          {period === "Impegni passati" && visiblePast.map((job) => <JobRow key={job.title} job={job} />)}
          {showPast && (
            <>
              <div className="flex items-center gap-3 border-t border-[#e5e4da] bg-[#f6f5ef] px-4 py-3 sm:px-5">
                <span className="rounded-full bg-[#e7e5db] px-2 py-1 text-[9px] font-bold uppercase tracking-[.12em] text-[#7c8176]">Eventi passati</span>
                <span className="text-[11px] font-medium text-[#858d82]">Separati dall’agenda attiva</span>
                <span className="h-px flex-1 bg-[#e5e4da]" />
                <span className="text-[10px] text-[#92988f]">{visiblePast.length} conclusi</span>
              </div>
              {visiblePast.map((job) => <JobRow key={job.title} job={job} />)}
            </>
          )}
          {!visibleSigned.length && period !== "Impegni passati" && <div className="px-5 py-8 text-center text-sm text-[#86938b]">Nessun impegno futuro corrisponde alla ricerca.</div>}
          {period === "Impegni passati" && !visiblePast.length && <div className="px-5 py-8 text-center text-sm text-[#86938b]">Nessun evento passato corrisponde alla ricerca.</div>}
          <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[#e8e9e0] bg-[#fbfcf8] px-4 py-3 text-[11px] text-[#849088] sm:px-5">
            <span>7 lavori visibili <span className="mx-1 text-[#c1c7bc]">·</span> vista aggiornata al 18 ottobre 2026</span>
            <div className="flex items-center gap-2">
              <button className="rounded-md border border-[#dfe3da] bg-[#fffefa] px-2.5 py-1.5 hover:bg-[#f3f5ef]">Precedente</button>
              <span className="font-medium text-[#61756b]">1 di 12</span>
              <button className="rounded-md border border-[#dfe3da] bg-[#fffefa] px-2.5 py-1.5 hover:bg-[#f3f5ef]">Successiva</button>
            </div>
          </footer>
        </section>
        <div className="mt-4 flex items-center justify-center gap-2 text-[10px] tracking-[.02em] text-[#9aa49a]">
          <span className="h-px w-8 bg-[#dfe3d8]" /> Ogni data in agenda è una data evento confermata <span className="h-px w-8 bg-[#dfe3d8]" />
        </div>
      </div>
    </main>
  );
}
