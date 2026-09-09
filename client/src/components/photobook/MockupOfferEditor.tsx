import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAllLabs } from '@/lib/labs';
import { Button } from '@/components/ui/button';
import type { LabMockupCatalog, MockupOffer, MockupSelection } from '@shared/mockup-workflow';

export default function MockupOfferEditor({ offer, disabled, publish }: { offer?: MockupOffer | null; disabled: boolean; publish: (selections: MockupSelection[]) => Promise<boolean> }) {
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<string[] | null>(null);
  const labs = useQuery({ queryKey: ['mockup-labs-catalog'], queryFn: () => getAllLabs(true), enabled: expanded });
  const choices = (labs.data || []).map(lab => ({ ...lab, models: ((lab as typeof lab & { mockupCatalog?: LabMockupCatalog }).mockupCatalog?.models || []).filter(m => m.active && m.rendererId) }));
  const selection = selected || offer?.options.map(o => `${o.labId}/${o.id}`) || [];
  function toggle(keys: string[], checked: boolean) { setSelected(checked ? [...new Set([...selection, ...keys])] : selection.filter(id => !keys.includes(id))); }
  return <div className="border rounded p-3 space-y-3">
    <Button variant="outline" disabled={disabled} onClick={() => { setExpanded(!expanded); if (!expanded) void labs.refetch(); }}>Laboratori e modelli per questo lavoro</Button>
    <p className="text-sm">{offer ? `${offer.options.length} ${offer.options.length === 1 ? 'modello nella proposta pubblicata' : 'modelli nella proposta pubblicata'}.` : 'Pubblica una proposta per abilitare scelta del modello e verifica dello studio.'}</p>
    {expanded && <>
      <p className="text-xs">L’aggiornamento richiede una nuova verifica del mockup. Le conferme precedenti restano nello storico.</p>
      {labs.isError && <p role="alert">Impossibile leggere i cataloghi.</p>}
      <Button variant="outline" disabled={disabled || !labs.data} onClick={() => setSelected(choices.flatMap(l => l.models.map(m => `${l.id}/${m.id}`)))}>Seleziona tutti</Button>
      {choices.map(lab => <fieldset key={lab.id} disabled={disabled} className="border-t pt-2 space-y-2">
        <label className="flex items-center gap-2 font-medium"><input type="checkbox" disabled={!lab.models.length} checked={!!lab.models.length && lab.models.every(m => selection.includes(`${lab.id}/${m.id}`))} onChange={e => toggle(lab.models.map(m => `${lab.id}/${m.id}`), e.target.checked)} />{lab.nome}</label>
        {!lab.models.length && <p className="text-xs">Nessun modello 3D pronto: configuralo nell’anagrafica laboratori.</p>}
        {lab.models.map(model => <label key={model.id} className="flex items-center gap-2 pl-5"><input type="checkbox" checked={selection.includes(`${lab.id}/${model.id}`)} onChange={e => toggle([`${lab.id}/${model.id}`], e.target.checked)} />{model.name}</label>)}
      </fieldset>)}
      <Button disabled={disabled || !selection.length || labs.isLoading} onClick={() => { void publish(selection.map(key => { const [labId, modelId] = key.split('/'); return { labId, modelId }; })).then(success => { if (success) setSelected(null); }); }}>Pubblica opzioni nel link cliente</Button>
    </>}
  </div>;
}
