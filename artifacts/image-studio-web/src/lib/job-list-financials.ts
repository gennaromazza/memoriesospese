export interface JobListFinancialSnapshot {
  totalePreventivato?: number | null;
  totalePagato?: number | null;
  saldoResiduo?: number | null;
}

export interface JobListFinancialAggregate {
  totalePagato: number;
  saldoResiduo: number;
}

export interface ResolvedJobListFinancials {
  totalePreventivato: number;
  totalePagato: number;
  saldoResiduo: number;
}

function finiteAmount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function getJobListFinancials(
  aggregate: JobListFinancialAggregate | undefined,
  snapshot: JobListFinancialSnapshot | undefined,
): ResolvedJobListFinancials {
  const totalePreventivato = finiteAmount(snapshot?.totalePreventivato) ?? 0;
  const totalePagato = finiteAmount(aggregate?.totalePagato)
    ?? finiteAmount(snapshot?.totalePagato)
    ?? 0;
  const saldoResiduo = finiteAmount(aggregate?.saldoResiduo)
    ?? finiteAmount(snapshot?.saldoResiduo)
    ?? Math.max(0, totalePreventivato - totalePagato);

  return { totalePreventivato, totalePagato, saldoResiduo };
}