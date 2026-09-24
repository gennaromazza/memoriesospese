import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Check, Copy } from 'lucide-react';
import type { SelectionResultPhoto, SelectionResults } from '../../lib/api-hooks';

/**
 * Read-only view of the client's selection, matching the web admin: photo
 * notes, thumbnails grouped by chapter, and Lightroom filename lists (overall
 * and per product) that can be copied to the clipboard.
 */
export function SelectionResultsPanel({ results }: { results?: SelectionResults }) {
  const photos = results?.photos || [];
  const byChapter = useMemo(() => groupBy(photos, p => p.chapterName || 'Senza capitolo'), [photos]);
  const byProduct = useMemo(() => {
    const groups = new Map<string, SelectionResultPhoto[]>();
    photos.forEach(p => p.products.forEach(product => groups.set(product, [...(groups.get(product) || []), p])));
    return [...groups.entries()];
  }, [photos]);
  const noted = photos.filter(p => p.note);
  if (!photos.length) return <p className="text-sm text-muted-foreground">Il cliente non ha ancora selezionato foto.</p>;
  return (
    <div className="space-y-4">
      {results?.notes && <div className="rounded-md border bg-muted/40 p-3 text-sm"><span className="font-medium">Note del cliente:</span> <span className="whitespace-pre-wrap">{results.notes}</span></div>}
      {noted.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Note per foto ({noted.length})</h4>
          {noted.map(p => <div key={p.id} className="rounded border p-2 text-xs"><span className="font-medium">{p.exportName}</span>: <span className="whitespace-pre-wrap">{p.note}</span></div>)}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-medium mr-auto">Foto selezionate ({photos.length})</h4>
        <CopyListButton label="Copia lista per Lightroom" text={photos.map(p => p.exportName).join('\n')} />
      </div>
      {byProduct.length > 0 && (
        <div className="space-y-2">
          {byProduct.map(([product, list]) => (
            <div key={product} className="flex items-center justify-between rounded border p-2 text-xs">
              <span>{product} <span className="text-muted-foreground">({list.length} foto)</span></span>
              <CopyListButton label="Copia lista" text={list.map(p => p.exportName).join('\n')} />
            </div>
          ))}
        </div>
      )}
      {byChapter.map(([chapter, list]) => (
        <details key={chapter} className="rounded-md border">
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium">{chapter} <span className="font-normal text-muted-foreground">({list.length} foto)</span></summary>
          <div className="grid grid-cols-4 gap-2 p-3 sm:grid-cols-6">
            {list.map(p => (
              <figure key={p.id} className="space-y-1">
                {p.url ? <img src={p.url} alt={p.exportName} loading="lazy" className="aspect-square w-full rounded object-cover" /> : <div className="aspect-square w-full rounded bg-muted" />}
                <figcaption className="truncate text-[10px] text-muted-foreground" title={p.exportName}>{p.exportName}</figcaption>
              </figure>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}

function CopyListButton({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button type="button" variant="outline" size="sm" onClick={async () => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (e) {
        window.alert(`Impossibile copiare negli appunti: ${(e as Error).message}`);
      }
    }}>
      {copied ? <Check className="mr-2 h-3 w-3" /> : <Copy className="mr-2 h-3 w-3" />}{copied ? 'Copiato' : label}
    </Button>
  );
}

function groupBy<T>(list: T[], key: (item: T) => string): Array<[string, T[]]> {
  const groups = new Map<string, T[]>();
  list.forEach(item => groups.set(key(item), [...(groups.get(key(item)) || []), item]));
  return [...groups.entries()];
}
