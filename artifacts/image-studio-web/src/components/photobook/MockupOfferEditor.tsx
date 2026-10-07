import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAllLabs } from "@/lib/labs";
import { Button } from "@/components/ui/button";
import { visibleCatalogForLab } from "@shared/mockup-workflow";
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
    (offer?.options.length === 1 ? "fixed" : "choice")
  );
}

export default function MockupOfferEditor({
  offer,
  modelMode,
  modelSelection,
  disabled,
  publish,
}: MockupOfferEditorProps) {
  const [expanded, setExpanded] = useState(false);
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
          ? ({ labId, modelId } as MockupSelection)
          : null;
      })
      .filter((x): x is MockupSelection => x !== null);

    if (selections.length === 0) return;

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
      <Button
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
      </Button>

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
                <strong>Modello già deciso</strong>
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
                <strong>Lascia scegliere al cliente</strong>
                <small className="block text-muted-foreground">
                  Pubblica due o più modelli tra cui scegliere.
                </small>
              </span>
            </label>
          </fieldset>

          <p className="text-xs">
            La pubblicazione richiede una nuova verifica del mockup. Le conferme
            precedenti restano nello storico.
          </p>

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
                  <label
                    key={model.id}
                    className="flex items-center gap-2 pl-5"
                  >
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
              ? "Salva modello unico"
              : "Pubblica modelli disponibili"}
          </Button>
        </>
      )}
    </div>
  );
}
