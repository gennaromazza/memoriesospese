import { useState } from 'react';
import { AlertTriangle, Check, Copy, Image as ImageIcon, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  PRINT_FINISH_OPTIONS,
  PRINT_FIT_OPTIONS,
  PRINT_SHOP_CATEGORIES,
} from '@shared/print-shop-catalog';
import type { PrintFinish, PrintFitMode, PrintShopCatalogProduct } from '@shared/print-shop-types';
import {
  effectivePrintDpi,
  findPrintProduct,
  formatEuroCents,
  groupCopyCount,
  isPackageProduct,
} from './print-shop-state';
import type { LocalPrintPhoto, PrintGroupDraft } from './types';

interface PrintGroupEditorProps {
  index: number;
  group: PrintGroupDraft;
  products: PrintShopCatalogProduct[];
  photos: LocalPrintPhoto[];
  issueMessages?: string[];
  canRemove: boolean;
  onChange: (group: PrintGroupDraft) => void;
  onRemove: () => void;
}

function startingPriceLabel(product: PrintShopCatalogProduct): string {
  const pricing = product.printSpec.pricing;
  if (pricing.model === 'package') {
    return `${pricing.packageSize} foto · ${formatEuroCents(pricing.packagePriceCents)}`;
  }
  const lowest = Math.min(...pricing.tiers.map((tier) => tier.unitPriceCents));
  return `da ${formatEuroCents(lowest)} cad.`;
}

function categoryName(categoryId: string): string {
  return PRINT_SHOP_CATEGORIES.find((category) => category.id === categoryId)?.nome ?? 'Altri formati';
}

function ChoiceCard<T extends string>({
  value,
  selected,
  label,
  description,
  name,
  onChange,
}: {
  value: T;
  selected: boolean;
  label: string;
  description: string;
  name: string;
  onChange: (value: T) => void;
}) {
  return (
    <label className={`relative flex cursor-pointer gap-3 rounded-2xl border p-4 transition ${selected ? 'border-terracotta bg-terracotta/5 ring-1 ring-terracotta' : 'border-sage/20 bg-white hover:border-sage/50'}`}>
      <input
        type="radio"
        name={name}
        value={value}
        checked={selected}
        onChange={() => onChange(value)}
        className="sr-only"
      />
      <span className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full border ${selected ? 'border-terracotta bg-terracotta text-white' : 'border-blue-gray/25'}`}>
        {selected && <Check className="h-3 w-3" aria-hidden="true" />}
      </span>
      <span>
        <span className="block text-sm font-semibold text-blue-gray">{label}</span>
        <span className="mt-1 block text-xs leading-relaxed text-blue-gray/55">{description}</span>
      </span>
    </label>
  );
}

export function PrintGroupEditor({
  index,
  group,
  products,
  photos,
  issueMessages = [],
  canRemove,
  onChange,
  onRemove,
}: PrintGroupEditorProps) {
  const [visiblePhotoCount, setVisiblePhotoCount] = useState(60);
  const product = findPrintProduct(products, group.sku);
  const isPackage = isPackageProduct(product);
  const selectedByPhoto = new Map(group.assignments.map((assignment) => [assignment.localPhotoId, assignment]));
  const packageSize = isPackage ? product.printSpec.pricing.packageSize : null;
  const groupedProducts = PRINT_SHOP_CATEGORIES.map((category) => ({
    category,
    products: products.filter((entry) => entry.categoria === category.id),
  })).filter((entry) => entry.products.length > 0);

  const chooseProduct = (sku: string) => {
    const nextProduct = findPrintProduct(products, sku);
    let assignments = group.assignments;
    if (isPackageProduct(nextProduct)) {
      assignments = assignments
        .slice(0, nextProduct.printSpec.pricing.packageSize)
        .map((assignment) => ({ ...assignment, copies: 1 }));
    }
    onChange({
      ...group,
      sku,
      finish: nextProduct?.printSpec.finishes[0] ?? 'glossy',
      fitMode: nextProduct?.printSpec.fitModes[0] ?? 'border',
      assignments,
    });
  };

  const togglePhoto = (localPhotoId: string) => {
    const existing = selectedByPhoto.get(localPhotoId);
    if (existing) {
      onChange({ ...group, assignments: group.assignments.filter((entry) => entry.localPhotoId !== localPhotoId) });
      return;
    }
    if (packageSize !== null && group.assignments.length >= packageSize) return;
    onChange({ ...group, assignments: [...group.assignments, { localPhotoId, copies: 1 }] });
  };

  const selectAll = () => {
    const limit = packageSize ?? photos.length;
    onChange({
      ...group,
      assignments: photos.slice(0, limit).map((photo) => ({ localPhotoId: photo.localId, copies: 1 })),
    });
  };

  const updateCopies = (localPhotoId: string, copies: number) => {
    onChange({
      ...group,
      assignments: group.assignments.map((assignment) =>
        assignment.localPhotoId === localPhotoId
          ? { ...assignment, copies: Math.max(1, Math.min(999, Math.floor(copies || 1))) }
          : assignment,
      ),
    });
  };

  return (
    <article className="overflow-hidden rounded-[2rem] border border-sage/25 bg-white shadow-sm" aria-labelledby={`print-group-${group.id}`}>
      <header className="flex items-start justify-between gap-4 border-b border-sage/15 bg-off-white/60 px-5 py-5 sm:px-7">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-terracotta">Gruppo {index + 1}</p>
          <h3 id={`print-group-${group.id}`} className="mt-1 text-xl font-semibold text-blue-gray">
            {product?.nome ?? 'Scegli formato'}
          </h3>
          <p className="mt-1 text-sm text-blue-gray/55">
            {group.assignments.length} foto · {groupCopyCount(group)} stampe
          </p>
        </div>
        {canRemove && (
          <Button type="button" variant="ghost" size="icon" onClick={onRemove} className="rounded-full text-blue-gray/45 hover:bg-red-50 hover:text-red-700" aria-label={`Elimina gruppo ${index + 1}`}>
            <Trash2 aria-hidden="true" />
          </Button>
        )}
      </header>

      <div className="space-y-8 p-5 sm:p-7">
        <div>
          <label htmlFor={`format-${group.id}`} className="text-sm font-semibold text-blue-gray">1. Scegli il formato</label>
          <select
            id={`format-${group.id}`}
            value={group.sku}
            onChange={(event) => chooseProduct(event.target.value)}
            className="mt-3 h-12 w-full rounded-xl border border-sage/30 bg-white px-4 text-sm text-blue-gray outline-none focus:border-sage focus:ring-2 focus:ring-sage/30"
          >
            <option value="">Seleziona un formato</option>
            {groupedProducts.map(({ category, products: categoryProducts }) => (
              <optgroup key={category.id} label={categoryName(category.id)}>
                {categoryProducts.map((entry) => (
                  <option key={entry.sku} value={entry.sku}>
                    {entry.nome} — {startingPriceLabel(entry)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {product && (
          <>
            <fieldset>
              <legend className="text-sm font-semibold text-blue-gray">2. Scegli la carta</legend>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {PRINT_FINISH_OPTIONS.filter((option) => product.printSpec.finishes.includes(option.value)).map((option) => (
                  <ChoiceCard<PrintFinish>
                    key={option.value}
                    {...option}
                    name={`finish-${group.id}`}
                    selected={group.finish === option.value}
                    onChange={(finish) => onChange({ ...group, finish })}
                  />
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-sm font-semibold text-blue-gray">3. Come vuoi vedere la foto?</legend>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {PRINT_FIT_OPTIONS.filter((option) => product.printSpec.fitModes.includes(option.value)).map((option) => (
                  <ChoiceCard<PrintFitMode>
                    key={option.value}
                    {...option}
                    name={`fit-${group.id}`}
                    selected={group.fitMode === option.value}
                    onChange={(fitMode) => onChange({ ...group, fitMode })}
                  />
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-sm font-semibold text-blue-gray">4. Scegli le foto per questo formato</legend>
              <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
                <p className="text-xs text-blue-gray/50">
                  {isPackage
                    ? `Polaroid: ${group.assignments.length} di ${packageSize} foto diverse selezionate.`
                    : 'Una foto può essere usata anche in un altro formato.'}
                </p>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={selectAll} className="rounded-full border-sage/30">
                    Seleziona {isPackage ? `le prime ${packageSize}` : 'tutte'}
                  </Button>
                  {group.assignments.length > 0 && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ ...group, assignments: [] })} className="rounded-full text-blue-gray/55">
                      Deseleziona
                    </Button>
                  )}
                </div>
              </div>

              <div className="mt-4 max-h-[34rem] overflow-y-auto rounded-2xl border border-sage/15 bg-off-white/40 p-3">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {photos.slice(0, visiblePhotoCount).map((photo) => {
                    const assignment = selectedByPhoto.get(photo.localId);
                    const selected = Boolean(assignment);
                    const selectionLimitReached = !selected && packageSize !== null && group.assignments.length >= packageSize;
                    const dpi = effectivePrintDpi(
                      photo.widthPx,
                      photo.heightPx,
                      product.printSpec.widthMm,
                      product.printSpec.heightMm,
                      group.fitMode,
                    );
                    const lowResolution = dpi < product.printSpec.qualityWarningDpi;
                    return (
                      <div key={photo.localId} className={`overflow-hidden rounded-xl border bg-white ${selected ? 'border-terracotta ring-1 ring-terracotta' : 'border-sage/15'}`}>
                        <button
                          type="button"
                          onClick={() => togglePhoto(photo.localId)}
                          disabled={selectionLimitReached}
                          className="relative block aspect-square w-full disabled:cursor-not-allowed disabled:opacity-45"
                          aria-pressed={selected}
                          aria-label={`${selected ? 'Deseleziona' : 'Seleziona'} ${photo.fileName}`}
                        >
                          {photo.previewUrl ? (
                            <img src={photo.previewUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center bg-sage/10 text-dark-sage" aria-hidden="true">
                              <ImageIcon className="h-9 w-9" />
                            </span>
                          )}
                          <span className={`absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white shadow ${selected ? 'bg-terracotta text-white' : 'bg-white/80 text-transparent'}`}>
                            <Check className="h-3.5 w-3.5" aria-hidden="true" />
                          </span>
                          {lowResolution && (
                            <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-amber-100/95 px-2 py-1 text-[10px] font-semibold text-amber-900" title={`Risoluzione stimata: ${dpi} DPI`}>
                              <AlertTriangle className="h-3 w-3" aria-hidden="true" /> Qualità bassa
                            </span>
                          )}
                        </button>
                        <div className="p-2">
                          <p className="truncate text-[11px] text-blue-gray/60" title={photo.fileName}>{photo.fileName}</p>
                          {selected && !isPackage && (
                            <label className="mt-2 flex items-center gap-2 text-xs font-medium text-blue-gray">
                              <Copy className="h-3.5 w-3.5 text-blue-gray/45" aria-hidden="true" />
                              Copie
                              <Input
                                type="number"
                                inputMode="numeric"
                                min={1}
                                max={999}
                                value={assignment?.copies ?? 1}
                                onChange={(event) => updateCopies(photo.localId, Number(event.target.value))}
                                className="ml-auto h-8 w-16 rounded-lg px-2 text-center"
                                aria-label={`Numero copie di ${photo.fileName}`}
                              />
                            </label>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {visiblePhotoCount < photos.length && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setVisiblePhotoCount((count) => count + 60)}
                    className="mt-3 w-full rounded-xl border-sage/25 bg-white"
                  >
                    Mostra altre foto ({photos.length - visiblePhotoCount})
                  </Button>
                )}
              </div>
            </fieldset>
          </>
        )}

        {issueMessages.length > 0 && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
            <p className="font-semibold">Controlla questo gruppo:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {Array.from(new Set(issueMessages)).map((message) => <li key={message}>{message}</li>)}
            </ul>
          </div>
        )}
      </div>
    </article>
  );
}

interface PrintGroupsEditorProps {
  groups: PrintGroupDraft[];
  products: PrintShopCatalogProduct[];
  photos: LocalPrintPhoto[];
  issuesByGroup: Map<string, string[]>;
  onGroupsChange: (groups: PrintGroupDraft[]) => void;
  onAddGroup: () => void;
}

export function PrintGroupsEditor({
  groups,
  products,
  photos,
  issuesByGroup,
  onGroupsChange,
  onAddGroup,
}: PrintGroupsEditorProps) {
  return (
    <div className="space-y-6">
      {groups.map((group, index) => (
        <PrintGroupEditor
          key={group.id}
          index={index}
          group={group}
          products={products}
          photos={photos}
          issueMessages={issuesByGroup.get(group.id)}
          canRemove={groups.length > 1}
          onChange={(nextGroup) => onGroupsChange(groups.map((entry) => entry.id === group.id ? nextGroup : entry))}
          onRemove={() => onGroupsChange(groups.filter((entry) => entry.id !== group.id))}
        />
      ))}

      <Button type="button" variant="outline" onClick={onAddGroup} className="h-12 w-full rounded-2xl border-dashed border-sage/40 bg-white text-blue-gray hover:bg-sage/5">
        <Plus aria-hidden="true" />
        Aggiungi un altro formato
      </Button>
    </div>
  );
}
