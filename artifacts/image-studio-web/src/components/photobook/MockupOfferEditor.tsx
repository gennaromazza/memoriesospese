import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAllLabs } from "@/lib/labs";
import { Button } from "@/components/ui/button";
import { BOX_FORMAT_MAX_CM, BOX_FORMAT_MIN_CM, mockupBoxSetupSchema, visibleCatalogForLab } from "@shared/mockup-workflow";
import type { MockupBoxSetup } from "@shared/mockup-workflow";
import type {
  LabMockupCatalog,
  MockupOffer,
  MockupOfferMode,
  MockupSelection,
} from "@shared/mockup-workflow";

interface MockupOfferEditorProps {
  offer?: MockupOffer | null;
  modelMode?: MockupOfferMode;
  modelSelection?: MockupSelection | null;
  disabled: boolean;
  /** Mostra subito il form, senza il pulsante che lo apre (finestra admin “Assegna modello”). */
  alwaysOpen?: boolean;
  /** Carica la grafica di copertina e restituisce l'id dell'asset (solo per il Quadrobook). */
  uploadGraphic?: (file: File) => Promise<string>;
  /** Una nuova offerta può riportare la bozza salvata allo stato da verificare. */
  hasSavedMockup?: boolean;
  publish: (
    mode: MockupOfferMode,
    selections: MockupSelection[],
  ) => Promise<boolean>;
}

/** Ritorna il mode di default derivato dalla prop o dall'offerta. */
function computeDefaultMode(
  modelMode: MockupOfferMode | undefined,
  offer: MockupOffer | null | undefined,
): MockupOfferMode {
  return (
    modelMode ??
    offer?.mode ??
    // Quasi sempre si assegna un solo modello: è il punto di partenza.
    ((offer?.options.length ?? 0) > 1 ? "choice" : "fixed")
  );
}

const BOX_RENDERER = "scatola-cornice";
interface BoxDraft { w: string; h: string; mode: MockupBoxSetup["cover"]["mode"]; graphicAssetId?: string; graphicName?: string }
const boxDraftOf = (setup?: MockupBoxSetup): BoxDraft => ({
  w: String(setup?.format.w ?? 25), h: String(setup?.format.h ?? 35),
  mode: setup?.cover.mode ?? "photo", graphicAssetId: setup?.cover.graphicAssetId, graphicName: setup?.cover.graphicAssetId ? "Grafica già caricata" : undefined,
});
const COVER_MODES: { id: BoxDraft["mode"]; label: string; hint: string }[] = [
  { id: "photo", label: "Foto scelta dal cliente", hint: "La sceglie dalla sua galleria nello slide della copertina. Non devi caricare niente." },
  { id: "graphic", label: "La mia grafica", hint: "Carichi tu la grafica; il cliente non la cambia." },
  { id: "choice", label: "Il cliente sceglie tra la sua foto e la mia grafica", hint: "Carichi la grafica; il cliente può usarla oppure scegliere una sua foto." },
];

export default function MockupOfferEditor({
  offer,
  modelMode,
  modelSelection,
  disabled,
  alwaysOpen = false,
  uploadGraphic,
  hasSavedMockup = false,
  publish,
}: MockupOfferEditorProps) {
  const [boxDrafts, setBoxDrafts] = useState<Record<string, BoxDraft>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(alwaysOpen);
  const [selected, setSelected] = useState<string[] | null>(null);
  const [mode, setMode] = useState<MockupOfferMode>(() =>
    computeDefaultMode(modelMode, offer),
  );
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  // FIX: se la prop / l'offerta cambiano dall'esterno, `mode` si risincronizza.
  // Prima rimaneva congelato al valore di mount.
  useEffect(() => {
    setMode(computeDefaultMode(modelMode, offer));
  }, [modelMode, offer]);

  const labs = useQuery({
    queryKey: ["mockup-labs-catalog"],
    queryFn: () => getAllLabs(true),
    enabled: expanded,
  });

  const choices = useMemo(
    () =>
      (labs.data ?? []).map((lab) => {
        const catalog = (
          lab as typeof lab & { mockupCatalog?: LabMockupCatalog }
        ).mockupCatalog;
        const visibleCatalog = visibleCatalogForLab(
          catalog ?? { revision: 0, models: [], materials: [] },
          lab.nome,
        );
        return {
          id: lab.id,
          nome: lab.nome,
          models: visibleCatalog.models.filter(
            (m) => m.active && m.rendererId && m.materialIds.length,
          ),
        };
      }),
    [labs.data],
  );

  const offerKeys = useMemo(
    () => (offer?.options ?? []).map((o) => `${o.labId}/${o.id}`),
    [offer],
  );

  const selection = useMemo(() => selected ?? offerKeys, [selected, offerKeys]);

  const fixedKey = useMemo(() => {
    if (selected && selected.length > 0) return selected[0];
    if (modelSelection)
      return `${modelSelection.labId}/${modelSelection.modelId}`;
    return offerKeys[0] ?? "";
  }, [selected, modelSelection, offerKeys]);

  const boxDraft = (key: string): BoxDraft =>
    boxDrafts[key] ?? boxDraftOf(offer?.options.find((o) => `${o.labId}/${o.id}` === key)?.setup);
  const patchBox = (key: string, patch: Partial<BoxDraft>) =>
    setBoxDrafts((prev) => ({ ...prev, [key]: { ...boxDraft(key), ...patch } }));
  const boxKeys = useMemo(
    () => new Set(choices.flatMap((l) => l.models.filter((m) => m.rendererId === BOX_RENDERER).map((m) => `${l.id}/${m.id}`))),
    [choices],
  );
  function setupFor(key: string): { setup?: MockupBoxSetup; error?: string } {
    if (!boxKeys.has(key)) return {};
    const d = boxDraft(key);
    const parsed = mockupBoxSetupSchema.safeParse({
      format: { w: Number(d.w.replace(",", ".")), h: Number(d.h.replace(",", ".")) },
      cover: { mode: d.mode, ...(d.mode !== "photo" && d.graphicAssetId ? { graphicAssetId: d.graphicAssetId } : {}) },
    });
    if (parsed.success) return { setup: parsed.data };
    const graphicMissing = d.mode !== "photo" && !d.graphicAssetId;
    return { error: graphicMissing ? "Carica la grafica di copertina." : `Il formato deve essere tra ${BOX_FORMAT_MIN_CM} e ${BOX_FORMAT_MAX_CM} cm per lato.` };
  }
  async function onGraphic(key: string, file: File | undefined) {
    if (!file || !uploadGraphic) return;
    setUploading(key);
    setPublishError(null);
    try {
      const id = await uploadGraphic(file);
      patchBox(key, { graphicAssetId: id, graphicName: file.name });
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : "Caricamento della grafica non riuscito.");
    } finally {
      setUploading(null);
    }
  }

  function toggle(keys: string[], checked: boolean) {
    // FIX: uso l'updater funzionale per non dipendere da `selection` catturato
    // nella closure (poteva essere stantio in click rapidi).
    setSelected((prev) => {
      const base = prev ?? offerKeys;
      return checked
        ? Array.from(new Set([...base, ...keys]))
        : base.filter((id) => !keys.includes(id));
    });
  }

  async function publishCurrent() {
    // FIX: in precedenza `['' ]` (fixedKey vuoto) passava il check `keys.length`
    // e finiva per inviare `{ labId: '', modelId: '' }`.
    const keys = mode === "fixed" ? (fixedKey ? [fixedKey] : []) : selection;
    if (keys.length === 0) return;

    const selections = keys
      .map((key) => {
        const [labId, modelId] = key.split("/");
        return labId && modelId
          ? ({ labId, modelId, ...setupFor(key) } as MockupSelection)
          : null;
      })
      .filter((x): x is MockupSelection => x !== null);

    if (selections.length === 0) return;
    const invalid = keys.map((key) => setupFor(key).error).find(Boolean);
    if (invalid) { setPublishError(invalid); return; }
    const previousMode = offer?.mode ?? ((offer?.options.length ?? 0) > 1 ? "choice" : "fixed");
    const previousOptions = (offer?.options ?? [])
      .map(({ labId, id, setup }) => ({ labId, modelId: id, ...(setup ? { setup } : {}) }))
      .sort((a, b) => `${a.labId}/${a.modelId}`.localeCompare(`${b.labId}/${b.modelId}`));
    const nextOptions = selections
      .map(({ labId, modelId, setup }) => ({ labId, modelId, ...(setup ? { setup } : {}) }))
      .sort((a, b) => `${a.labId}/${a.modelId}`.localeCompare(`${b.labId}/${b.modelId}`));
    const offerChanged = !!offer && (previousMode !== mode || JSON.stringify(previousOptions) !== JSON.stringify(nextOptions));
    if (offerChanged && hasSavedMockup && !window.confirm(
      "Questa bozza salvata resterà conservata, ma tornerà da verificare e potrebbe richiedere un aggiornamento per il nuovo modello. La revisione precedente resterà nello storico. Vuoi continuare?",
    )) return;

    setPublishing(true);
    setPublishError(null);
    try {
      // FIX: `publish` può rejectare; prima la Promise veniva silenziosamente ignorata.
      const ok = await publish(mode, selections);
      if (ok) {
        setSelected(null);
      } else {
        setPublishError("Pubblicazione non riuscita. Riprova.");
      }
    } catch (err) {
      setPublishError(
        err instanceof Error
          ? err.message
          : "Errore imprevisto durante la pubblicazione.",
      );
    } finally {
      setPublishing(false);
    }
  }

  const publishDisabled =
    disabled ||
    publishing ||
    labs.isFetching ||
    (mode === "fixed" ? !fixedKey : selection.length === 0);

  return (
    <div className="mockup-offer-editor space-y-3">
      {!alwaysOpen && <Button
        variant="outline"
        disabled={disabled}
        aria-expanded={expanded}
        onClick={() => {
          const next = !expanded;
          setExpanded(next);
          // FIX: il vecchio `refetch()` partiva anche quando la query era ancora
          // disabilitata (primo click), causando una doppia fetch.
          // Ora ricarico solo se i dati sono già stati fetched almeno una volta.
          if (next && labs.isFetched) void labs.refetch();
        }}
      >
        Configura modello fotolibro
      </Button>}

      <p className="text-sm">
        {mode === "fixed"
          ? "Un solo modello, ereditato automaticamente da tutte le versioni del fotolibro."
          : offer
            ? `${offer.options.length} modelli disponibili nel link cliente.`
            : "Lascia scegliere il modello al cliente pubblicando più opzioni."}
      </p>

      {expanded && (
        <>
          <fieldset className="space-y-2" disabled={disabled}>
            <legend className="text-sm font-medium">
              Come deve essere scelto il modello?
            </legend>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="mockup-offer-mode"
                checked={mode === "fixed"}
                onChange={() => setMode("fixed")}
              />
              <span>
                <strong>Un solo modello, deciso da me</strong>
                <small className="block text-muted-foreground">
                  Il cliente lo vede e poi continua con la personalizzazione.
                </small>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="mockup-offer-mode"
                checked={mode === "choice"}
                onChange={() => setMode("choice")}
              />
              <span>
                <strong>Il cliente sceglie tra più modelli</strong>
                <small className="block text-muted-foreground">
                  Proponi due o più modelli: il cliente ne sceglie uno.
                </small>
              </span>
            </label>
          </fieldset>

          {!!offer?.options.length && (
            <p className="text-xs text-muted-foreground">
              Cambiare un’offerta con una bozza salvata la riporta allo stato da verificare: configurazione e revisione precedente restano conservate. Prima della pubblicazione ti chiederemo conferma.
            </p>
          )}

          {labs.isError && <p role="alert">Impossibile leggere i cataloghi.</p>}

          {mode === "choice" && (
            <Button
              variant="outline"
              disabled={disabled || !labs.data}
              onClick={() =>
                setSelected(
                  choices.flatMap((l) =>
                    l.models.map((m) => `${l.id}/${m.id}`),
                  ),
                )
              }
            >
              Seleziona tutti
            </Button>
          )}

          {choices.map((lab) => (
            <fieldset
              key={lab.id}
              disabled={disabled}
              className="border-t pt-2 space-y-2"
            >
              {mode === "choice" ? (
                <label className="flex items-center gap-2 font-medium">
                  <input
                    type="checkbox"
                    disabled={!lab.models.length}
                    checked={
                      lab.models.length > 0 &&
                      lab.models.every((m) =>
                        selection.includes(`${lab.id}/${m.id}`),
                      )
                    }
                    onChange={(e) =>
                      toggle(
                        lab.models.map((m) => `${lab.id}/${m.id}`),
                        e.target.checked,
                      )
                    }
                  />
                  {lab.nome}
                </label>
              ) : (
                <p className="font-medium">{lab.nome}</p>
              )}

              {!lab.models.length && (
                <p className="text-xs">
                  Nessun modello 3D pronto: configuralo nell’anagrafica
                  laboratori.
                </p>
              )}

              {lab.models.map((model) => {
                const key = `${lab.id}/${model.id}`;
                const isChecked =
                  mode === "fixed" ? fixedKey === key : selection.includes(key);
                return (
                  <div key={model.id} className="space-y-2">
                  <label className="flex items-center gap-2 pl-5">
                    <input
                      type={mode === "fixed" ? "radio" : "checkbox"}
                      // FIX: `name` presente solo in modalità fixed, così i checkbox
                      // non vengono raggruppati per errore dal browser.
                      name={mode === "fixed" ? "mockup-fixed-model" : undefined}
                      checked={isChecked}
                      onChange={(e) =>
                        mode === "fixed"
                          ? setSelected([key])
                          : toggle([key], e.target.checked)
                      }
                    />
                    {model.name}
                  </label>
                  {isChecked && boxKeys.has(key) && (() => {
                    const d = boxDraft(key);
                    return (
                      <div className="ml-5 rounded border p-3 space-y-3 bg-muted/30" data-testid="box-setup">
                        <p className="text-sm font-medium">Formato album (lo decidi tu, il cliente non lo cambia)</p>
                        <div className="flex items-center gap-2">
                          <input aria-label="Larghezza in cm" inputMode="decimal" className="w-20 rounded border p-2 text-base" value={d.w} onChange={(e) => patchBox(key, { w: e.target.value })} />
                          <span>×</span>
                          <input aria-label="Altezza in cm" inputMode="decimal" className="w-20 rounded border p-2 text-base" value={d.h} onChange={(e) => patchBox(key, { h: e.target.value })} />
                          <span className="text-sm">cm · es. 25×35 verticale, 35×25 orizzontale</span>
                        </div>
                        <fieldset className="space-y-2">
                          <legend className="text-sm font-medium">Copertina dell’album</legend>
                          {COVER_MODES.map((m) => (
                            <label key={m.id} className="flex items-start gap-2 text-sm">
                              <input type="radio" name={`cover-${key}`} checked={d.mode === m.id} onChange={() => patchBox(key, { mode: m.id })} />
                              <span><strong>{m.label}</strong><small className="block text-muted-foreground">{m.hint}</small></span>
                            </label>
                          ))}
                        </fieldset>
                        {d.mode !== "photo" && (
                          <label className="block text-sm">
                            Grafica richiesta dall’offerta Quadrobook (non è una foto della bozza; JPG, PNG o WebP)
                            <input type="file" accept="image/jpeg,image/png,image/webp" className="block mt-1 w-full min-h-11" disabled={disabled || uploading === key || !uploadGraphic} onChange={(e) => { void onGraphic(key, e.target.files?.[0]); e.target.value = ""; }} />
                            <span className="block text-xs text-muted-foreground mt-1">{uploading === key ? "Caricamento…" : d.graphicName || "Nessuna grafica caricata"}</span>
                          </label>
                        )}
                      </div>
                    );
                  })()}
                  </div>
                );
              })}
            </fieldset>
          ))}

          {publishError && (
            <p role="alert" className="text-sm text-destructive">
              {publishError}
            </p>
          )}

          <Button disabled={publishDisabled} onClick={publishCurrent}>
            {mode === "fixed"
              ? "Salva modello"
              : "Salva modelli proposti"}
          </Button>
        </>
      )}
    </div>
  );
}
