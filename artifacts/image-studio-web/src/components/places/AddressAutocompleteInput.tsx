import { useId, useRef, useState } from 'react';
import type { InputHTMLAttributes } from 'react';
import { Loader2, MapPin } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  useAddressAutocomplete,
  type PublicInfoFormPlacesAccess,
} from '@/hooks/use-address-autocomplete';
import type { VerifiedAddressReference } from '@shared/places-utils';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onSelect'> & {
  value: string;
  onChange: (value: string) => void;
  onSelect: (address: VerifiedAddressReference) => void;
  buildSearchInput?: (value: string) => string;
  publicInfoForm?: PublicInfoFormPlacesAccess;
  testId?: string;
};

/** Campo via con suggerimenti facoltativi e inserimento manuale sempre disponibile. */
export function AddressAutocompleteInput({
  value,
  onChange,
  onSelect,
  buildSearchInput,
  publicInfoForm,
  testId,
  onBlur,
  onFocus,
  ...inputProps
}: Props) {
  const places = useAddressAutocomplete(publicInfoForm);
  const [open, setOpen] = useState(false);
  const [resolving, setResolving] = useState(false);
  const selectionGeneration = useRef(0);
  const listId = useId();

  const selectSuggestion = async (placeId: string) => {
    const generation = ++selectionGeneration.current;
    setOpen(false);
    setResolving(true);
    try {
      const address = await places.resolveDetails(placeId);
      if (generation !== selectionGeneration.current || !address) return;
      onChange(address.via || '');
      onSelect(address);
    } finally {
      if (generation === selectionGeneration.current) setResolving(false);
    }
  };

  return (
    <div className="relative">
      <Input
        {...inputProps}
        value={value}
        autoComplete="off"
        data-testid={testId}
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={open && places.suggestions.length > 0}
        onChange={(event) => {
          const next = event.target.value;
          selectionGeneration.current += 1;
          setResolving(false);
          onChange(next);
          places.search(buildSearchInput?.(next) || next);
          setOpen(true);
        }}
        onFocus={(event) => {
          if (!inputProps.readOnly && !inputProps.disabled) setOpen(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          onBlur?.(event);
          setTimeout(() => setOpen(false), 150);
        }}
      />
      {(places.loading || resolving) && (
        <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-muted-foreground" aria-label="Ricerca indirizzo" />
      )}
      {open && places.suggestions.length > 0 && (
        <div
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md"
          data-testid={testId ? `${testId}-suggestions` : undefined}
        >
          {places.suggestions.map((suggestion) => (
            <button
              key={suggestion.placeId}
              type="button"
              role="option"
              aria-selected="false"
              className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => void selectSuggestion(suggestion.placeId)}
            >
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span>{suggestion.text}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}