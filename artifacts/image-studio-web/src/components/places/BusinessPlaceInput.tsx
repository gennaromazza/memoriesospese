import { useState } from 'react';
import { ExternalLink, Loader2, MapPin, ShieldCheck } from 'lucide-react';
import type { VerifiedPlaceReference } from '@shared/places-utils';
import { useAddressAutocomplete } from '@/hooks/use-address-autocomplete';
import { Input } from '@/components/ui/input';

interface Props {
  value: string;
  place?: VerifiedPlaceReference;
  placeholder?: string;
  testId?: string;
  onChange: (value: string) => void;
  onPlaceChange: (place?: VerifiedPlaceReference) => void;
}

export function BusinessPlaceInput({ value, place, placeholder, testId, onChange, onPlaceChange }: Props) {
  const places = useAddressAutocomplete();
  const [open, setOpen] = useState(false);
  const [resolving, setResolving] = useState(false);

  const select = async (placeId: string) => {
    setOpen(false);
    setResolving(true);
    const resolved = await places.resolveBusinessDetails(placeId);
    setResolving(false);
    if (!resolved) return;
    onPlaceChange(resolved);
    onChange(resolved.name || value);
    places.clear();
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <Input
          value={value}
          placeholder={placeholder}
          data-testid={testId}
          autoComplete="off"
          onChange={event => {
            const next = event.target.value;
            onChange(next);
            onPlaceChange(undefined);
            places.search(next);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {(places.loading || resolving) && <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-muted-foreground" />}
        {open && places.suggestions.length > 0 && (
          <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
            {places.suggestions.map(suggestion => (
              <button
                key={suggestion.placeId}
                type="button"
                className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                onMouseDown={event => { event.preventDefault(); void select(suggestion.placeId); }}
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span>{suggestion.text}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {place && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-800">
          <span className="flex items-center gap-1 font-medium"><ShieldCheck className="h-3.5 w-3.5" /> Luogo verificato con Google</span>
          <span className="mt-1 block">{[place.city, place.province].filter(Boolean).join(' · ') || place.formattedAddress}</span>
          <span className="mt-1 flex flex-wrap gap-3">
            {place.websiteUri && <a href={place.websiteUri} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline"><ExternalLink className="h-3 w-3" /> Sito</a>}
            {place.googleMapsUri && <a href={place.googleMapsUri} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline"><MapPin className="h-3 w-3" /> Maps</a>}
          </span>
        </div>
      )}
    </div>
  );
}
