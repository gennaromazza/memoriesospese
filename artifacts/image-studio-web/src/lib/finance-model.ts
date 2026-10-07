import type {
  FinanceCampaign, FinanceDashboard, FinanceDocument, FinanceFilter,
  FinanceLedgerEntry, FinanceReceivable, FinanceSnapshot, FinanceTransaction,
} from "./finance-types";

const cents = (value: number) => Math.round(value * 100);
const money = (value: number) => cents(value) / 100;
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const cancelled = (item?: FinanceDocument) =>
  ["annullato", "annullata", "cancellato", "cancellata"].includes(item?.status ?? item?.stato ?? "");

export function financeDate(value: unknown): Date | null {
  let result: Date | null = null;
  if (value instanceof Date) result = new Date(value);
  else if (typeof value === "string" && value.trim()) result = new Date(value);
  else if (value && typeof value === "object") {
    if ("toDate" in value && typeof value.toDate === "function") {
      try { result = value.toDate(); } catch { return null; }
    } else {
      const seconds = "seconds" in value ? value.seconds : "_seconds" in value ? value._seconds : undefined;
      if (finite(seconds)) result = new Date(seconds * 1000);
    }
  }
  return result instanceof Date && Number.isFinite(result.getTime()) ? result : null;
}

const romeFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit",
});
export function financeDayKey(date: Date): string {
  const parts = romeFormatter.formatToParts(date);
  const part = (name: string) => parts.find(p => p.type === name)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
const inputDayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export function inFinancePeriod(date: Date | null, filter: FinanceFilter): boolean {
  if (!filter.from && !filter.to) return true;
  if (!date) return false;
  const key = financeDayKey(date);
  return (!filter.from || key >= inputDayKey(filter.from)) &&
    (!filter.to || key <= inputDayKey(filter.to));
}

const sum = (entries: FinanceLedgerEntry[], direction: "income" | "expense") =>
  entries.reduce((total, entry) => total + (entry.direction === direction ? cents(entry.amount) : 0), 0) / 100;

/** All inputs are read-only. Identity links take precedence over copied representations. */
export function buildFinanceDashboard(snapshot: FinanceSnapshot, now = new Date()): FinanceDashboard {
  const warnings = new Set<string>();
  const jobs = new Map(snapshot.jobs.map(j => [j.id, j]));
  const orders = new Map(snapshot.orders.filter(o => o.orderType !== "print_shop").map(o => [o.id, o]));
  const bookings = new Map(snapshot.bookings.map(b => [b.id, b]));
  const clients = new Map(snapshot.clients.map(c => [c.id, c]));
  const plans = new Map(snapshot.schedules.map(s => [s.id, s]));
  const jobByOrder = new Map<string, FinanceDocument>();
  for (const job of snapshot.jobs) for (const id of job.orderIds ?? []) jobByOrder.set(id, job);
  for (const order of orders.values()) if (order.jobId && jobs.has(order.jobId)) jobByOrder.set(order.id, jobs.get(order.jobId)!);
  for (const schedule of snapshot.schedules) {
    if (schedule.orderId && schedule.jobId && jobs.has(schedule.jobId))
      jobByOrder.set(schedule.orderId, jobs.get(schedule.jobId)!);
  }

  const relationships = (item: FinanceDocument, kind?: "order" | "booking" | "job") => {
    const plan = item.sourceType === "payment-schedule" && item.sourceId ? plans.get(item.sourceId) : undefined;
    const orderId = kind === "order" ? item.id : item.orderId || plan?.orderId ||
      (item.origine === "walk-in" ? item.origineRef : undefined);
    const order = orderId ? orders.get(orderId) : undefined;
    const jobId = kind === "job" ? item.id : item.jobId || plan?.jobId ||
      (item.origine === "job" ? item.origineRef : undefined) || (orderId ? jobByOrder.get(orderId)?.id : undefined);
    const job = jobId ? jobs.get(jobId) : undefined;
    const bookingId = kind === "booking" ? item.id : item.bookingId ||
      (item.origine === "booking" ? item.origineRef : undefined) || order?.bookingId || job?.bookingId;
    const booking = bookingId ? bookings.get(bookingId) : undefined;
    const clientId = item.clienteId || order?.clienteId || job?.clienteId || job?.clientiIds?.[0] || booking?.clienteId;
    const client = clientId ? clients.get(clientId) : undefined;
    const customer = [booking?.cliente?.nome, booking?.cliente?.cognome].filter(Boolean).join(" ") ||
      order?.nomeCliente || job?.clientNames?.join(", ") ||
      [client?.nome, client?.cognome].filter(Boolean).join(" ") ||
      item.nomeCliente || [item.cliente?.nome, item.cliente?.cognome].filter(Boolean).join(" ") || "Cliente non associato";
    const campaignId = booking?.campaignId || item.campaignId;
    return {
      orderId, jobId, bookingId, campaignId, customer,
      source: campaignId || bookingId ? "booking" as const :
        jobId ? "job" as const :
        item.origine === "print_shop" || item.origineTema === "print_shop" ? "print_shop" as const :
        orderId ? "walk-in" as const : item.origine ?? "manuale" as const,
    };
  };

  const ledger: FinanceLedgerEntry[] = [];
  const cashById = new Map<string, FinanceLedgerEntry>();
  for (const movement of snapshot.movements) {
    if (movement.tipo !== "entrata" && movement.tipo !== "uscita") {
      warnings.add(`Movimento ${movement.id}: entrata o uscita non specificata; non incluso nei totali.`);
      continue;
    }
    if (!finite(movement.importo) || movement.importo === 0) {
      warnings.add(`Movimento ${movement.id}: importo assente o non valido.`);
      continue;
    }
    const date = financeDate(movement.data);
    if (!date) warnings.add(`Movimento ${movement.id}: data mancante o non valida, non attribuita a oggi.`);
    const row: FinanceLedgerEntry = {
      ...relationships(movement), id: `cash:${movement.id}`, date,
      amount: money(Math.abs(movement.importo)),
      direction: movement.tipo === "uscita" || movement.importo < 0 ? "expense" : "income",
      kind: movement.tipo === "uscita" || movement.importo < 0
        ? /^(rimborso|storno)/i.test(movement.categoria || movement.descrizione || "") ? "refund" : "expense"
        : "receipt",
      description: movement.descrizione || "Movimento di cassa",
      method: movement.metodoPagamento || "Non registrato",
      references: [`cassa/${movement.id}`],
    };
    if (row.source === "booking" && !row.campaignId)
      warnings.add(`Movimento ${movement.id}: campagna non associata, escluso dai rendiconti per campagna.`);
    ledger.push(row);
    cashById.set(movement.id, row);
  }

  // Match identical copies only inside a proven entity relationship. Each copy
  // consumes one candidate, so two equal genuine installments are not collapsed.
  const matching = (row: FinanceLedgerEntry, t: FinanceTransaction, direction: "income" | "expense") => {
    const date = financeDate(t.data);
    return date && row.date && row.date.getTime() === date.getTime() &&
      cents(row.amount) === cents(Math.abs(t.importo)) && row.direction === direction &&
      row.method === (t.metodo || t.metodoPagamento || "Non registrato");
  };
  const addTransactions = (entity: FinanceDocument, kind: "order" | "booking") => {
    const rel = relationships(entity, kind);
    const consumed = new Set<string>();
    for (const [index, transaction] of (entity.transactions ?? []).entries()) {
      if (!finite(transaction.importo) || !transaction.importo) {
        warnings.add(`${kind} ${entity.id}: transazione ${index + 1} con importo non valido.`);
        continue;
      }
      const direction = transaction.importo < 0 || transaction.tipo === "rimborso" ? "expense" : "income";
      const reference = `${kind}/${entity.id}/transazione/${index + 1}`;
      let mirror = transaction.cashMovementId ? cashById.get(transaction.cashMovementId) : undefined;
      if (!mirror) {
        mirror = ledger.find(row => !consumed.has(row.id) &&
          (kind === "order" ? row.orderId === entity.id ||
            (!row.orderId && !!rel.bookingId && row.bookingId === rel.bookingId) :
            row.bookingId === entity.id && !row.references.some(ref => ref.startsWith(`booking/${entity.id}/`))) &&
          matching(row, transaction, direction));
      }
      if (mirror) {
        consumed.add(mirror.id);
        mirror.references.push(reference);
        // Legacy movements may carry only origineRef. Enrich from authoritative links.
        mirror.orderId ||= rel.orderId;
        mirror.jobId ||= rel.jobId;
        mirror.bookingId ||= rel.bookingId;
        mirror.campaignId ||= rel.campaignId;
        if (transaction.tipo === "rimborso" || transaction.importo < 0) mirror.kind = "refund";
        if (rel.campaignId) mirror.source = "booking";
        if (mirror.customer === "Cliente non associato") mirror.customer = rel.customer;
        if (cents(mirror.amount) !== cents(Math.abs(transaction.importo)))
          warnings.add(`${reference}: importo diverso dal movimento collegato; usato il valore della cassa.`);
        continue;
      }
      if (transaction.cashMovementId)
        warnings.add(`${reference}: movimento di cassa collegato non trovato; usata la transazione registrata.`);
      const date = financeDate(transaction.data);
      if (!date) warnings.add(`${reference}: data del pagamento non disponibile.`);
      ledger.push({
        ...rel, id: `${kind}:${entity.id}:${index}`, date, direction,
        kind: direction === "income" ? "receipt" : "refund",
        amount: money(Math.abs(transaction.importo)),
        description: `${transaction.tipo || "Pagamento"} · ${entity.nomeCliente || entity.nomeEvento || (kind === "booking" ? "Prenotazione" : "Ordine")}`,
        method: transaction.metodo || transaction.metodoPagamento || "Non registrato",
        references: [reference],
      });
    }
  };
  for (const order of orders.values()) addTransactions(order, "order");
  for (const booking of bookings.values()) addTransactions(booking, "booking");

  const receivables: FinanceReceivable[] = [];
  const scheduledJobs = new Set<string>();
  const scheduledOrders = new Set<string>();
  const scheduledBookings = new Set<string>();
  const pushReceivable = (row: Omit<FinanceReceivable, "status">) => {
    if (cents(row.amount) <= 0) return;
    receivables.push({
      ...row, amount: money(row.amount),
      status: !row.date ? "undated" : financeDayKey(row.date) < financeDayKey(now) ? "overdue" : "future",
    });
  };
  for (const schedule of snapshot.schedules) {
    const rel = relationships(schedule);
    if (schedule.jobId) scheduledJobs.add(schedule.jobId);
    if (schedule.orderId) scheduledOrders.add(schedule.orderId);
    if (rel.bookingId) scheduledBookings.add(rel.bookingId);
    const job = schedule.jobId ? jobs.get(schedule.jobId) : undefined;
    if (!job) warnings.add(`Piano ${schedule.id}: lavoro non trovato, associazione da verificare.`);
    let computedRemaining = 0;
    for (const [index, payment] of (schedule.payments ?? []).entries()) {
      if (!finite(payment.importo) || payment.importo < 0) {
        warnings.add(`Piano ${schedule.id}: importo della rata ${index + 1} non valido.`);
        continue;
      }
      const paid = finite(payment.importoPagato) ? Math.max(0, payment.importoPagato) : 0;
      if (cents(paid) > cents(payment.importo))
        warnings.add(`Piano ${schedule.id}: rata con incasso superiore all’importo concordato.`);
      const nominalRemaining = Math.max(0, payment.importo - paid);
      if (payment.stato === "pagato" && nominalRemaining > 0 && !finite(payment.importoPagato)) {
        warnings.add(`Piano ${schedule.id}: rata pagata senza importo ricevuto documentato.`);
      } else {
        computedRemaining += nominalRemaining;
        if (!cancelled(job) && !cancelled(schedule) && !cancelled(rel.bookingId ? bookings.get(rel.bookingId) : undefined)) {
          pushReceivable({
            ...rel, id: `schedule:${schedule.id}:${payment.id || index}`,
            date: financeDate(payment.dataScadenza), amount: nominalRemaining, scheduled: true,
            paymentType: payment.tipo,
            label: job?.nomeEvento || job?.jobType || `Lavoro ${schedule.jobId || schedule.id}`,
          });
          if (payment.stato === "pagato" && nominalRemaining > 0)
            warnings.add(`Piano ${schedule.id}: stato pagato incoerente con il residuo della rata.`);
        }
      }
      if (!paid) continue;
      const movementIds = snapshot.movements.filter(m =>
        (m.sourceId === schedule.id && !!payment.id && m.paymentId === payment.id) ||
        m.id === payment.cashMovementId).map(m => m.id);
      const linked = new Set(movementIds.map(id => cashById.get(id)).filter((r): r is FinanceLedgerEntry => !!r));
      // Some legacy plans link directly to an order transaction instead.
      for (const row of ledger) {
        const explicitOrderRef = payment.orderTransactionId &&
          orders.get(schedule.orderId || "")?.transactions?.some((t, i) =>
            (t.id === payment.orderTransactionId || t.transactionId === payment.orderTransactionId) &&
            row.references.includes(`order/${schedule.orderId}/transazione/${i + 1}`));
        if (explicitOrderRef) linked.add(row);
      }
      if (!linked.size && schedule.orderId) {
        const mirror = ledger.find(row => row.orderId === schedule.orderId &&
          matching(row, { importo: paid, data: payment.dataPagamento, metodo: payment.metodoPagamento }, "income"));
        if (mirror) linked.add(mirror);
      }
      for (const row of linked) {
        row.references.push(`piano/${schedule.id}/rata/${payment.id || index}`);
        row.jobId ||= rel.jobId;
        row.orderId ||= rel.orderId;
        row.bookingId ||= rel.bookingId;
        row.campaignId ||= rel.campaignId;
        row.source = rel.source;
        if (row.customer === "Cliente non associato") row.customer = rel.customer;
      }
      const known = sum([...linked], "income");
      if (cents(paid) > cents(known)) {
        const ambiguousHistory = ledger.some(row => row.direction === "income" && !linked.has(row) &&
          !row.references.some(ref => ref.startsWith("piano/")) &&
          ((!!rel.orderId && row.orderId === rel.orderId) || (!!rel.jobId && row.jobId === rel.jobId)));
        if (ambiguousHistory) {
          warnings.add(`Piano ${schedule.id}: incassi storici non collegati alla rata; nessun importo aggiunto per evitare duplicazioni.`);
          continue;
        }
        // dataPagamento is the last payment date, not a reliable history of
        // cumulative partial receipts. Never assign the entire remainder to it.
        const missing = money(paid - known);
        warnings.add(`Piano ${schedule.id}: €${missing.toFixed(2)} ricevuti senza cronologia completa di cassa; mostrati senza data.`);
        ledger.push({
          ...rel, id: `schedule-receipt:${schedule.id}:${payment.id || index}`,
          date: null, amount: missing, direction: "income", kind: "receipt",
          description: `Incasso registrato in piano · ${job?.nomeEvento || schedule.jobId || schedule.id}`,
          method: payment.metodoPagamento || "Non registrato",
          references: [`piano/${schedule.id}/rata/${payment.id || index}`],
        });
      } else if (cents(known) > cents(paid)) {
        warnings.add(`Piano ${schedule.id}: incassi in cassa superiori all’importo ricevuto della rata; da riconciliare.`);
      }
    }
    if (finite(schedule.saldoResiduo) && cents(schedule.saldoResiduo) !== cents(computedRemaining))
      warnings.add(`Piano ${schedule.id}: saldo riepilogativo diverso dalla somma dei residui delle rate.`);
  }

  for (const job of snapshot.jobs) for (const [index, cost] of (job.costi ?? []).entries()) {
    if (!finite(cost.importo) || cost.importo <= 0) continue;
    // Conteggio and cash payment are separate views: the payment remains in
    // the cash ledger, while the supplier cost is reported in the lab panel.
    if (cost.labStatementId) continue;
    const mirror = cost.cashMovementId ? cashById.get(cost.cashMovementId) :
      ledger.find(row => row.references.some(ref => {
        const id = ref.startsWith("cassa/") ? ref.slice(6) : "";
        return snapshot.movements.some(m => m.id === id && m.jobId === job.id && m.jobCostId === cost.id);
      }));
    if (mirror) { mirror.kind = "cost"; mirror.references.push(`lavoro/${job.id}/costo/${cost.id || index}`); continue; }
    ledger.push({
      ...relationships(job, "job"), id: `cost:${job.id}:${cost.id || index}`,
      date: financeDate(cost.data), amount: money(cost.importo), direction: "expense", kind: "cost",
      description: `Costo lavoro · ${cost.descrizione || job.nomeEvento || job.id}`,
      method: "Non registrato", references: [`lavoro/${job.id}/costo/${cost.id || index}`],
    });
  }

  const collected = (predicate: (entry: FinanceLedgerEntry) => boolean) =>
    sum(ledger.filter(predicate), "income");
  for (const order of orders.values()) {
    const rel = relationships(order, "order");
    if (cancelled(order) || cancelled(rel.jobId ? jobs.get(rel.jobId) : undefined) ||
        cancelled(rel.bookingId ? bookings.get(rel.bookingId) : undefined) ||
        scheduledOrders.has(order.id) || (rel.jobId && scheduledJobs.has(rel.jobId))) continue;
    if (!finite(order.totale)) { warnings.add(`Ordine ${order.id}: totale concordato non disponibile.`); continue; }
    if (cents(collected(e => e.orderId === order.id)) > cents(order.totale))
      warnings.add(`Ordine ${order.id}: incassi superiori al totale concordato.`);
    // Booking totals are handled once below, even when mirrored by linked orders.
    if (rel.bookingId) continue;
    pushReceivable({
      ...rel, id: `order:${order.id}`, amount: Math.max(0, order.totale - collected(e => e.orderId === order.id)),
      date: financeDate(order.dataServizio), scheduled: false, label: order.nomeCliente || `Ordine ${order.id}`,
    });
  }
  const agreedByBooking = new Map<string, number>();
  for (const booking of bookings.values()) {
    const linkedOrders = [...orders.values()].filter(o => o.bookingId === booking.id && !cancelled(o));
    const agreed = linkedOrders.length ? linkedOrders.reduce((total, order) => total + (finite(order.totale) ? cents(order.totale) : 0), 0) / 100 :
      finite(booking.totale) ? money(booking.totale) : undefined;
    if (linkedOrders.some(order => !finite(order.totale))) warnings.add(`Prenotazione ${booking.id}: un ordine collegato non ha un totale documentato.`);
    if (agreed === undefined) warnings.add(`Prenotazione ${booking.id}: valore concordato non disponibile; non ricalcolato dal listino attuale.`);
    if (cancelled(booking)) continue;
    if (booking.stato !== "confermata" && !linkedOrders.some(o => o.stato === "in_lavorazione" || o.stato === "completato")) continue;
    if (agreed !== undefined) agreedByBooking.set(booking.id, agreed);
    if (scheduledBookings.has(booking.id) || agreed === undefined) continue;
    const linkedScheduledJob = snapshot.jobs.some(j => j.bookingId === booking.id && scheduledJobs.has(j.id));
    if (linkedScheduledJob) continue;
    pushReceivable({
      ...relationships(booking, "booking"), id: `booking:${booking.id}`,
      amount: Math.max(0, agreed - collected(e => e.bookingId === booking.id)),
      date: financeDate(booking.dataShootingInizio), scheduled: false,
      label: `Prenotazione ${booking.id}`,
    });
  }
  for (const job of snapshot.jobs) {
    if (cancelled(job) || scheduledJobs.has(job.id) ||
        [...orders.keys()].some(id => jobByOrder.get(id)?.id === job.id) || job.bookingId) continue;
    const balance = finite(job.saldoResiduo) ? job.saldoResiduo : job.financials?.saldoResiduo;
    if (finite(balance) && balance > 0) pushReceivable({
      ...relationships(job, "job"), id: `job:${job.id}`, date: null, amount: balance,
      scheduled: false, label: job.nomeEvento || `Lavoro ${job.id}`,
    });
  }

  const campaignMap = new Map(snapshot.campaigns.map(c => [c.id, c.nome || c.id]));
  for (const booking of bookings.values()) if (booking.campaignId && !campaignMap.has(booking.campaignId)) {
    campaignMap.set(booking.campaignId, `Campagna non disponibile (${booking.campaignId})`);
    warnings.add(`Campagna ${booking.campaignId}: scheda non disponibile, mantenuti i riferimenti storici.`);
  }
  const campaigns: FinanceCampaign[] = [...campaignMap].map(([id, name]) => {
    const entries = ledger.filter(e => e.campaignId === id);
    const dues = receivables.filter(e => e.campaignId === id);
    const related = [...bookings.values()].filter(b => b.campaignId === id);
    const income = sum(entries, "income");
    const expenses = sum(entries, "expense");
    return {
      id, name, bookings: related.length,
      agreed: related.reduce((total, b) => total + cents(agreedByBooking.get(b.id) || 0), 0) / 100,
      income, expenses, net: money(income - expenses),
      outstanding: dues.reduce((total, d) => total + cents(d.amount), 0) / 100,
      entries, receivables: dues,
    };
  });
  const labCosts = snapshot.labStatements.flatMap((statement) => {
    if (!statement.labId || !statement.labNome) return [];
    const lines = [...(statement.lavori || []), ...(statement.costi || [])];
    return lines.flatMap((cost, index) => {
      if (!finite(cost.importo) || cost.importo <= 0) return [];
      return [{
        id: `lab-cost:${statement.id}:${cost.costoId || index}`,
        labId: statement.labId!,
        labName: statement.labNome!,
        jobId: cost.jobId || undefined,
        jobName: cost.jobNome || "Non attribuito",
        description: cost.descrizione || "Costo laboratorio",
        amount: money(cost.importo),
        date: financeDate(cost.data),
        status: cost.stato === "stima" ? "stima" as const : "consuntivo" as const,
        statementId: statement.id,
        statementName: statement.nome,
      }];
    });
  });
  const labPayments = snapshot.movements.flatMap((movement) => {
    const payment = movement.pagamentoLaboratorio;
    if (!payment || movement.tipo !== "uscita" || !finite(movement.importo) || movement.importo <= 0) return [];
    return [{
      id: movement.id,
      labId: payment.labId,
      labName: payment.labNome,
      statementId: payment.statementId,
      statementName: payment.statementNome,
      date: financeDate(movement.data),
      amount: money(movement.importo),
      method: movement.metodoPagamento || "Non registrato",
      balanceAfter: finite(payment.saldoDopo) ? money(payment.saldoDopo) : 0,
      jobIds: payment.jobIds || [],
      jobNames: payment.jobNomi || [],
    }];
  });
  const labBalances = snapshot.labStatements.flatMap((statement) => {
    if (!statement.labId || !statement.labNome || !finite(statement.saldoResiduo) || statement.saldoResiduo < 0) return [];
    const jobsInStatement = statement.lavori || [];
    return [{
      id: statement.id,
      labId: statement.labId,
      labName: statement.labNome,
      statementName: statement.nome || `Conteggio ${statement.id}`,
      balance: money(statement.saldoResiduo),
      jobIds: jobsInStatement.flatMap((line) => line.jobId ? [line.jobId] : []),
      jobNames: jobsInStatement.flatMap((line) => line.jobId ? [line.jobNome || line.jobId] : []),
    }];
  });
  for (const row of ledger) if (!row.date)
    warnings.add("Sono presenti registrazioni senza data: restano nel totale storico, ma non sono attribuite a un periodo.");
  return {
    ledger: ledger.sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0)),
    receivables: receivables.sort((a, b) => (a.date?.getTime() ?? Infinity) - (b.date?.getTime() ?? Infinity)),
    campaigns, labCosts, labPayments, labBalances, warnings: [...warnings], updatedAt: now,
  };
}

export function filterFinanceDashboard(data: FinanceDashboard, filter: FinanceFilter): FinanceDashboard {
  const scope = (entry: { campaignId?: string; source: string }) =>
    (!filter.campaignId || entry.campaignId === filter.campaignId) && (!filter.source || entry.source === filter.source);
  const ledger = data.ledger.filter(e => scope(e) && inFinancePeriod(e.date, filter));
  const receivables = data.receivables.filter(e => scope(e) && inFinancePeriod(e.date, filter));
  const warnings = [...data.warnings];
  const unknown = data.ledger.filter(e => scope(e) && !e.date).length;
  if (unknown && (filter.from || filter.to))
    warnings.push(`${unknown} registrazioni senza data escluse dal periodo: consultare lo storico completo.`);
  return {
    ...data, ledger, receivables, warnings,
    labCosts: data.labCosts.filter((cost) => inFinancePeriod(cost.date, filter)),
    labPayments: data.labPayments.filter((payment) => inFinancePeriod(payment.date, filter)),
    campaigns: data.campaigns.filter(c => (!filter.campaignId || c.id === filter.campaignId) &&
      (!filter.source || filter.source === "booking")).map(c => {
      const entries = ledger.filter(e => e.campaignId === c.id);
      const income = sum(entries, "income");
      const expenses = sum(entries, "expense");
      return { ...c, entries, income, expenses, net: money(income - expenses) };
    }),
  };
}