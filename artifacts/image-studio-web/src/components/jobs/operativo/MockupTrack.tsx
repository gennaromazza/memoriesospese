import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { createUrl } from '@/lib/config';
import { formatPhoneForWhatsApp } from '@shared/phone-utils';
import PhotobookMockup from '@/components/photobook/PhotobookMockup';

interface Overview { contacts: { id: string; name: string; phone: string }[]; books: { id: string; name: string; currentVersion: number }[] }
export default function MockupTrack({ jobId }: { jobId: string }) {
  const path = `/api/photobooks/mockup-jobs/${encodeURIComponent(jobId)}`;
  const query = useQuery<Overview>({ queryKey: [path], queryFn: async () => (await apiRequest('GET', path)).json() });
  return <section className="space-y-3" data-testid="job-mockup-track">
    <h3 className="font-semibold">Album e personalizzazione</h3>
    <p className="text-sm text-muted-foreground">Scegli le proposte per questo lavoro, verifica il mockup e confermalo prima di allegarlo all’invio fotolibro.</p>
    {query.isLoading && <p role="status">Caricamento album…</p>}
    {query.isError && <p role="alert">Impossibile caricare gli album del lavoro.</p>}
    <div className="flex flex-wrap gap-3">{query.data?.contacts.map(client => {
      const phone = formatPhoneForWhatsApp(client.phone);
      return <div key={client.id} className="border rounded p-2 text-sm"><p>{client.name}</p>{phone ? <><span>{client.phone}</span> · <a className="underline" href={`https://wa.me/${phone}`} target="_blank" rel="noopener noreferrer">Apri WhatsApp</a></> : <span>Numero non presente nell’anagrafica cliente</span>}</div>;
    })}</div>
    {query.data && !query.data.books.length && <p className="text-sm">Nessun fotolibro associato. Crea o associa il fotolibro dalla gestione Fotolibri per preparare la proposta.</p>}
    {query.data?.books.map(book => <div className="space-y-2" key={book.id}>
      <p className="font-medium">{book.name} · <a className="text-sm underline" href={createUrl(`/admin/photobooks/${encodeURIComponent(book.id)}`)}>Apri fotolibro</a></p>
      <PhotobookMockup key={`${book.id}-${book.currentVersion}`} photobookId={book.id} version={book.currentVersion} summary />
    </div>)}
  </section>;
}
