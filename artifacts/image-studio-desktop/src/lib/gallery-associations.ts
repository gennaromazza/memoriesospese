export interface GalleryClient {
  id: string;
  nome?: string;
  cognome?: string;
  name?: string;
  email?: string;
  telefono?: string | null;
  whatsapp?: string | null;
  cellulare1?: string | null;
  cellulare2?: string | null;
  cellulare?: string | null;
}

export function galleryClientIds(gallery: {
  clientIds?: string[];
  clientiIds?: string[];
  clienteId?: string | null;
}): string[] {
  return [...new Set([
    ...(Array.isArray(gallery.clientIds) ? gallery.clientIds : []),
    ...(Array.isArray(gallery.clientiIds) ? gallery.clientiIds : []),
    gallery.clienteId,
  ].filter((id): id is string => typeof id === 'string' && id.trim().length > 0))];
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

export function jobClientNames(job: GalleryJob, clients: GalleryClient[]): string[] {
  const clientsById = new Map(clients.map(client => [client.id, client]));
  return jobClientIds(job)
    .map(id => clientsById.get(id))
    .filter((client): client is GalleryClient => Boolean(client))
    .map(clientLabel);
}

export function jobMatchesSearch(job: GalleryJob, clients: GalleryClient[], search: string): boolean {
  const term = search.trim().toLocaleLowerCase('it');
  if (!term) return false;
  return [
    jobLabel(job),
    job.nomeEvento,
    job.title,
    job.name,
    ...jobClientNames(job, clients),
  ].some(value => value?.toLocaleLowerCase('it').includes(term));
}

export function mergeJobClientIds(clientIds: string[], job: GalleryJob): string[] {
  return [...new Set([...clientIds, ...jobClientIds(job)])];
}