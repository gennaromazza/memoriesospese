import { describe, expect, it } from "vitest";
import { buildFinanceDashboard, filterFinanceDashboard, financeDate, financeDayKey } from "./finance-model";
import type { FinanceSnapshot } from "./finance-types";

const now = new Date("2026-10-04T10:00:00Z");
const at = "2026-10-01T12:00:00Z";
const snapshot = (data: Partial<FinanceSnapshot> = {}): FinanceSnapshot => ({
  jobs: [], orders: [], bookings: [], schedules: [], campaigns: [], clients: [], labStatements: [], ...data,
  movements: (data.movements || []).map(m => ({ tipo: "entrata", ...m })),
});

describe("financial dashboard read model", () => {
  it("uses each installment deadline even for a job without an event date", () => {
    const result = buildFinanceDashboard(snapshot({
      jobs: [{ id: "job", nomeEvento: "Servizio senza evento" }],
      schedules: [{ id: "plan", jobId: "job", saldoResiduo: 350, payments: [
        { id: "a", tipo: "rata", importo: 100, importoPagato: 50, stato: "parziale", dataScadenza: "2026-10-02T10:00:00Z" },
        { id: "b", tipo: "saldo", importo: 300, stato: "atteso", dataScadenza: "2026-11-02T10:00:00Z" },
        { id: "c", importo: 25, importoPagato: 25, stato: "pagato", dataScadenza: at },
      ] }],
    }), now);
    expect(result.receivables.map(r => [r.amount, r.status])).toEqual([[50, "overdue"], [300, "future"]]);
    expect(result.receivables.every(r => r.scheduled && r.jobId === "job")).toBe(true);
  });

  it("reconciles cash, order and booking copies once, with traceable receipts", () => {
    const result = buildFinanceDashboard(snapshot({
      campaigns: [{ id: "c", nome: "Natale" }],
      bookings: [{ id: "b", campaignId: "c", stato: "confermata", totale: 200,
        cliente: { nome: "Cliente", cognome: "Prova" },
        transactions: [{ importo: 50, data: at, metodo: "carta", tipo: "acconto" }] }],
      orders: [{ id: "o", bookingId: "b", totale: 200, transactions: [
        { importo: 50, data: at, metodo: "carta", tipo: "acconto", cashMovementId: "m" },
      ] }],
      movements: [{ id: "m", orderId: "o", bookingId: "b", data: at, importo: 50, tipo: "entrata", metodoPagamento: "carta" }],
    }), now);
    expect(result.ledger).toHaveLength(1);
    expect(result.ledger[0].references).toHaveLength(3);
    expect(result.campaigns[0]).toMatchObject({ income: 50, agreed: 200, outstanding: 150, bookings: 1 });
    expect(result.receivables).toHaveLength(1);
  });

  it("keeps cumulative partial receipts as individual cash events", () => {
    const result = buildFinanceDashboard(snapshot({
      jobs: [{ id: "j" }],
      movements: [
        { id: "m1", jobId: "j", sourceType: "payment-schedule", sourceId: "s", paymentId: "p", importo: 40, data: at },
        { id: "m2", jobId: "j", sourceType: "payment-schedule", sourceId: "s", paymentId: "p", importo: 60, data: "2026-10-03T10:00:00Z" },
      ],
      schedules: [{ id: "s", jobId: "j", payments: [
        { id: "p", importo: 250, importoPagato: 100, cashMovementId: "m2", dataPagamento: "2026-10-03T10:00:00Z", dataScadenza: "2026-11-01T10:00:00Z" },
      ] }],
    }), now);
    expect(result.ledger).toHaveLength(2);
    expect(result.ledger.reduce((s, r) => s + r.amount, 0)).toBe(100);
    expect(result.receivables[0].amount).toBe(150);
  });

  it("does not collapse genuine equal payments or unrelated entities", () => {
    const tx = { importo: 50, data: at, metodo: "carta", tipo: "acconto" };
    const result = buildFinanceDashboard(snapshot({
      orders: [
        { id: "a", totale: 100, transactions: [tx, tx] },
        { id: "b", totale: 50, transactions: [tx] },
      ],
      movements: [{ id: "m", orderId: "a", importo: 50, data: at, metodoPagamento: "carta" }],
    }), now);
    expect(result.ledger).toHaveLength(3);
    expect(result.ledger.reduce((s, r) => s + r.amount, 0)).toBe(150);
  });

  it("matches legacy mirrors through a booking link, not through a campaign name", () => {
    const result = buildFinanceDashboard(snapshot({
      campaigns: [{ id: "c1", nome: "Natale" }, { id: "c2", nome: "Natale" }],
      bookings: [{ id: "b1", campaignId: "c1", totale: 100, stato: "confermata" },
        { id: "b2", campaignId: "c2", totale: 150, stato: "confermata" }],
      orders: [{ id: "o", bookingId: "b1", totale: 100, transactions: [{ importo: 50, data: at, metodo: "carta" }] }],
      movements: [{ id: "m", origine: "booking", origineRef: "b1", importo: 50, data: at, metodoPagamento: "carta" }],
    }), now);
    expect(result.ledger).toHaveLength(1);
    expect(result.campaigns.map(c => c.income)).toEqual([50, 0]);
    expect(filterFinanceDashboard(result, { campaignId: "c2" }).ledger).toHaveLength(0);
  });

  it("attributes manual cash receipts and expenses by stable campaign ID, not duplicate names", () => {
    const result = buildFinanceDashboard(snapshot({
      campaigns: [{ id: "c1", nome: "Natale" }, { id: "c2", nome: "Natale" }],
      movements: [
        { id: "in", campaignId: "c1", origineTema: "Natale", importo: 50, data: at },
        { id: "out", campaignId: "c1", origineTema: "Natale", tipo: "uscita", importo: 20, data: at },
      ],
    }), now);
    expect(result.campaigns.map(c => [c.id, c.income, c.expenses, c.net])).toEqual([
      ["c1", 50, 20, 30], ["c2", 0, 0, 0],
    ]);
    expect(result.ledger.every(e => e.campaignId === "c1")).toBe(true);
  });

  it("excludes cancelled debt but preserves real historic receipts", () => {
    const result = buildFinanceDashboard(snapshot({
      jobs: [{ id: "j", status: "annullato" }],
      schedules: [{ id: "s", jobId: "j", payments: [{ id: "p", importo: 100, dataScadenza: at }] }],
      orders: [{ id: "o", stato: "annullato", totale: 100, transactions: [{ importo: 20, data: at }] }],
    }), now);
    expect(result.receivables).toHaveLength(0);
    expect(result.ledger[0].amount).toBe(20);
  });

  it("does not assign cumulative payments with missing cash history to the last receipt date", () => {
    const result = buildFinanceDashboard(snapshot({
      jobs: [{ id: "j" }],
      schedules: [{ id: "s", jobId: "j", payments: [{ id: "p", importo: 100, importoPagato: 100, dataPagamento: at }] }],
    }), now);
    expect(result.ledger[0]).toMatchObject({ amount: 100, date: null });
    expect(filterFinanceDashboard(result, { from: new Date(2026, 9, 1), to: new Date(2026, 9, 4) }).ledger).toHaveLength(0);
    expect(result.warnings.join(" ")).toContain("cronologia");
  });

  it("does not add an ambiguous legacy paid snapshot on top of real job cash", () => {
    const result = buildFinanceDashboard(snapshot({
      jobs: [{ id: "j" }],
      movements: [{ id: "m", jobId: "j", importo: 100, data: at }],
      schedules: [{ id: "s", jobId: "j", payments: [{ id: "p", importo: 100, importoPagato: 100 }] }],
    }), now);
    expect(result.ledger).toHaveLength(1);
    expect(result.warnings.join(" ")).toContain("evitare duplicazioni");
  });

  it("includes the complete final Rome day and normalizes serialized timestamps", () => {
    expect(financeDayKey(new Date("2026-10-31T22:59:59.999Z"))).toBe("2026-10-31");
    expect(financeDate({ _seconds: 0 })).toEqual(new Date(0));
    const model = buildFinanceDashboard(snapshot({ movements: [
      { id: "last", importo: 1, data: "2026-10-31T22:59:59.999Z" },
      { id: "next", importo: 2, data: "2026-10-31T23:00:00Z" },
      { id: "bad", importo: 3, data: "not-a-date" },
    ] }), now);
    const filtered = filterFinanceDashboard(model, { from: new Date(2026, 9, 1), to: new Date(2026, 9, 31) });
    expect(filtered.ledger.map(r => r.id)).toEqual(["cash:last"]);
    expect(filtered.warnings.join(" ")).toContain("senza data escluse");
  });

  it("recomputes campaign period receipts without changing all-time debt", () => {
    const model = buildFinanceDashboard(snapshot({
      campaigns: [{ id: "c", nome: "Campagna conclusa" }],
      bookings: [{ id: "b", campaignId: "c", totale: 300, stato: "confermata", transactions: [
        { importo: 50, data: at }, { importo: 100, data: "2026-09-01T10:00:00Z" },
      ] }],
    }), now);
    const filtered = filterFinanceDashboard(model, { from: new Date(2026, 9, 1), to: new Date(2026, 9, 31) });
    expect(filtered.campaigns[0]).toMatchObject({ income: 50, outstanding: 150, agreed: 300 });
    expect(filterFinanceDashboard(model, { source: "job" }).campaigns).toHaveLength(0);
  });

  it("deduplicates an explicitly linked job cost", () => {
    const model = buildFinanceDashboard(snapshot({
      jobs: [{ id: "j", costi: [{ id: "cost", importo: 25, data: at, cashMovementId: "m" }] }],
      movements: [{ id: "m", jobId: "j", tipo: "uscita", importo: 25, data: at }],
    }), now);
    expect(model.ledger).toHaveLength(1);
    expect(model.ledger[0].direction).toBe("expense");
  });

  it("does not price historical bookings from today’s product catalogue", () => {
    const model = buildFinanceDashboard(snapshot({
      bookings: [{ id: "b", stato: "confermata", campaignId: "missing" }],
    }), now);
    expect(model.receivables).toHaveLength(0);
    expect(model.warnings.join(" ")).toContain("listino attuale");
    expect(model.campaigns[0].id).toBe("missing");
  });

  it("represents one booking/job/order debt once when a plan exists", () => {
    const model = buildFinanceDashboard(snapshot({
      campaigns: [{ id: "c" }], bookings: [{ id: "b", campaignId: "c", stato: "confermata", totale: 200 }],
      orders: [{ id: "o", bookingId: "b", totale: 200 }],
      jobs: [{ id: "j", bookingId: "b", orderIds: ["o"], saldoResiduo: 200 }],
      schedules: [{ id: "s", jobId: "j", orderId: "o", payments: [{ id: "p", importo: 200, dataScadenza: "2026-12-01" }] }],
    }), now);
    expect(model.receivables).toHaveLength(1);
    expect(model.campaigns[0].outstanding).toBe(200);
  });

  it("reports overpayments and clamps remaining debt to zero", () => {
    const model = buildFinanceDashboard(snapshot({
      orders: [{ id: "o", totale: 0.3, transactions: [{ importo: 0.1, data: at }, { importo: 0.2, data: at }] }],
      jobs: [{ id: "j" }],
      schedules: [{ id: "s", jobId: "j", payments: [{ id: "p", importo: 10, importoPagato: 15 }] }],
    }), now);
    expect(model.receivables).toHaveLength(0);
    expect(model.warnings.join(" ")).toContain("superiore");
  });

  it("does not infer print-shop receipts from production authorization", () => {
    const model = buildFinanceDashboard(snapshot({
      orders: [{ id: "print", orderType: "print_shop", totale: 100 }],
      movements: [{ id: "real", origine: "print_shop", importo: 10, data: at }],
    }), now);
    expect(model.receivables).toHaveLength(0);
    expect(model.ledger.map(e => e.amount)).toEqual([10]);
  });

  it("keeps laboratory charges, advances, and the running balance separate", () => {
    const model = buildFinanceDashboard(snapshot({
      jobs: [{
        id: "job-lab",
        nomeEvento: "Album matrimonio",
        costi: [{
          id: "job-lab-cost", importo: 80, data: at, descrizione: "Album",
          labId: "peppelab", labNome: "PeppeLab", labStatementId: "statement",
        }],
      }],
      movements: [{
        id: "advance", tipo: "uscita", importo: 50, data: at, metodoPagamento: "contante",
        pagamentoLaboratorio: {
          statementId: "statement", labId: "peppelab", labNome: "PeppeLab",
          statementNome: "OTTOBRE", saldoDopo: 140,
          jobIds: ["job-lab"], jobNomi: ["Album matrimonio"],
        },
      }],
      labStatements: [{
        id: "statement", labId: "peppelab", labNome: "PeppeLab",
        nome: "OTTOBRE", saldoResiduo: 140,
        lavori: [{
          jobId: "job-lab", jobNome: "Album matrimonio", costoId: "job-lab-cost",
          descrizione: "Album", importo: 80, stato: "consuntivo", data: at,
        }],
        costi: [{
          costoId: "delivery-cost", descrizione: "Spedizione", importo: 10,
          stato: "consuntivo", data: at,
        }],
      }],
    }), now);

    expect(model.ledger.filter((entry) => entry.direction === "expense").map((entry) => entry.amount)).toEqual([50]);
    expect(model.labCosts.map((cost) => [cost.jobId, cost.amount])).toEqual([["job-lab", 80], [undefined, 10]]);
    expect(model.labPayments.map((payment) => payment.amount)).toEqual([50]);
    expect(model.labBalances.map((balance) => balance.balance)).toEqual([140]);

    const later = filterFinanceDashboard(model, {
      from: new Date("2026-10-02T00:00:00Z"),
      to: new Date("2026-10-02T23:59:59Z"),
    });
    expect(later.labCosts).toHaveLength(0);
    expect(later.labPayments).toHaveLength(0);
    expect(later.labBalances).toHaveLength(1);
  });
});