export interface GalleryClient {
  id: string;
  nome?: string;
  cognome?: string;
  name?: string;
  email?: string;
}

export interface GalleryJob {
  id: string;
  nomeEvento?: string;
  title?: string;
  name?: string;
  jobType?: string;
  clientIds?: string[];
  clientiIds?: string[];
  clienteId?: string;
  clientNames?: string[];
}

export interface GalleryJobType {
  id: string;
  slug: string;
  nome: string;
  icona?: string;
  attivo: boolean;
  ordine: number;
}

export function clientLabel(client: GalleryClient): string {
  return [client.nome, client.cognome].filter(Boolean).join(' ').trim()
    || client.name || client.email || client.id;
}

export function jobLabel(job: GalleryJob): string {
  return job.nomeEvento || job.title || job.name || job.id;
}

export function jobClientIds(job: GalleryJob): string[] {
  return [...new Set([...(job.clientIds || []), ...(job.clientiIds || []), ...(job.clienteId ? [job.clienteId] : [])]
    .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    .map(id => id.trim()))];
}

export function mergeJobClientIds(clientIds: string[], job: GalleryJob): string[] {
  return [...new Set([...clientIds, ...jobClientIds(job)])];
}