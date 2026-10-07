import CashDashboardPeriodSelector, { type CashDashboardDateRange } from "../CashDashboardPeriodSelector";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MONTHS } from "./finance-format";

export type PeriodState = {
  range: CashDashboardDateRange;
  year: number;
  month: number;
  quarter: number;
  from: Date;
  to: Date;
};

export function periodBounds(p: PeriodState): { from?: Date; to?: Date; label: string } {
  const sod = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const eod = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  const f = (d: Date) => d.toLocaleDateString("it-IT");
  switch (p.range) {
    case "day": return { from: sod(p.from), to: eod(p.from), label: f(p.from) };
    case "custom": return { from: sod(p.from), to: eod(p.to), label: `${f(p.from)} - ${f(p.to)}` };
    case "month": return { from: new Date(p.year, p.month, 1), to: eod(new Date(p.year, p.month + 1, 0)), label: `${MONTHS[p.month]} ${p.year}` };
    case "quarter": return { from: new Date(p.year, p.quarter * 3, 1), to: eod(new Date(p.year, p.quarter * 3 + 3, 0)), label: `${p.quarter + 1}o trimestre ${p.year}` };
    case "year": return { from: new Date(p.year, 0, 1), to: eod(new Date(p.year, 11, 31)), label: String(p.year) };
    default: return { label: "Tutte le date" };
  }
}

export default function FinancePeriodBar({ value, years, onChange }: { value: PeriodState; years: number[]; onChange: (p: PeriodState) => void }) {
  const set = (patch: Partial<PeriodState>) => onChange({ ...value, ...patch });
  const showYear = ["month", "quarter", "year"].includes(value.range);
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="finance-period-bar">
      <CashDashboardPeriodSelector
        dateRange={value.range}
        onDateRangeChange={(range) => set({ range })}
        customDateFrom={value.from}
        customDateTo={value.to}
        onCustomDatesChange={(from, to) => onChange({ ...value, from, to })}
      />
      {value.range === "month" && (
        <Select value={String(value.month)} onValueChange={(v) => set({ month: Number(v) })}>
          <SelectTrigger className="h-8 w-[130px] text-xs capitalize" aria-label="Mese"><SelectValue /></SelectTrigger>
          <SelectContent>{MONTHS.map((m, i) => <SelectItem key={m} value={String(i)} className="capitalize">{m}</SelectItem>)}</SelectContent>
        </Select>
      )}
      {value.range === "quarter" && (
        <Select value={String(value.quarter)} onValueChange={(v) => set({ quarter: Number(v) })}>
          <SelectTrigger className="h-8 w-[130px] text-xs" aria-label="Trimestre"><SelectValue /></SelectTrigger>
          <SelectContent>{[0, 1, 2, 3].map((q) => <SelectItem key={q} value={String(q)}>{q + 1}o trimestre</SelectItem>)}</SelectContent>
        </Select>
      )}
      {showYear && (
        <Select value={String(value.year)} onValueChange={(v) => set({ year: Number(v) })}>
          <SelectTrigger className="h-8 w-[100px] text-xs" aria-label="Anno"><SelectValue /></SelectTrigger>
          <SelectContent>{years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>
      )}
    </div>
  );
}
