import { useMemo, useState } from "react";
import { Download, RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { filterFinanceDashboard } from "@/lib/finance-model";
import type { FinanceDashboard, FinanceLedgerEntry, FinanceReceivable, FinanceSource } from "@/lib/finance-types";
import { campaignTag, eur, fmtDate, matches, SOURCES, SOURCE_LABELS, sumLedger } from "./finance-format";
import FinancePeriodBar, { periodBounds, type PeriodState } from "./FinancePeriodBar";
import FinanceDetailDialog, { type FinanceDetail } from "./FinanceDetailDialog";
import FinanceCampaignsPanel from "./FinanceCampaignsPanel";
import FinanceMonthlyTable from "./FinanceMonthlyTable";
import FinanceLabsPanel from "./FinanceLabsPanel";
import { EmptyNote, MovementsTable, ReceivablesTable } from "./FinanceTables";

type ExportContext = { period: string; receivables: string; search?: string };
type Props = { data: FinanceDashboard; refreshing?: boolean; onRefresh: () => void; onExport: (filtered: FinanceDashboard & { exportContext?: ExportContext }) => void };
type Horizon = "all" | "overdue" | "30" | "90" | "undated";
const DAY = 86400000;

export default function FinancialDashboardView({ data, refreshing, onRefresh, onExport }: Props) {
  const now = new Date();
  const [period, setPeriod] = useState<PeriodState>({
    range: "all", year: now.getFullYear(), month: now.getMonth(), quarter: Math.floor(now.getMonth() / 3), from: now, to: now,
  });
  const [source, setSource] = useState<FinanceSource | "all">("all");
  const [campaignId, setCampaignId] = useState("all");
  const [labId, setLabId] = useState("all");
  const [labJobId, setLabJobId] = useState("all");
  const [search, setSearch] = useState("");
  const [horizon, setHorizon] = useState<Horizon>("all");
  const [tab, setTab] = useState("overview");
  const [detail, setDetail] = useState<FinanceDetail>(null);

  const bounds = periodBounds(period);
  const base = useMemo(() => ({
    campaignId: campaignId === "all" ? undefined : campaignId,
    source: source === "all" ? undefined : source,
  }), [campaignId, source]);
  const text = search.trim().toLowerCase();
  const labOptions = useMemo(() => {
    const names = new Map<string, string>();
    for (const row of [...data.labCosts, ...data.labPayments, ...data.labBalances]) names.set(row.labId, row.labName);
    return [...names].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "it"));
  }, [data.labCosts, data.labPayments, data.labBalances]);
  const labJobOptions = useMemo(() => {
    const names = new Map<string, string>();
    for (const row of data.labCosts) {
      if (row.jobId) names.set(row.jobId, row.jobName);
    }
    for (const row of [...data.labPayments, ...data.labBalances]) {
      row.jobIds.forEach((id, index) => names.set(id, row.jobNames[index] || id));
    }
    return [...names].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "it"));
  }, [data.labCosts, data.labPayments, data.labBalances]);

  const years = useMemo(() => {
    const set = new Set<number>([now.getFullYear()]);
    data.ledger.forEach((l) => l.date && set.add(l.date.getFullYear()));
    data.receivables.forEach((r) => r.date && set.add(r.date.getFullYear()));
    data.labCosts.forEach((cost) => cost.date && set.add(cost.date.getFullYear()));
    data.labPayments.forEach((payment) => payment.date && set.add(payment.date.getFullYear()));
    return [...set].sort((a, b) => b - a);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const periodData = useMemo(
    () => filterFinanceDashboard(data, { ...base, from: bounds.from, to: bounds.to }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, base, bounds.from?.getTime(), bounds.to?.getTime()],
  );
  const entryOk = (l: FinanceLedgerEntry) => !text || matches(text, l.description, l.customer, l.method, ...l.references);
  const recOk = (r: FinanceReceivable) => !text || matches(text, r.label, r.customer);
  const scopedLedger = useMemo(() => periodData.ledger.filter(entryOk),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [periodData, text]);
  const scopedCampaigns = useMemo(() => periodData.campaigns.map((c) => {
    const entries = c.entries.filter(entryOk);
    const t = sumLedger(entries);
    return { ...c, entries, income: t.income, expenses: t.expenses, net: t.net };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [periodData, text]);
  const scopedLabCosts = useMemo(() => periodData.labCosts.filter((item) =>
    (labId === "all" || item.labId === labId) &&
    (labJobId === "all" || item.jobId === labJobId) &&
    (!text || matches(text, item.labName, item.jobName, item.description, item.statementName)),
  ), [periodData.labCosts, labId, labJobId, text]);
  const scopedLabPayments = useMemo(() => periodData.labPayments.filter((item) =>
    (labId === "all" || item.labId === labId) &&
    (labJobId === "all" || item.jobIds.includes(labJobId)) &&
    (!text || matches(text, item.labName, item.statementName, item.method, ...item.jobNames)),
  ), [periodData.labPayments, labId, labJobId, text]);
  const scopedLabBalances = useMemo(() => data.labBalances.filter((item) =>
    (labId === "all" || item.labId === labId) &&
    (labJobId === "all" || item.jobIds.includes(labJobId)) &&
    (!text || matches(text, item.labName, item.statementName, ...item.jobNames)),
  ), [data.labBalances, labId, labJobId, text]);

  const allFor = useMemo(() => filterFinanceDashboard(data, base), [data, base]);
  const scopedReceivables = useMemo(() => allFor.receivables.filter(recOk),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allFor, text]);
  const horizonRows = useMemo(() => {
    const t = Date.now();
    return scopedReceivables.filter((r) => {
      if (horizon === "all") return true;
      if (horizon === "undated") return r.status === "undated";
      if (horizon === "overdue") return r.status === "overdue";
      return r.status === "future" && !!r.date && r.date.getTime() <= t + Number(horizon) * DAY;
    });
  }, [scopedReceivables, horizon]);
  const campaignRows = useMemo(() => allFor.campaigns.map((c) => ({ ...c, receivables: c.receivables.filter(recOk) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allFor, text]);

  const undatedLedger = allFor.ledger.filter((l) => !l.date).length;
  const warnings = useMemo(() => {
    const list = [...data.warnings];
    if (period.range !== "all" && undatedLedger > 0) list.push(`${undatedLedger} movimenti senza data di incasso esclusi dal periodo ${bounds.label}.`);
    return [...new Set(list)];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.warnings, undatedLedger, period.range, bounds.label]);
  const [warnOpen, setWarnOpen] = useState(false);

  const exportRec = tab === "receivables" ? horizonRows : scopedReceivables;
  const horizonLabels: Record<Horizon, string> = { all: "Tutto, anche senza data", overdue: "Solo scaduti", "30": "Prossimi 30 giorni", "90": "Prossimi 90 giorni", undated: "Solo senza data" };
  const filtered = useMemo<FinanceDashboard & { exportContext: ExportContext }>(() => ({
    ...periodData,
    ledger: scopedLedger,
    campaigns: scopedCampaigns,
    labCosts: scopedLabCosts,
    labPayments: scopedLabPayments,
    labBalances: scopedLabBalances,
    receivables: exportRec,
    warnings,
    exportContext: {
      period: bounds.label,
      receivables: tab === "receivables" ? horizonLabels[horizon] : "Tutti gli importi visibili, indipendenti dal periodo",
      search: [
        text,
        labId === "all" ? "" : `Laboratorio: ${labOptions.find((lab) => lab.id === labId)?.name || labId}`,
        labJobId === "all" ? "" : `Job: ${labJobOptions.find((job) => job.id === labJobId)?.name || labJobId}`,
      ].filter(Boolean).join(" · ") || undefined,
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [periodData, scopedLedger, scopedCampaigns, scopedLabCosts, scopedLabPayments, scopedLabBalances, exportRec, warnings, bounds.label, tab, horizon, text, labId, labJobId, labOptions, labJobOptions]);

  const totals = sumLedger(scopedLedger);
  const outstanding = scopedReceivables.reduce((s, r) => s + r.amount, 0);
  const byStatus = (s: FinanceReceivable["status"]) => scopedReceivables.filter((r) => r.status === s).reduce((a, r) => a + r.amount, 0);
  const incomeBySource = SOURCES.map((s) => ({
    s, ...sumLedger(scopedLedger.filter((l) => l.source === s)),
    n: scopedLedger.filter((l) => l.source === s).length,
  }));
  const filtersActive = source !== "all" || campaignId !== "all" || labId !== "all" || labJobId !== "all" || !!text || period.range !== "all";
  const openEntry = (entry: FinanceLedgerEntry) => setDetail({ kind: "entry", entry });
  const openRec = (item: FinanceReceivable) => setDetail({ kind: "receivable", item });
  const reset = () => { setSource("all"); setCampaignId("all"); setLabId("all"); setLabJobId("all"); setSearch(""); setPeriod({ ...period, range: "all" }); };

  return (
    <div className="space-y-5" data-testid="financial-dashboard">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-playfair text-2xl text-blue-gray">Dashboard finanziaria</h2>
          <p className="text-xs text-muted-foreground">Aggiornata {fmtDate(data.updatedAt, true)}. Periodo: <strong>{bounds.label}</strong></p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onRefresh} disabled={refreshing} data-testid="finance-refresh">
            <RefreshCw className={`mr-1.5 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />{refreshing ? "Aggiorno" : "Aggiorna"}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => onExport(filtered)} data-testid="finance-export">
            <Download className="mr-1.5 h-4 w-4" />Esporta
          </Button>
        </div>
      </header>

      {warnings.length > 0 && (
        <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" data-testid="finance-warnings">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2 font-medium"><TriangleAlert className="h-4 w-4" />Dati da verificare ({warnings.length})</span>
            {warnings.length > 3 && (
              <Button type="button" variant="ghost" size="sm" className="h-8" aria-expanded={warnOpen} aria-controls="finance-warning-list" onClick={() => setWarnOpen(!warnOpen)} data-testid="finance-warnings-toggle">
                {warnOpen ? "Mostra meno" : `Mostra tutti (${warnings.length})`}
              </Button>
            )}
          </div>
          <ul id="finance-warning-list" className={`list-disc space-y-0.5 pl-5 ${warnOpen ? "max-h-72 overflow-y-auto" : ""}`}>
            {(warnOpen ? warnings : warnings.slice(0, 3)).map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      <section className="space-y-3 rounded-lg border bg-card p-3" aria-label="Filtri">
        <FinancePeriodBar value={period} years={years} onChange={setPeriod} />
        <div className="grid gap-2 sm:grid-cols-[1fr_11rem_14rem_auto]">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cerca cliente, descrizione, riferimento" aria-label="Cerca" data-testid="finance-search" />
          <Select value={source} onValueChange={(v) => setSource(v as FinanceSource | "all")}>
            <SelectTrigger aria-label="Origine" data-testid="finance-source-filter"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">Tutte le origini</SelectItem>{SOURCES.map((s) => <SelectItem key={s} value={s}>{SOURCE_LABELS[s]}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={campaignId} onValueChange={setCampaignId}>
            <SelectTrigger aria-label="Campagna" data-testid="finance-campaign-filter"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">Tutte le campagne</SelectItem>{data.campaigns.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} ({campaignTag(c.id)})</SelectItem>)}</SelectContent>
          </Select>
          {filtersActive && <Button type="button" variant="ghost" onClick={reset}>Azzera</Button>}
        </div>
      </section>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid h-auto w-full grid-cols-5 gap-1 p-1">
          <TabsTrigger value="overview" className="px-1 text-xs sm:text-sm" data-testid="finance-tab-overview">Panoramica</TabsTrigger>
          <TabsTrigger value="campaigns" className="px-1 text-xs sm:text-sm" data-testid="finance-tab-campaigns">Campagne</TabsTrigger>
          <TabsTrigger value="receivables" className="px-1 text-xs sm:text-sm" data-testid="finance-tab-receivables">Da incassare</TabsTrigger>
          <TabsTrigger value="movements" className="px-1 text-xs sm:text-sm" data-testid="finance-tab-movements">Movimenti</TabsTrigger>
          <TabsTrigger value="labs" className="px-1 text-xs sm:text-sm" data-testid="finance-tab-labs">Laboratori</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-5">
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Incassato nel periodo: {bounds.label}</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Kpi label="Entrate incassate" value={eur(totals.income)} tone="text-emerald-700" testid="finance-income-total" />
              <Kpi label="Uscite" value={eur(totals.expenses)} tone="text-rose-700" testid="finance-expense-total" />
              <Kpi label="Netto" value={eur(totals.net)} tone={totals.net >= 0 ? "text-blue-gray" : "text-rose-700"} testid="finance-net-total" />
            </div>
            {text && <p className="mt-2 text-xs text-muted-foreground">Ricerca attiva: incassi, origini, campagne e mensile contano solo i movimenti trovati.</p>}
            {undatedLedger > 0 && (
              <p className="mt-2 text-xs text-amber-800" data-testid="finance-undated-ledger">
                {undatedLedger} movimenti senza data di incasso non rientrano in nessun periodo: visibili con "Tutte le date" nei Movimenti.
              </p>
            )}
          </div>
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ancora da incassare (indipendente dal periodo{text ? `, ricerca "${search.trim()}"` : ""})</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Kpi label="Totale residuo" value={eur(outstanding)} testid="finance-outstanding-total" />
              <Kpi label="Scaduto" value={eur(byStatus("overdue"))} tone="text-rose-700" />
              <Kpi label="Futuro" value={eur(byStatus("future"))} />
              <Kpi label="Senza data" value={eur(byStatus("undated"))} tone="text-amber-800" />
            </div>
            <Button type="button" variant="link" className="px-0" onClick={() => setTab("receivables")}>Vedi dettaglio rate e stime</Button>
          </div>
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Andamento mensile (stessi movimenti del periodo)</h3>
            <FinanceMonthlyTable rows={scopedLedger} />
          </div>
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Per origine (periodo)</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {incomeBySource.map((r) => (
                <button key={r.s} type="button" aria-pressed={source === r.s} onClick={() => setSource(source === r.s ? "all" : r.s)}
                  className={`rounded-lg border p-3 text-left transition-colors ${source === r.s ? "border-primary bg-accent" : "hover:bg-muted/40"}`} data-testid={`finance-source-${r.s}`}>
                  <div className="text-xs text-muted-foreground">{SOURCE_LABELS[r.s]}</div>
                  <div className="font-semibold tabular-nums text-emerald-700">{eur(r.income)}</div>
                  {r.expenses > 0 && <div className="text-xs tabular-nums text-rose-700">-{eur(r.expenses)}</div>}
                  <div className="text-[11px] text-muted-foreground">{r.n} movimenti</div>
                </button>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="campaigns">
          <FinanceCampaignsPanel periodCampaigns={scopedCampaigns} allCampaigns={campaignRows} searching={!!text} periodLabel={bounds.label} onOpenEntry={openEntry} onOpenReceivable={openRec} />
        </TabsContent>

        <TabsContent value="labs">
          <FinanceLabsPanel
            costs={scopedLabCosts}
            payments={scopedLabPayments}
            balances={scopedLabBalances}
            labs={labOptions}
            jobs={labJobOptions}
            labId={labId}
            jobId={labJobId}
            onLabChange={setLabId}
            onJobChange={setLabJobId}
          />
        </TabsContent>

        <TabsContent value="receivables" className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Orizzonte</span>
            <Select value={horizon} onValueChange={(v) => setHorizon(v as Horizon)}>
              <SelectTrigger className="h-8 w-[200px]" aria-label="Orizzonte" data-testid="finance-horizon"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutto, anche senza data</SelectItem>
                <SelectItem value="overdue">Solo scaduti</SelectItem>
                <SelectItem value="30">Prossimi 30 giorni</SelectItem>
                <SelectItem value="90">Prossimi 90 giorni</SelectItem>
                <SelectItem value="undated">Solo senza data</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm font-semibold tabular-nums">{eur(horizonRows.reduce((s, r) => s + r.amount, 0))} in {horizonRows.length} voci</span>
          </div>
          <p className="text-xs text-muted-foreground">Le rate programmate hanno una scadenza; le stime sono il residuo non ancora pianificato. Il periodo scelto sopra non nasconde questi importi.</p>
          <ReceivablesTable rows={horizonRows} onOpen={openRec} />
        </TabsContent>

        <TabsContent value="movements" className="space-y-3">
          <p className="text-xs text-muted-foreground">{scopedLedger.length} movimenti, ordinati per data di incasso reale. Senza data in fondo.</p>
          {data.ledger.length === 0 ? <EmptyNote>Nessun movimento registrato.</EmptyNote> : <MovementsTable rows={scopedLedger} onOpen={openEntry} />}
        </TabsContent>
      </Tabs>
      <FinanceDetailDialog detail={detail} onClose={() => setDetail(null)} />
    </div>
  );
}

function Kpi({ label, value, tone = "text-blue-gray", testid }: { label: string; value: string; tone?: string; testid?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`font-playfair text-2xl font-semibold tabular-nums ${tone}`} data-testid={testid}>{value}</div>
    </div>
  );
}
