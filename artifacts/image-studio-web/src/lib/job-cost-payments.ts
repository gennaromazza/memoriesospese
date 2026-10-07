import {
  collection,
  deleteField,
  doc,
  runTransaction,
  Timestamp,
} from 'firebase/firestore';
import type { CashMovementFE, InsertCashMovement } from '@shared/cash-types';
import type { CostoLavoro, Job } from '@shared/jobs-types';
import { db } from '@/lib/firebase';

type DateLike = Date | string | number | { toDate?: () => Date; seconds?: number; _seconds?: number } | null | undefined;

function asDate(value: DateLike): Date | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (value && typeof value === 'object') {
    if (typeof value.toDate === 'function') return asDate(value.toDate());
    const seconds = value.seconds ?? value._seconds;
    if (typeof seconds === 'number') return new Date(seconds * 1000);
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }
  return null;
}

function italyDateKey(value: DateLike): string | null {
  const date = asDate(value);
  if (!date) return null;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  const year = part('year');
  const month = part('month');
  const day = part('day');
  return year && month && day ? `${year}-${month}-${day}` : null;
}

function cents(value: number): number {
  return Math.round(value * 100);
}

export function isSameVerifiedPaymentCandidate(
  cost: Pick<CostoLavoro, 'importo' | 'data'>,
  movement: Pick<CashMovementFE, 'tipo' | 'importo' | 'data'>,
): boolean {
  const costDate = italyDateKey(cost.data as DateLike);
  const movementDate = italyDateKey(movement.data as DateLike);
  return movement.tipo === 'uscita' &&
    Number.isFinite(cost.importo) &&
    Number.isFinite(movement.importo) &&
    cents(cost.importo) === cents(movement.importo) &&
    !!costDate &&
    costDate === movementDate;
}

export function isJobCostCoveredByCashMovement(
  jobId: string,
  cost: Pick<CostoLavoro, 'id' | 'cashMovementId'>,
  movements: Pick<CashMovementFE, 'id' | 'tipo' | 'jobId' | 'jobCostId' | 'jobCostAssociation'>[],
): boolean {
  return movements.some((movement) => movement.tipo === 'uscita' && (
    (!!cost.cashMovementId && movement.id === cost.cashMovementId) ||
    (!!cost.id && movement.jobId === jobId && movement.jobCostId === cost.id) ||
    (!!cost.id &&
      movement.jobCostAssociation?.jobId === jobId &&
      movement.jobCostAssociation.jobCostId === cost.id)
  ));
}

export interface JobCostCashLink {
  jobId: string;
  jobName: string;
  jobCostId: string;
  jobCostDescription: string;
  verified: boolean;
}

/**
 * Riconosce un costo Job abbinato al movimento sia dai nuovi metadati
 * bidirezionali sia dai collegamenti storici presenti solo su uno dei due documenti.
 */
export function getCashMovementJobCostLinks(
  movement: Pick<CashMovementFE, 'id' | 'jobId' | 'jobCostId' | 'jobCostAssociation'>,
  jobs: Pick<Job, 'id' | 'nomeEvento' | 'costi'>[] = [],
): JobCostCashLink[] {
  const links = new Map<string, JobCostCashLink>();
  const addLink = (link: JobCostCashLink) => {
    const key = `${link.jobId}:${link.jobCostId}`;
    links.set(key, { ...links.get(key), ...link });
  };
  const association = movement.jobCostAssociation;

  if (association?.jobId && association.jobCostId) {
    addLink({
      jobId: association.jobId,
      jobName: association.jobName || association.jobId,
      jobCostId: association.jobCostId,
      jobCostDescription: association.jobCostDescription || '',
      verified: true,
    });
  }

  if (movement.jobId && movement.jobCostId) {
    addLink({
      jobId: movement.jobId,
      jobName: movement.jobId,
      jobCostId: movement.jobCostId,
      jobCostDescription: '',
      verified: false,
    });
  }

  for (const job of jobs) {
    for (const cost of job.costi || []) {
      const linkedByCost = cost.cashMovementId === movement.id;
      const linkedByLegacyFields = movement.jobId === job.id && movement.jobCostId === cost.id;
      const linkedByAssociation = association?.jobId === job.id && association.jobCostId === cost.id;
      if (!linkedByCost && !linkedByLegacyFields && !linkedByAssociation) continue;

      addLink({
        jobId: job.id,
        jobName: job.nomeEvento || job.id,
        jobCostId: cost.id,
        jobCostDescription: cost.descrizione || '',
        verified: Boolean(cost.pagamentoVerificato || linkedByAssociation),
      });
    }
  }

  return [...links.values()];
}

export function hasJobCostPaymentFinancialChanges(
  current: Pick<CashMovementFE, 'tipo' | 'importo' | 'data'>,
  next: Pick<InsertCashMovement, 'tipo' | 'importo' | 'data'>,
): boolean {
  return current.tipo !== next.tipo ||
    current.importo !== next.importo ||
    current.data.getTime() !== next.data.getTime();
}

export interface LinkJobCostPaymentInput {
  jobId: string;
  jobCostId: string;
  cashMovementId: string;
  supplierName: string;
  evidenceReference: string;
  verifiedBy: string;
}

export async function linkJobCostPayment(input: LinkJobCostPaymentInput): Promise<void> {
  const supplierName = input.supplierName.trim();
  const evidenceReference = input.evidenceReference.trim();
  if (!supplierName) throw new Error('Indica il fornitore verificato.');
  if (!evidenceReference) throw new Error('Indica il riferimento del documento verificato.');
  if (!input.verifiedBy) throw new Error('Utente amministratore non disponibile.');

  const jobRef = doc(collection(db, 'jobs'), input.jobId);
  const movementRef = doc(collection(db, 'cashMovements'), input.cashMovementId);

  await runTransaction(db, async (transaction) => {
    const [jobSnapshot, movementSnapshot] = await Promise.all([
      transaction.get(jobRef),
      transaction.get(movementRef),
    ]);
    if (!jobSnapshot.exists()) throw new Error('Lavoro non trovato.');
    if (!movementSnapshot.exists()) throw new Error('Pagamento non trovato; aggiorna l’elenco e riprova.');

    const job = jobSnapshot.data() as Job;
    const movement = { id: movementSnapshot.id, ...movementSnapshot.data() } as CashMovementFE;
    const costs = Array.isArray(job.costi) ? job.costi : [];
    const cost = costs.find((candidate) => candidate.id === input.jobCostId);
    if (!cost) throw new Error('Costo non trovato; aggiorna la pagina e riprova.');
    if (cost.cashMovementId || cost.pagamentoVerificato) {
      throw new Error('Questo costo ha già un pagamento collegato.');
    }
    if (movement.jobCostAssociation) {
      throw new Error('Questo movimento è già abbinato a un altro costo.');
    }
    if (movement.jobId && movement.jobId !== input.jobId) {
      throw new Error('Questo movimento risulta già associato a un altro lavoro.');
    }
    if (!isSameVerifiedPaymentCandidate(cost, movement)) {
      throw new Error('Data o importo del movimento non coincidono più con il costo.');
    }

    const paymentDate = asDate(movementSnapshot.data().data);
    if (!paymentDate) throw new Error('Il movimento non ha una data di pagamento verificabile.');
    const verifiedAt = Timestamp.now();
    const association = {
      jobId: input.jobId,
      jobName: job.nomeEvento || input.jobId,
      jobCostId: cost.id,
      jobCostDescription: cost.descrizione,
      supplierName,
      ...(cost.labId ? { supplierLabId: cost.labId } : {}),
      ...(cost.labNome ? { supplierLabName: cost.labNome } : {}),
      paymentDate: Timestamp.fromDate(paymentDate),
      paymentAmount: movement.importo,
      evidenceReference,
      verifiedAt,
      verifiedBy: input.verifiedBy,
    };

    transaction.update(jobRef, {
      costi: costs.map((candidate) => candidate.id === cost.id
        ? { ...candidate, cashMovementId: movement.id, pagamentoVerificato: association }
        : candidate),
      updatedAt: verifiedAt,
    });
    transaction.update(movementRef, {
      jobCostAssociation: association,
      updatedAt: verifiedAt,
    });
  });
}

export interface UpdateLinkedJobCostPaymentInput {
  jobId: string;
  jobCostId: string;
  cashMovementId: string;
  data: Partial<InsertCashMovement>;
}

/**
 * Rimuove il collegamento al costo Job e aggiorna lo stesso movimento di cassa
 * in un'unica transazione, così non rimane una verifica riferita a data/importo
 * precedenti nemmeno se uno dei due aggiornamenti fallisce.
 */
export async function updateCashMovementAfterUnlinkingJobCostPayment(
  input: UpdateLinkedJobCostPaymentInput,
): Promise<void> {
  const jobRef = doc(collection(db, 'jobs'), input.jobId);
  const movementRef = doc(collection(db, 'cashMovements'), input.cashMovementId);

  await runTransaction(db, async (transaction) => {
    const [jobSnapshot, movementSnapshot] = await Promise.all([
      transaction.get(jobRef),
      transaction.get(movementRef),
    ]);
    if (!jobSnapshot.exists()) throw new Error('Lavoro non trovato; nessuna modifica è stata salvata.');
    if (!movementSnapshot.exists()) throw new Error('Movimento non trovato; aggiorna l’elenco e riprova.');

    const job = jobSnapshot.data() as Job;
    const movement = movementSnapshot.data();
    const costs = Array.isArray(job.costi) ? job.costi : [];
    const cost = costs.find((candidate) => candidate.id === input.jobCostId);
    if (!cost) throw new Error('Costo Job non trovato; aggiorna la pagina e riprova.');

    const association = movement.jobCostAssociation;
    const associationMatches = association?.jobId === input.jobId &&
      association?.jobCostId === input.jobCostId;
    const legacyFieldsMatch = movement.jobId === input.jobId &&
      movement.jobCostId === input.jobCostId;
    if (association && !associationMatches) {
      throw new Error('Il movimento è ora abbinato a un altro costo; nessuna modifica è stata salvata.');
    }
    if (cost.cashMovementId && cost.cashMovementId !== input.cashMovementId) {
      throw new Error('Il costo è ora collegato a un altro movimento; aggiorna la pagina e riprova.');
    }
    if (cost.pagamentoVerificato &&
        (cost.pagamentoVerificato.jobId !== input.jobId ||
         cost.pagamentoVerificato.jobCostId !== input.jobCostId)) {
      throw new Error('Il costo ha una verifica diversa; nessuna modifica è stata salvata.');
    }
    if (!associationMatches && !legacyFieldsMatch && cost.cashMovementId !== input.cashMovementId) {
      throw new Error('L’abbinamento è cambiato; aggiorna la pagina e riprova.');
    }

    const { cashMovementId: _cashMovementId, pagamentoVerificato: _pagamentoVerificato, ...unlinkedCost } = cost;
    const updatedAt = Timestamp.now();
    transaction.update(jobRef, {
      costi: costs.map((candidate) => candidate.id === input.jobCostId ? unlinkedCost : candidate),
      updatedAt,
    });

    const updateData: Record<string, unknown> = {
      ...Object.fromEntries(Object.entries(input.data).filter(([, value]) => value !== undefined)),
      updatedAt,
    };
    if (input.data.data) updateData.data = Timestamp.fromDate(input.data.data);
    if (associationMatches) updateData.jobCostAssociation = deleteField();
    if (legacyFieldsMatch) updateData.jobCostId = deleteField();
    transaction.update(movementRef, updateData);
  });
}

export async function unlinkJobCostPayment(
  jobId: string,
  jobCostId: string,
  cashMovementId: string,
): Promise<void> {
  const jobRef = doc(collection(db, 'jobs'), jobId);
  const movementRef = doc(collection(db, 'cashMovements'), cashMovementId);

  await runTransaction(db, async (transaction) => {
    const [jobSnapshot, movementSnapshot] = await Promise.all([
      transaction.get(jobRef),
      transaction.get(movementRef),
    ]);
    if (!jobSnapshot.exists()) throw new Error('Lavoro non trovato.');

    const job = jobSnapshot.data() as Job;
    const costs = Array.isArray(job.costi) ? job.costi : [];
    const cost = costs.find((candidate) => candidate.id === jobCostId);
    if (!cost || cost.cashMovementId !== cashMovementId) {
      throw new Error('L’abbinamento è cambiato; aggiorna la pagina e riprova.');
    }

    const movement = movementSnapshot.exists() ? movementSnapshot.data() : undefined;
    const movementAssociation = movement?.jobCostAssociation;
    if (movementAssociation &&
        (movementAssociation.jobId !== jobId || movementAssociation.jobCostId !== jobCostId)) {
      throw new Error('Il movimento è ora abbinato a un altro costo; nessuna modifica è stata salvata.');
    }

    const updatedAt = Timestamp.now();
    const { cashMovementId: _cashMovementId, pagamentoVerificato: _pagamentoVerificato, ...unlinkedCost } = cost;
    transaction.update(jobRef, {
      costi: costs.map((candidate) => candidate.id === jobCostId ? unlinkedCost : candidate),
      updatedAt,
    });
    const legacyFieldsMatch = movement?.jobId === jobId && movement.jobCostId === jobCostId;
    if (movementSnapshot.exists() && (movementAssociation || legacyFieldsMatch)) {
      transaction.update(movementRef, {
        ...(movementAssociation ? { jobCostAssociation: deleteField() } : {}),
        ...(legacyFieldsMatch ? { jobCostId: deleteField() } : {}),
        updatedAt,
      });
    }
  });
}