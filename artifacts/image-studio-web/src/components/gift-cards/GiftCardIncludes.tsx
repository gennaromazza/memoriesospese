import { useState } from 'react';
import type { GiftCardItemDto } from '@shared/gift-card-types';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import './gift-cards.css';

interface Props {
  includes: string;
  items: GiftCardItemDto[];
}

/** «Cosa include» per chi riceve il regalo: testo dello studio e prodotti del catalogo, senza prezzi. */
export function GiftCardIncludes({ includes, items }: Props) {
  const [open, setOpen] = useState<GiftCardItemDto | null>(null);
  const [photo, setPhoto] = useState(0);
  if (!includes && !items.length) return null;

  const show = (item: GiftCardItemDto) => {
    setPhoto(0);
    setOpen(item);
  };

  return (
    <section className="gcx-includes" aria-labelledby="gcx-includes-title">
      <h2 id="gcx-includes-title" className="gcx-includes-title">Cosa include</h2>
      {includes ? <p className="gcx-includes-text">{includes}</p> : null}
      {items.length ? (
        <ul className="gcx-items">
          {items.map(item => (
            <li key={item.productId}>
              <button type="button" className="gcx-item" onClick={() => show(item)} aria-label={`Vedi ${item.name}`}>
                {item.imageUrls[0] ? (
                  <img src={item.imageUrls[0]} alt="" loading="lazy" />
                ) : (
                  <span className="gcx-item-empty" aria-hidden="true" />
                )}
                <span className="gcx-item-meta">
                  <b>{item.name}</b>
                  {item.quantity > 1 ? <span>× {item.quantity}</span> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <Dialog open={!!open} onOpenChange={value => { if (!value) setOpen(null); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          {open ? (
            <>
              <DialogHeader>
                <DialogTitle>{open.name}{open.quantity > 1 ? ` × ${open.quantity}` : ''}</DialogTitle>
                {open.description ? <DialogDescription className="whitespace-pre-line text-left">{open.description}</DialogDescription> : null}
              </DialogHeader>
              {open.imageUrls.length ? (
                <div className="space-y-2">
                  <img src={open.imageUrls[Math.min(photo, open.imageUrls.length - 1)]} alt={open.name} className="max-h-[50dvh] w-full rounded-md object-contain" />
                  {open.imageUrls.length > 1 ? (
                    <div className="flex flex-wrap gap-2">
                      {open.imageUrls.map((url, index) => (
                        <button key={url} type="button" onClick={() => setPhoto(index)} aria-label={`Foto ${index + 1}`} aria-pressed={index === photo} className={`h-14 w-14 overflow-hidden rounded border-2 ${index === photo ? 'border-foreground' : 'border-transparent'}`}>
                          <img src={url} alt="" className="h-full w-full object-cover" />
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
