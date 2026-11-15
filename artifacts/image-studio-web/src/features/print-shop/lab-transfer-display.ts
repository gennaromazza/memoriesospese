export type LabTransferDisplayStatus = 'pending' | 'running' | 'completed' | 'partial' | 'failed' | undefined;

export interface LabTransferDisplayInput {
  status?: LabTransferDisplayStatus;
  total?: number;
  transferred?: number;
  lastError?: string;
  failed?: Array<{ error?: string }>;
}

export interface LabTransferDisplay {
  label: string;
  total: number;
  transferred: number;
  percent: number;
  shouldPoll: boolean;
  canRetry: boolean;
  error?: string;
}

const TRANSFER_LABELS: Record<Exclude<LabTransferDisplayStatus, undefined>, string> = {
  pending: 'In attesa del trasferimento',
  running: 'Trasferimento in corso',
  completed: 'Trasferimento completato',
  partial: 'Trasferimento incompleto',
  failed: 'Trasferimento non riuscito',
};

export function labTransferDisplay(transfer?: LabTransferDisplayInput): LabTransferDisplay {
  const status = transfer?.status;
  const total = Number.isFinite(transfer?.total) ? Math.max(0, Math.floor(transfer!.total!)) : 0;
  const transferred = Number.isFinite(transfer?.transferred)
    ? Math.min(total, Math.max(0, Math.floor(transfer!.transferred!)))
    : 0;
  const percent = status === 'completed'
    ? 100
    : total > 0
      ? Math.round((transferred / total) * 100)
      : 0;
  const detail = transfer?.lastError?.trim() ||
    transfer?.failed?.find((entry) => entry.error?.trim())?.error?.trim();

  return {
    label: status ? TRANSFER_LABELS[status] : 'Stato trasferimento non disponibile',
    total,
    transferred,
    percent,
    shouldPoll: status === 'pending' || status === 'running',
    canRetry: status === 'failed' || status === 'partial',
    ...(detail ? { error: detail } : {}),
  };
}
