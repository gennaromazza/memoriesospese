import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import CashDashboard from "@/components/CashDashboard";
import RegistraPagamentoModal from "@/components/jobs/RegistraPagamentoModal";
import { Button } from "@/components/ui/button";
import { attachFinanceRefresh } from "@/lib/finance-refresh";
import { buildFinanceDashboard } from "@/lib/finance-model";
import { exportFinanceDashboard } from "@/lib/financial-dashboard-data";
import type { FinanceDashboard, FinanceSnapshot } from "@/lib/finance-types";

declare global {
  interface Window {
    __financeE2EApplyPayment?: (amount: number, date: string, method: string) => void;
    __financeE2ESetFailure?: (value: boolean) => void;
    __financeE2EExport?: FinanceDashboard;
  }
}

const at = "2026-10-01T12:00:00Z";
function createFixture(): FinanceSnapshot {
  return {
    clients: [{ id: "client-job", nome: "Cliente", cognome: "Lavoro prova" }],
    labStatements: [],
    campaigns: [{ id: "campagna-A", nome: "Natale" }, { id: "campagna-B", nome: "Natale" }],
    jobs: [{ id: "job-fixture", nomeEvento: "Lavoro senza data evento", clientiIds: ["client-job"],
      costi: [{ id: "cost", importo: 40, data: at, descrizione: "Materiale prova" }] }],
    bookings: [
      { id: "booking-A", campaignId: "campagna-A", stato: "confermata", totale: 200,
        cliente: { nome: "Cliente", cognome: "Campagna A" }, dataShootingInizio: "2026-12-01",
        transactions: [{ importo: 50, data: at, metodo: "carta", tipo: "acconto" }] },
      { id: "booking-B", campaignId: "campagna-B", stato: "confermata", totale: 300,
        cliente: { nome: "Cliente", cognome: "Campagna B" },
        transactions: [{ importo: 80, data: "2026-09-01T10:00:00Z", metodo: "bonifico" }] },
    ],
    orders: [
      { id: "order-A", bookingId: "booking-A", totale: 200, transactions: [
        { importo: 50, data: at, metodo: "carta", tipo: "acconto", cashMovementId: "cash-A" }] },
      { id: "order-walkin", nomeCliente: "Cliente Walk-in", totale: 100, transactions: [
        { importo: 30, data: "2026-10-02T10:00:00Z", metodo: "carta", cashMovementId: "cash-walkin" }] },
    ],
    schedules: [{ id: "schedule-job", jobId: "job-fixture", clienteId: "client-job",
      totale: 1000, totalePagato: 100, saldoResiduo: 900, payments: [
        { id: "future-rate", tipo: "rata", importo: 500, importoPagato: 100, stato: "parziale",
          dataScadenza: "2026-11-01T12:00:00Z", cashMovementId: "cash-job" },
        { id: "overdue-rate", tipo: "acconto", importo: 300, stato: "atteso", dataScadenza: "2026-09-15T12:00:00Z" },
        { id: "undated-rate", tipo: "saldo", importo: 200, stato: "atteso" },
      ] }],
    movements: [
      { id: "cash-A", orderId: "order-A", importo: 50, data: at, metodoPagamento: "carta", descrizione: "Acconto campagna A" },
      { id: "cash-walkin", orderId: "order-walkin", importo: 30, data: "2026-10-02T10:00:00Z", metodoPagamento: "carta" },
      { id: "cash-job", jobId: "job-fixture", importo: 100, data: at, metodoPagamento: "bonifico",
        sourceType: "payment-schedule", sourceId: "schedule-job", paymentId: "future-rate" },
      { id: "cash-unknown", importo: 20, descrizione: "Incasso storico senza data" },
      { id: "cash-print", origine: "print_shop" as const, importo: 10, data: "2026-10-04T12:00:00Z", descrizione: "Incasso stampa" },
      { id: "refund-A", bookingId: "booking-A", importo: 20, tipo: "uscita", data: "2026-10-03T12:00:00Z",
        descrizione: "Rimborso reale campagna A", metodoPagamento: "carta" },
    ].map(m => ({ ...m, tipo: m.tipo || "entrata" })),
  };
}

/** DEV-only, opt-in route: every financial document and update stays in memory. */
export default function FinancialDashboardE2EHarness() {
  const client = useMemo(() => new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }), []);
  const snapshot = useRef(createFixture());
  const failed = useRef(new URLSearchParams(window.location.search).has("error"));
  const [paymentOpen, setPaymentOpen] = useState(false);
  const load = useCallback(async () => {
    await new Promise(resolve => setTimeout(resolve, 20));
    if (failed.current) throw new Error("Errore isolato di lettura finanziaria");
    return buildFinanceDashboard(snapshot.current, new Date("2026-10-04T12:00:00Z"));
  }, []);
  useEffect(() => {
    const stop = attachFinanceRefresh(client);
    window.__financeE2ESetFailure = value => { failed.current = value; };
    window.__financeE2EApplyPayment = (amount, date, method) => {
      const plan = snapshot.current.schedules[0];
      const payment = plan.payments![0];
      payment.importoPagato = (payment.importoPagato || 0) + amount;
      payment.stato = payment.importoPagato >= payment.importo ? "pagato" : "parziale";
      payment.cashMovementId = "cash-job-new";
      plan.totalePagato = payment.importoPagato;
      plan.saldoResiduo = 1000 - payment.importoPagato;
      snapshot.current.movements.push({
        id: "cash-job-new", tipo: "entrata", jobId: "job-fixture", importo: amount, data: date, metodoPagamento: method,
        sourceType: "payment-schedule", sourceId: "schedule-job", paymentId: "future-rate",
        descrizione: "Versamento simulato nella prova",
      });
    };
    return () => {
      stop(); client.clear();
      delete window.__financeE2EApplyPayment;
      delete window.__financeE2ESetFailure;
      delete window.__financeE2EExport;
    };
  }, [client]);
  return (
    <QueryClientProvider client={client}>
      <main className="mx-auto max-w-7xl space-y-4 p-3 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">Prova isolata: nessun pagamento reale.</p>
          <Button onClick={() => setPaymentOpen(true)} data-testid="finance-open-payment">Registra pagamento di prova</Button>
        </div>
        <CashDashboard loadData={load} exportData={data => {
          window.__financeE2EExport = data;
          exportFinanceDashboard(data);
        }} />
        <RegistraPagamentoModal open={paymentOpen} onOpenChange={setPaymentOpen}
          scheduleId="schedule-job" jobId="job-fixture" payment={{ id: "future-rate", tipo: "rata", importo: 400 }} />
      </main>
    </QueryClientProvider>
  );
}