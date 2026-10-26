export interface DuplicateCampaignRecord {
  id: string;
  code: string;
  nome: string;
  attiva: boolean;
  dataInizio: string | null;
  dataFine: string | null;
  prenotazioni: number;
}

export interface DuplicateCampaignCodeGroup {
  code: string;
  campaigns: DuplicateCampaignRecord[];
}

interface CampaignDocument {
  id: string;
  data: Record<string, unknown>;
}

export function campaignLookupCode(document: CampaignDocument): string | null {
  const storedCode = typeof document.data.code === 'string' ? document.data.code.trim() : '';
  const value = storedCode || document.id;
  return /^[A-Za-z0-9]{1,8}$/.test(value) ? value : null;
}

function dateToIso(value: unknown): string | null {
  let date: Date | null = null;
  if (value instanceof Date) {
    date = value;
  } else if (typeof value === 'string' || typeof value === 'number') {
    date = new Date(value);
  } else if (value && typeof value === 'object' && typeof (value as { toDate?: unknown }).toDate === 'function') {
    try {
      date = (value as { toDate: () => Date }).toDate();
    } catch {
      return null;
    }
  }
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
}

export function findDuplicateCampaignCodes(
  documents: CampaignDocument[],
  bookingCounts: ReadonlyMap<string, number>,
): DuplicateCampaignCodeGroup[] {
  const groups = new Map<string, DuplicateCampaignRecord[]>();

  for (const document of documents) {
    const code = campaignLookupCode(document);
    if (!code) continue;
    const group = groups.get(code) ?? [];
    group.push({
      id: document.id,
      code,
      nome: typeof document.data.nome === 'string' && document.data.nome.trim()
        ? document.data.nome.trim()
        : 'Campagna senza nome',
      attiva: document.data.attiva === true,
      dataInizio: dateToIso(document.data.dataInizio),
      dataFine: dateToIso(document.data.dataFine),
      prenotazioni: bookingCounts.get(document.id) ?? 0,
    });
    groups.set(code, group);
  }

  return [...groups.entries()]
    .filter(([, campaigns]) => campaigns.length > 1)
    .sort(([codeA], [codeB]) => codeA.localeCompare(codeB, 'it'))
    .map(([code, campaigns]) => ({
      code,
      campaigns: campaigns.sort((a, b) => a.id.localeCompare(b.id)),
    }));
}
