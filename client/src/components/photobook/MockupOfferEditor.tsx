import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAllLabs } from '@/lib/labs';
import { Button } from '@/components/ui/button';
import type { LabMockupCatalog, MockupOffer, MockupOfferMode, MockupSelection } from '@shared/mockup-workflow';

export default function MockupOfferEditor({
  offer,
  modelMode,
  modelSelection,
  disabled,
  publish,
}: {
  offer?: MockupOffer | null;
  modelMode?: MockupOfferMode;
  modelSelection?: MockupSelection | null;
  disabled: boolean;
  publish: (mode: MockupOfferMode, selections: MockupSelection[]) => Promise<boolean>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<string[] | null>(null);
  const [mode, setMode] = useState<MockupOfferMode>(modelMode || offer?.mode || (offer?.options.length === 1 ? 'fixed' : 'choice'));
  const labs = useQuery({ queryKey: ['mockup-labs-catalog'], queryFn: () => getAllLabs(true), enabled: expanded });
  const choices = (labs.data || []).map(lab => ({ ...lab, models: ((lab as typeof lab & { mockupCatalog?: LabMockupCatalog }).mockupCatalog?.models || []).filter(m => m.active && m.rendererId) }));
  const selection = selected || offer?.options.map(o => `${o.labId}/${o.id}`) || [];
  const fixedKey = selected?.[0] || (modelSelection
    ? `${modelSelection.labId}/${modelSelection.modelId}`
    : selection[0] || '');
  function toggle(keys: string[], checked: boolean) { setSelected(checked ? [...new Set([...selection, ...keys])] : selection.filter(id => !keys.includes(id))); }
  function publishCurrent() {
    const keys = mode === 'fixed' ? [fixedKey] : selection;
    if (!keys.length) return;
    void publish(mode, keys.map(key => { const [labId, modelId] = key.split('/'); return { labId, modelId }; })).then(success => { if (success) setSelected(null); });
  }
  return <div className="border rounded p-3 space-y-3">
    <Button variant="outline" disabled={disabled} onClick={() => { setExpanded(!expanded); if (!expanded) void labs.refetch(); }}>Configura modello fotolibro</Button>
    <p className="text-sm">{mode === 'fixed'
      ? 'Un solo modello, ereditato automaticamente da tutte le versioni del fotolibro.'
      : offer ? `${offer.options.length} modelli disponibili nel link cliente.`
        : 'Lascia scegliere il modello al cliente pubblicando più opzioni.'}</p>
    {expanded && <>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Come deve essere scelto il modello?</legend>
        <label className="flex items-start gap-2 text-sm">
          <input type="radio" name="mockup-offer-mode" checked={mode === 'fixed'} disabled={disabled} onChange={() => setMode('fixed')} />
          <span><strong>Modello già deciso</strong><small className="block text-muted-foreground">Il cliente lo vede e poi continua con la personalizzazione.</small></span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="radio" name="mockup-offer-mode" checked={mode === 'choice'} disabled={disabled} onChange={() => setMode('choice')} />
          <span><strong>Lascia scegliere al cliente</strong><small className="block text-muted-foreground">Pubblica due o più modelli tra cui scegliere.</small></span>
        </label>
      </fieldset>
      <p className="text-xs">La pubblicazione richiede una nuova verifica del mockup. Le conferme precedenti restano nello storico.</p>
      {labs.isError && <p role="alert">Impossibile leggere i cataloghi.</p>}
      {mode === 'choice' && <Button variant="outline" disabled={disabled || !labs.data} onClick={() => setSelected(choices.flatMap(l => l.models.map(m => `${l.id}/${m.id}`)))}>Seleziona tutti</Button>}
      {choices.map(lab => <fieldset key={lab.id} disabled={disabled} className="border-t pt-2 space-y-2">
        {mode === 'choice'
          ? <label className="flex items-center gap-2 font-medium"><input type="checkbox" disabled={!lab.models.length} checked={!!lab.models.length && lab.models.every(m => selection.includes(`${lab.id}/${m.id}`))} onChange={e => toggle(lab.models.map(m => `${lab.id}/${m.id}`), e.target.checked)} />{lab.nome}</label>
          : <p className="font-medium">{lab.nome}</p>}
        {!lab.models.length && <p className="text-xs">Nessun modello 3D pronto: configuralo nell’anagrafica laboratori.</p>}
        {lab.models.map(model => <label key={model.id} className="flex items-center gap-2 pl-5"><input type={mode === 'fixed' ? 'radio' : 'checkbox'} name="mockup-fixed-model" checked={mode === 'fixed' ? fixedKey === `${lab.id}/${model.id}` : selection.includes(`${lab.id}/${model.id}`)} onChange={e => mode === 'fixed' ? setSelected([`${lab.id}/${model.id}`]) : toggle([`${lab.id}/${model.id}`], e.target.checked)} />{model.name}</label>)}
      </fieldset>)}
      <Button disabled={disabled || (mode === 'fixed' ? !fixedKey : !selection.length) || labs.isLoading} onClick={publishCurrent}>{mode === 'fixed' ? 'Salva modello unico' : 'Pubblica modelli disponibili'}</Button>
    </>}
  </div>;
}
