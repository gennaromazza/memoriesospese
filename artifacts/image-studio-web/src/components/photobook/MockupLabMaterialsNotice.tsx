import type { MockupPayload } from '@shared/mockup-types';
import { mockupPrintMaterials } from '@shared/mockup-print-materials';
import { createUrl } from '@/lib/config';

export default function MockupLabMaterialsNotice({ photobookId, payload }: { photobookId: string; payload: MockupPayload }) {
  const saved = payload.saved;
  if (saved?.status !== 'confirmed') return null;
  const status = payload.labAttachment?.status || 'pending';
  const attached = status === 'attached';
  const attention = status === 'needs_review';
  return (
    <section role="status" aria-live="polite" className={`rounded-lg border p-3 space-y-2 text-sm ${attention ? 'border-amber-300 bg-amber-50' : 'border-primary/25 bg-primary/5'}`} data-testid="mockup-lab-materials-notice">
      <p className="font-semibold">{attached ? 'Materiali mockup allegati alla spedizione' : attention ? 'Mockup confermato: controlla gli allegati' : 'Mockup confermato: materiali per il laboratorio'}</p>
      <p>{attached ? 'Riepilogo HTML e anteprime delle foto del mockup sono registrati nella cartella Drive. Questo non indica che l’email sia stata inviata.'
        : payload.deliveryRecoveryAvailable
          ? 'La copia salvata è confermata. Apri “Recupera mockup per laboratorio” e aggiungi i materiali alla cartella Drive esistente: i file attuali restano conservati e non viene reinviata alcuna email.'
          : 'Il riepilogo HTML e le anteprime delle foto vengono allegati automaticamente al termine del trasferimento delle pagine e ricontrollati prima dell’email al laboratorio.'}</p>
      <ul className="list-disc pl-5 space-y-1">
        <li>Riepilogo HTML con modello, rivestimenti, nomi e indicazioni delle incisioni.</li>
        {mockupPrintMaterials(saved.configuration, saved.option).map(material => <li key={material.id}>{material.label}.</li>)}
        {'engravingNames' in saved.configuration && saved.configuration.engravingNames && ['plaque', 'split-photo-fabric'].includes(saved.configuration.coverLayout) && <li>Nomi dell’incisione già salvati: non devi riscriverli.</li>}
      </ul>
      {status === 'uploading' && <p>Caricamento materiali su Drive in corso…</p>}
      {attention && <p className="font-medium text-amber-900">{payload.labAttachment?.message || 'Verifica la cartella Drive prima di ripetere il caricamento. L’email non deve partire con allegati incompleti.'}</p>}
      <p className="text-xs text-muted-foreground">L’anteprima 3D usa copie leggere e non sostituisce i file per la stampa. Dopo la conferma, carica gli originali ad alta risoluzione, se necessari, dalla sezione “File originali per la stampa”; puoi aggiungere anche dorsi o PDF tecnici.</p>
      <a className="inline-flex min-h-11 items-center font-medium underline underline-offset-4" href={createUrl(`/admin/dashboard?tab=photobooks&photobook=${encodeURIComponent(photobookId)}`)}>Carica i file originali per la stampa</a>
    </section>
  );
}
