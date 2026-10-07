import {
  collection,
  doc,
  getDocs,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import type { CashMovementFE } from "@shared/cash-types";
import type { Job } from "@shared/jobs-types";
import type {
  LabStatementJobCost,
  LabSupplierCharge,
  LabSupplierStatement,
  LabSupplierStatementFE,
  StatoCostoLaboratorio,
} from "@shared/lab-types";

const STATEMENTS = "labSupplierStatements";
const JOBS = "jobs";
const MOVEMENTS = "cashMovements";

export interface LabPaymentJobInput {
  jobId: string;
  jobNome: string;
  descrizione: string;
  importo: number;
  stato: StatoCostoLaboratorio;
}

export interface RecordLabPaymentInput {
  soloCosto?: boolean;
  movementId: string;
  labId: string;
  labNome: string;
  statementId?: string;
  newStatementId?: string;
  statementNome: string;
  saldoDopo: number;
  lavori: LabPaymentJobInput[];
  costiNonAttribuiti?: Array<{
    costoId: string;
    descrizione: string;
    importo: number;
    stato: StatoCostoLaboratorio;
  }>;
  importo: number;
  descrizione: string;
  data: Date;
  metodoPagamento: CashMovementFE["metodoPagamento"];
  note?: string;
}

function asDate(value: any): Date {
  if (value instanceof Date) return value;
  if (value && typeof value.toDate === "function") return value.toDate();
  if (value && typeof value.seconds === "number") return new Date(value.seconds * 1000);
  if (value && typeof value._seconds === "number") return new Date(value._seconds * 1000);
  return new Date(0);
}

export async function getLabSupplierStatements(): Promise<LabSupplierStatementFE[]> {
  const result = await getDocs(collection(db, STATEMENTS));
  return result.docs.map((snapshot) => {
    const value = snapshot.data() as Omit<LabSupplierStatement, "id">;
    return {
      ...value,
      id: snapshot.id,
      createdAt: asDate(value.createdAt),
      updatedAt: asDate(value.updatedAt),
      lavori: (value.lavori || []).map((line) => ({ ...line, data: asDate(line.data) })),
      costi: (value.costi || []).map((line) => ({ ...line, data: asDate(line.data) })),
    };
  }).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

export async function recordLabSupplierPayment(input: RecordLabPaymentInput) {
  const labId = input.labId.trim();
  const labNome = input.labNome.trim();
  const statementNome = input.statementNome.trim();
  const date = input.data;
  const cents = (value: number) => Math.round(value * 100);

  if (!labId || !labNome) throw new Error("Seleziona un laboratorio.");
  if (!statementNome) throw new Error("Dai un nome al conteggio del laboratorio.");
  if (!input.soloCosto && !input.movementId) throw new Error("Identificativo del pagamento mancante.");
  if (!input.soloCosto && (!Number.isFinite(input.importo) || cents(input.importo) <= 0))
    throw new Error("L’acconto deve essere maggiore di zero.");
  if (!Number.isFinite(input.saldoDopo) || cents(input.saldoDopo) < 0)
    throw new Error("Il residuo deve essere un importo valido, pari o superiore a zero.");
  if (!(date instanceof Date) || !Number.isFinite(date.getTime()))
    throw new Error("La data della registrazione non è valida.");
  if (input.lavori.length > 100) throw new Error("Un conteggio non può includere più di 100 Job.");
  if (input.soloCosto && input.lavori.length === 0 && !(input.costiNonAttribuiti?.length))
    throw new Error("Aggiungi almeno una spesa del laboratorio prima di registrarla.");
  if ((input.costiNonAttribuiti?.length || 0) > 100)
    throw new Error("Un conteggio non può includere più di 100 spese non attribuite.");

  const seenJobs = new Set<string>();
  for (const line of input.lavori) {
    if (!line.jobId || seenJobs.has(line.jobId)) throw new Error("Ogni Job può comparire una sola volta nel conteggio.");
    seenJobs.add(line.jobId);
    if (!line.descrizione.trim() || !Number.isFinite(line.importo) || cents(line.importo) <= 0)
      throw new Error(`Inserisci un costo maggiore di zero per ${line.jobNome || "ogni Job selezionato"}.`);
  }
  for (const line of input.costiNonAttribuiti || []) {
    if (!line.costoId || !line.descrizione.trim() || !Number.isFinite(line.importo) || cents(line.importo) <= 0)
      throw new Error("Inserisci descrizione e importo per ogni spesa non attribuita.");
  }

  const statementRef = input.statementId
    ? doc(db, STATEMENTS, input.statementId)
    : input.newStatementId
      ? doc(db, STATEMENTS, input.newStatementId)
      : doc(collection(db, STATEMENTS));
  const movementRef = input.soloCosto ? undefined : doc(db, MOVEMENTS, input.movementId);
  const paymentDate = Timestamp.fromDate(date);
  const newLines: LabStatementJobCost[] = input.lavori.map((line) => ({
    ...line,
    costoId: `lab_statement_${statementRef.id}_${line.jobId}`,
    jobNome: line.jobNome.trim(),
    descrizione: line.descrizione.trim(),
    importo: cents(line.importo) / 100,
    data: paymentDate,
  }));
  const newUnassignedCosts: LabSupplierCharge[] = (input.costiNonAttribuiti || []).map((line, index) => ({
    ...line,
    costoId: line.costoId.startsWith("draft_")
      ? `lab_statement_${statementRef.id}_expense_${paymentDate.toMillis()}_${index}`
      : line.costoId,
    descrizione: line.descrizione.trim(),
    importo: cents(line.importo) / 100,
    data: paymentDate,
  }));
  const jobIds = [...new Set(newLines.map((line) => line.jobId))];
  const jobRefs = jobIds.map((id) => doc(db, JOBS, id));
  const requestFingerprint = JSON.stringify({
    statementId: statementRef.id,
    labId,
    statementNome,
    saldoDopo: cents(input.saldoDopo),
    lavori: newLines.map(({ jobId, descrizione, importo, stato }) => ({ jobId, descrizione, importo, stato })),
    costi: newUnassignedCosts.map(({ costoId, descrizione, importo, stato }) => ({ costoId, descrizione, importo, stato })),
    importo: cents(input.importo),
    descrizione: input.descrizione.trim(),
    data: paymentDate.toMillis(),
    metodoPagamento: input.metodoPagamento,
    note: input.note?.trim() || "",
  });

  const alreadyRecorded = await runTransaction(db, async (transaction) => {
    const statementSnapshot = await transaction.get(statementRef);
    const movementSnapshot = movementRef ? await transaction.get(movementRef) : undefined;
    const jobSnapshots = await Promise.all(jobRefs.map((ref) => transaction.get(ref)));

    if (movementSnapshot?.exists()) {
      if (movementSnapshot.data().pagamentoLaboratorio?.requestFingerprint === requestFingerprint)
        return true;
      throw new Error("Questo pagamento risulta già registrato con dati diversi. Aggiorna il registro prima di riprovare.");
    }
    if (input.statementId && !statementSnapshot.exists())
      throw new Error("Il conteggio selezionato non esiste più. Aggiorna l’elenco e riprova.");

    const existing = statementSnapshot.exists()
      ? statementSnapshot.data() as Omit<LabSupplierStatement, "id">
      : undefined;
    if (existing && existing.labId !== labId)
      throw new Error("Il conteggio appartiene a un altro laboratorio.");

    const previousLines = existing?.lavori || [];
    const merged = new Map(previousLines.map((line) => [line.jobId, line]));
    for (const line of newLines) {
      const previous = merged.get(line.jobId);
      merged.set(line.jobId, {
        ...line,
        costoId: previous?.costoId || line.costoId,
        data: previous?.data || line.data,
      });
    }
    const allLines = [...merged.values()];
    const mergedExpenses = new Map((existing?.costi || []).map((line) => [line.costoId, line]));
    for (const line of newUnassignedCosts) {
      const previous = mergedExpenses.get(line.costoId);
      mergedExpenses.set(line.costoId, { ...line, data: previous?.data || line.data });
    }
    const snapshotsById = new Map(jobSnapshots.map((snapshot) => [snapshot.id, snapshot]));
    for (const line of allLines) {
      if (!snapshotsById.get(line.jobId)?.exists())
        throw new Error(`Il Job «${line.jobNome}» non è disponibile. Nessun dato è stato salvato.`);
    }

    const paymentMetadata = movementRef ? {
      statementId: statementRef.id,
      labId,
      labNome,
      statementNome,
      saldoDopo: cents(input.saldoDopo) / 100,
      jobIds: allLines.map((line) => line.jobId),
      jobNomi: allLines.map((line) => line.jobNome),
      requestFingerprint,
    } : undefined;

    transaction.set(statementRef, {
      labId,
      labNome,
      nome: statementNome,
      saldoResiduo: cents(input.saldoDopo) / 100,
      lavori: allLines,
      costi: [...mergedExpenses.values()],
      createdAt: existing?.createdAt || serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    for (const line of allLines) {
      const jobSnapshot = snapshotsById.get(line.jobId)!;
      const job = jobSnapshot.data() as Job;
      const currentCosts = job.costi || [];
      const index = currentCosts.findIndex((cost) =>
        cost.id === line.costoId || cost.labStatementId === statementRef.id,
      );
      const oldCost = index >= 0 ? currentCosts[index] : undefined;
      if (oldCost?.labStatementId && oldCost.labStatementId !== statementRef.id)
        throw new Error(`Il costo del Job «${line.jobNome}» è già collegato a un altro conteggio.`);

      const cost = {
        id: line.costoId,
        descrizione: line.descrizione,
        importo: line.importo,
        tipo: "fornitore" as const,
        data: oldCost?.data || line.data,
        note: `Conteggio laboratorio: ${statementNome}`,
        labId,
        labNome,
        statoLab: line.stato,
        labStatementId: statementRef.id,
        labStatementNome: statementNome,
        ...(oldCost?.cashMovementId ? { cashMovementId: oldCost.cashMovementId } : {}),
        ...(oldCost?.createdBy ? { createdBy: oldCost.createdBy } : {}),
      };
      const updatedCosts = [...currentCosts];
      if (index >= 0) updatedCosts[index] = cost;
      else updatedCosts.push(cost);
      transaction.update(jobSnapshot.ref, { costi: updatedCosts, updatedAt: serverTimestamp() });
    }

    if (movementRef) {
      transaction.set(movementRef, {
        tipo: "uscita",
        categoria: "Produzione stampe",
        importo: cents(input.importo) / 100,
        descrizione: input.descrizione.trim(),
        data: paymentDate,
        metodoPagamento: input.metodoPagamento,
        note: input.note?.trim() || "",
        origine: "manuale",
        pagamentoLaboratorio: paymentMetadata,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    return false;
  });

  return {
    statementId: statementRef.id,
    movementId: movementRef?.id,
    jobIds: jobIds,
    alreadyRecorded,
  };
}