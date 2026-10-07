import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { FinanceLabBalance, FinanceLabCost, FinanceLabPayment } from "@/lib/finance-types";
import { eur, fmtDate } from "./finance-format";

export interface FinanceLabOption {
  id: string;
  name: string;
}

type Props = {
  costs: FinanceLabCost[];
  payments: FinanceLabPayment[];
  balances: FinanceLabBalance[];
  labs: FinanceLabOption[];
  jobs: FinanceLabOption[];
  labId: string;
  jobId: string;
  onLabChange: (value: string) => void;
  onJobChange: (value: string) => void;
};

function TableFrame({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto rounded-md border">{children}</div>;
}

export default function FinanceLabsPanel({
  costs, payments, balances, labs, jobs, labId, jobId, onLabChange, onJobChange,
}: Props) {
  const labMatches = (id: string) => labId === "all" || id === labId;
  const jobMatches = (ids: string[]) => jobId === "all" || ids.includes(jobId);
  const visibleCosts = costs.filter((item) => labMatches(item.labId) && (jobId === "all" || item.jobId === jobId));
  const visiblePayments = payments.filter((item) => labMatches(item.labId) && jobMatches(item.jobIds));
  const visibleBalances = balances.filter((item) => labMatches(item.labId) && jobMatches(item.jobIds));
  const estimated = visibleCosts.filter((item) => item.status === "stima").reduce((total, item) => total + item.amount, 0);
  const actual = visibleCosts.filter((item) => item.status === "consuntivo").reduce((total, item) => total + item.amount, 0);
  const paid = visiblePayments.reduce((total, item) => total + item.amount, 0);
  const residual = visibleBalances.reduce((total, item) => total + item.balance, 0);

  return (
    <section className="space-y-4" aria-label="Costi e pagamenti dei laboratori" data-testid="finance-labs-panel">
      <div>
        <h3 className="font-playfair text-xl text-blue-gray">Laboratori</h3>
        <p className="text-xs text-muted-foreground">
          Costi dei Job, pagamenti effettivi e residui sono mostrati separatamente. Il pagamento non viene sommato di nuovo ai costi.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Select value={labId} onValueChange={onLabChange}>
          <SelectTrigger aria-label="Filtra per laboratorio" data-testid="finance-lab-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti i laboratori</SelectItem>
            {labs.map((lab) => <SelectItem key={lab.id} value={lab.id}>{lab.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={jobId} onValueChange={onJobChange}>
          <SelectTrigger aria-label="Filtra per Job" data-testid="finance-lab-job-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti i Job</SelectItem>
            {jobs.map((job) => <SelectItem key={job.id} value={job.id}>{job.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <LabKpi label="Costi stimati" amount={estimated} />
        <LabKpi label="Costi consuntivi" amount={actual} />
        <LabKpi label="Pagamenti nel periodo" amount={paid} />
        <LabKpi label="Residuo attuale" amount={residual} />
      </div>
      {jobId !== "all" && (
        <p className="rounded-md bg-muted/60 p-2 text-xs text-muted-foreground">
          Il residuo e i pagamenti restano riferiti al conteggio del laboratorio: non sono ripartiti tra i Job inclusi.
        </p>
      )}

      <div className="space-y-2">
        <h4 className="text-sm font-semibold">Costi collegati ai Job</h4>
        {visibleCosts.length === 0 ? <p className="rounded-md border p-4 text-sm text-muted-foreground">Nessun costo laboratorio per i filtri selezionati.</p> : (
          <TableFrame>
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                <tr><th className="p-2">Data</th><th className="p-2">Laboratorio</th><th className="p-2">Job</th><th className="p-2">Dettaglio</th><th className="p-2">Stato</th><th className="p-2 text-right">Costo</th></tr>
              </thead>
              <tbody>
                {visibleCosts.map((cost) => (
                  <tr key={cost.id} className="border-t">
                    <td className="whitespace-nowrap p-2">{fmtDate(cost.date)}</td>
                    <td className="p-2">{cost.labName}</td>
                    <td className="p-2">{cost.jobName}</td>
                    <td className="p-2">{cost.description}</td>
                    <td className="p-2">{cost.status === "stima" ? "Stima" : "Consuntivo"}</td>
                    <td className="whitespace-nowrap p-2 text-right tabular-nums">{eur(cost.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableFrame>
        )}
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-semibold">Pagamenti effettivi</h4>
        {visiblePayments.length === 0 ? <p className="rounded-md border p-4 text-sm text-muted-foreground">Nessun pagamento laboratorio nel periodo e nei filtri selezionati.</p> : (
          <TableFrame>
            <table className="w-full min-w-[680px] text-sm">
              <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                <tr><th className="p-2">Data</th><th className="p-2">Laboratorio</th><th className="p-2">Conteggio</th><th className="p-2">Job inclusi</th><th className="p-2">Metodo</th><th className="p-2 text-right">Pagamento</th><th className="p-2 text-right">Residuo dopo</th></tr>
              </thead>
              <tbody>
                {visiblePayments.map((payment) => (
                  <tr key={payment.id} className="border-t">
                    <td className="whitespace-nowrap p-2">{fmtDate(payment.date)}</td>
                    <td className="p-2">{payment.labName}</td>
                    <td className="p-2">{payment.statementName}</td>
                    <td className="p-2">{payment.jobNames.join(", ") || "Non attribuiti"}</td>
                    <td className="p-2">{payment.method}</td>
                    <td className="whitespace-nowrap p-2 text-right tabular-nums">{eur(payment.amount)}</td>
                    <td className="whitespace-nowrap p-2 text-right tabular-nums">{eur(payment.balanceAfter)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableFrame>
        )}
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-semibold">Residui attuali dei conteggi</h4>
        {visibleBalances.length === 0 ? <p className="rounded-md border p-4 text-sm text-muted-foreground">Nessun residuo registrato per i filtri selezionati.</p> : (
          <TableFrame>
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                <tr><th className="p-2">Laboratorio</th><th className="p-2">Conteggio</th><th className="p-2">Job inclusi</th><th className="p-2 text-right">Residuo attuale</th></tr>
              </thead>
              <tbody>
                {visibleBalances.map((balance) => (
                  <tr key={balance.id} className="border-t">
                    <td className="p-2">{balance.labName}</td>
                    <td className="p-2">{balance.statementName}</td>
                    <td className="p-2">{balance.jobNames.join(", ") || "Non attribuiti"}</td>
                    <td className="whitespace-nowrap p-2 text-right tabular-nums">{eur(balance.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableFrame>
        )}
      </div>
    </section>
  );
}

function LabKpi({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-playfair text-xl font-semibold tabular-nums text-blue-gray">{eur(amount)}</div>
    </div>
  );
}