import type { Cliente } from '@shared/clienti-types';
import type { Job } from '@shared/jobs-types';

const normalize = (value: string) => value.normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const digits = (value: string) => value.replace(/\D/g, '');

export function buildClientSearchIndex(clienti: Cliente[]) {
  return new Map(clienti.map(cliente => [cliente.id, {
    text: normalize([
      cliente.nome, cliente.cognome, cliente.email, cliente.pec,
      cliente.ragioneSociale, cliente.instagram,
      cliente.cellulare1, cliente.cellulare2, cliente.whatsapp,
    ].filter(Boolean).join(' ')),
    phones: [cliente.cellulare1, cliente.cellulare2, cliente.whatsapp]
      .filter((value): value is string => Boolean(value)).map(digits),
  }]));
}

/** Search every job/lead; the caller applies ordinary filters only without a query. */
export function searchJobs(
  jobs: Job[],
  query: string,
  clients: ReturnType<typeof buildClientSearchIndex>,
) {
  const text = normalize(query);
  if (!text) return jobs;
  if (!/[\p{L}\p{N}]/u.test(text)) return [];
  const phone = digits(query);
  const isPhone = phone.length > 0 && /^[+\d\s()./-]+$/.test(query.trim());
  return jobs.filter(job => {
    const jobText = normalize([
      job.nomeEvento, job.eventLocation, job.rituLocation,
      job.locationCerimonia, job.noteInterne,
    ].filter(Boolean).join(' '));
    if (jobText.includes(text)) return true;
    const ids = job.clientiIds?.length ? job.clientiIds : job.clienteId ? [job.clienteId] : [];
    return ids.some(id => {
      const client = clients.get(id);
      return client && (client.text.includes(text) ||
        (isPhone && client.phones.some(number => number.includes(phone))));
    });
  });
}
