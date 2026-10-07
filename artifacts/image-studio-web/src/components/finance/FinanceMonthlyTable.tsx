import { useMemo } from "react";
import { financeDayKey } from "@/lib/finance-model";
import type { FinanceLedgerEntry } from "@/lib/finance-types";
import { eur, MONTHS } from "./finance-format";
import { EmptyNote } from "./FinanceTables";

export default function FinanceMonthlyTable({ rows }: { rows: FinanceLedgerEntry[] }) {
  const { months, undated } = useMemo(() => {
    const map = new Map<string, { income: number; expenses: number }>();
    const u = { income: 0, expenses: 0, n: 0 };
    for (const r of rows) {
      const bucket = r.date ? map.get(financeDayKey(r.date).slice(0, 7)) ?? { income: 0, expenses: 0 } : u;
      if (r.direction === "income") bucket.income += r.amount; else bucket.expenses += r.amount;
      if (r.date) map.set(financeDayKey(r.date).slice(0, 7), bucket as { income: number; expenses: number }); else u.n++;
    }
    return { months: [...map.entries()].sort((a, b) => b[0].localeCompare(a[0])), undated: u };
  }, [rows]);
  if (!months.length && !undated.n) return <EmptyNote>Nessun movimento nel periodo.</EmptyNote>;
  const label = (k: string) => `${MONTHS[Number(k.slice(5)) - 1]} ${k.slice(0, 4)}`;
  const line = (key: string, name: string, i: number, e: number) => (
    <tr key={key} data-testid={`finance-month-${key}`}>
      <td className="px-3 py-2 capitalize">{name}</td>
      <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{eur(i)}</td>
      <td className="px-3 py-2 text-right tabular-nums text-rose-700">{eur(e)}</td>
      <td className="px-3 py-2 text-right font-semibold tabular-nums">{eur(i - e)}</td>
    </tr>
  );
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full min-w-[420px] text-sm">
        <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr><th className="px-3 py-2">Mese</th><th className="px-3 py-2 text-right">Entrate</th><th className="px-3 py-2 text-right">Uscite</th><th className="px-3 py-2 text-right">Netto</th></tr>
        </thead>
        <tbody className="divide-y">
          {months.map(([k, v]) => line(k, label(k), v.income, v.expenses))}
          {undated.n > 0 && line("undated", "Senza data", undated.income, undated.expenses)}
        </tbody>
      </table>
    </div>
  );
}
