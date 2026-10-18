import "./_group.css";
import {
  CalendarDays,
  ChevronDown,
  Clock3,
  MapPin,
  Search,
  Users,
  Wallet,
} from "lucide-react";

const currentRows = [
  { name: "Battesimo famiglia R.", client: "1 cliente", location: "—", date: "Da definire", detail: "Inserito il 15 set 2026", kind: "Battesimo", status: "Lead", kindColor: "#a3a878" },
  { name: "Battesimo Ludovica", client: "1 cliente", location: "—", date: "Da definire", detail: "Inserito il 13 lug 2026", kind: "Battesimo", status: "Lead", kindColor: "#a3a878" },
  { name: "Battesimo della famiglia P.", client: "1 cliente", location: "—", date: "Da definire", detail: "Inserito il 06 feb 2026", kind: "Battesimo", status: "Lead", kindColor: "#a3a878" },
  { name: "Matrimonio Chiara e Marco", client: "2 clienti", location: "Aversa", date: "20 dic 2025", detail: "7 mesi fa", kind: "Matrimonio", status: "Firmato", kindColor: "#70b9b1" },
  { name: "Matrimonio Elisa e Andrea", client: "2 clienti", location: "Caserta", date: "22 feb 2026", detail: "8 mesi fa", kind: "Matrimonio", status: "Firmato", kindColor: "#70b9b1" },
  { name: "Battesimo di oggi", client: "2 clienti", location: "Aversa", date: "18 ott 2026", detail: "OGGI · 12:00", kind: "Battesimo", status: "Firmato", kindColor: "#a3a878" },
  { name: "Matrimonio Lucia e Davide", client: "2 clienti", location: "Napoli", date: "21 nov 2026", detail: "tra 1 mese", kind: "Matrimonio", status: "Firmato", kindColor: "#70b9b1" },
];

const selectStyle = "flex h-10 min-w-0 items-center justify-between gap-2 rounded-md border border-[#d8d7cc] bg-white px-3 text-sm text-[#526a71] shadow-sm";

export function Current() {
  return (
    <main className="min-h-screen bg-[#f7f8f4] px-5 py-6 text-[#405a62] [font-family:'DM_Sans',sans-serif]">
      <div className="mx-auto max-w-[1320px] space-y-4">
        <div className="grid gap-3 xl:grid-cols-[minmax(300px,1.7fr)_repeat(2,minmax(170px,1fr))]">
          <label className="relative block">
            <Search className="absolute left-3 top-3 h-4 w-4 text-[#91a19b]" />
            <input className="h-10 w-full rounded-md border border-[#d8d7cc] bg-white pl-10 pr-3 text-sm shadow-sm outline-none" placeholder="Cerca per evento, location, clienti, note..." />
          </label>
          <div className={selectStyle}>Prossimi Impegni <ChevronDown className="h-4 w-4" /></div>
          <div className={selectStyle}>Tutti i preventivi <ChevronDown className="h-4 w-4" /></div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className={selectStyle}>Tutti i collaboratori <ChevronDown className="h-4 w-4" /></div>
          <div className={selectStyle}>Tutti gli anni <ChevronDown className="h-4 w-4" /></div>
          <div className={selectStyle}>Tutti i mesi <ChevronDown className="h-4 w-4" /></div>
          <div className={selectStyle}>Tutti i semestri <ChevronDown className="h-4 w-4" /></div>
          <button className="flex h-10 items-center justify-center gap-2 rounded-md border border-[#d8d7cc] bg-white px-3 text-sm shadow-sm">
            <CalendarDays className="h-4 w-4" /> Intervallo date
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs text-[#71867f]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#87a891]" />
          Filtri attivi: <span className="rounded-full bg-[#e7efe8] px-2 py-0.5 font-medium">Tutti i tipi</span>
        </div>

        <section className="overflow-hidden rounded-lg border border-[#e2dfd2] bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] border-collapse text-left text-sm">
              <thead className="bg-[#fbfaf7] text-xs font-semibold text-[#73847c]">
                <tr className="border-b border-[#e8e5dc]">
                  <th className="w-10 px-3 py-3"><input type="checkbox" aria-label="Seleziona tutti" /></th>
                  <th className="px-3 py-3">Nome evento</th>
                  <th className="px-3 py-3">Cliente/i</th>
                  <th className="px-3 py-3">Location</th>
                  <th className="px-3 py-3">Data/orario</th>
                  <th className="px-3 py-3">Tipo</th>
                  <th className="px-3 py-3">Stato</th>
                  <th className="px-3 py-3 text-center"><Users className="mx-auto h-4 w-4" /></th>
                  <th className="px-3 py-3 text-center"><Wallet className="mx-auto h-4 w-4" /></th>
                </tr>
              </thead>
              <tbody>
                {currentRows.map((row) => (
                  <tr key={row.name} className="border-b border-[#efeee8] last:border-0 hover:bg-[#fafaf7]">
                    <td className="px-3 py-4"><input type="checkbox" aria-label={`Seleziona ${row.name}`} /></td>
                    <td className="px-3 py-4">
                      <div className="font-semibold text-[#334e58]">{row.name}</div>
                      {row.status === "Lead" && <span className="mt-1 inline-flex rounded-full bg-[#fff2d7] px-2 py-0.5 text-[10px] font-semibold text-[#a87927]">Preventivo da seguire</span>}
                    </td>
                    <td className="px-3 py-4 text-[#687b7d]">{row.client}</td>
                    <td className="px-3 py-4">
                      <span className="inline-flex items-center gap-1 text-[#687b7d]">
                        {row.location !== "—" && <MapPin className="h-3 w-3" />}{row.location}
                      </span>
                    </td>
                    <td className="px-3 py-4">
                      <div className="font-medium text-[#334e58]">{row.date}</div>
                      <div className={row.detail.startsWith("OGGI") ? "mt-0.5 text-xs font-bold text-[#54866c]" : "mt-0.5 text-xs text-[#8a9992]"}>
                        {row.detail.startsWith("OGGI") && <Clock3 className="mr-1 inline h-3 w-3" />}{row.detail}
                      </div>
                    </td>
                    <td className="px-3 py-4">
                      <span className="inline-flex rounded-md border px-2 py-1 text-xs font-medium" style={{ borderColor: row.kindColor, color: row.kindColor }}>
                        {row.kind}
                      </span>
                    </td>
                    <td className="px-3 py-4">
                      <span className={row.status === "Lead" ? "rounded-full border border-[#e4dcc8] bg-[#f6f2e8] px-2 py-1 text-xs text-[#857858]" : "rounded-full border border-[#c8ded2] bg-[#edf5ef] px-2 py-1 text-xs font-medium text-[#527c63]"}>
                        {row.status}
                      </span>
                    </td>
                    <td className="px-3 py-4 text-center text-[#81928a]">—</td>
                    <td className="px-3 py-4 text-center text-[#81928a]">—</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <footer className="flex items-center justify-between border-t border-[#e8e5dc] bg-[#fbfaf7] px-4 py-3 text-xs text-[#71847d]">
            <span>Mostrando 7 di 134 lavori</span>
            <div className="flex items-center gap-2">
              <button className="rounded border border-[#d8d7cc] bg-white px-2 py-1">Precedente</button>
              <span>1 / 20</span>
              <button className="rounded border border-[#d8d7cc] bg-white px-2 py-1">Successiva</button>
            </div>
          </footer>
        </section>
      </div>
    </main>
  );
}
