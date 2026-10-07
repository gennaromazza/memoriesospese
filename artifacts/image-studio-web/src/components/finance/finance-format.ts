import { format } from "date-fns";
import { it } from "date-fns/locale/it";
import type { FinanceSource, FinanceLedgerEntry } from "@/lib/finance-types";

export const eur = (v: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(v);

export const fmtDate = (d: Date | null | undefined, withTime = false) =>
  d ? new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } as const : {}),
  }).format(d) : "Data non registrata";

export const SOURCE_LABELS: Record<FinanceSource, string> = {
  job: "Lavori",
  booking: "Prenotazioni",
  "walk-in": "Walk-in",
  print_shop: "Stampe",
  manuale: "Manuale",
};
export const SOURCES = Object.keys(SOURCE_LABELS) as FinanceSource[];

export const MONTHS = Array.from({ length: 12 }, (_, i) =>
  format(new Date(2020, i, 1), "MMMM", { locale: it }),
);

export const sumLedger = (rows: FinanceLedgerEntry[]) => {
  let income = 0;
  let expenses = 0;
  for (const r of rows) {
    if (r.direction === "income") income += r.amount;
    else expenses += r.amount;
  }
  return { income, expenses, net: income - expenses };
};

export const matches = (text: string, ...parts: (string | undefined)[]) =>
  parts.some((p) => (p || "").toLowerCase().includes(text));

export const campaignTag = (id: string) => `ID ${id.slice(-5)}`;
