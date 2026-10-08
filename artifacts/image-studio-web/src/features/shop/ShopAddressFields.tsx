import type { PrintShopPostalAddress } from '@shared/print-shop-types';
import { splitStreetAndHouseNumber } from '@shared/places-utils';
import { AddressAutocompleteInput } from '@/components/places/AddressAutocompleteInput';
import { Input } from '@/components/ui/input';

export function blankPostalAddress(): PrintShopPostalAddress {
  return { street: '', houseNumber: '', postalCode: '', city: '', province: '', country: 'IT' };
}

export function postalAddressComplete(address: PrintShopPostalAddress): boolean {
  return Boolean(
    address.street.trim() &&
      address.houseNumber.trim() &&
      /^\d{5}$/.test(address.postalCode.trim()) &&
      address.city.trim() &&
      /^[A-Za-z]{2}$/.test(address.province.trim()),
  );
}

/** Indirizzo italiano con suggerimenti facoltativi: si può sempre scrivere a mano. */
export function ShopAddressFields({
  address,
  onChange,
  prefix,
  readOnly,
}: {
  address: PrintShopPostalAddress;
  onChange: (address: PrintShopPostalAddress) => void;
  prefix: string;
  readOnly?: boolean;
}) {
  const patch = (value: Partial<PrintShopPostalAddress>) => onChange({ ...address, ...value });
  return (
    <div className="grid gap-4 sm:grid-cols-6">
      <label className="text-sm font-semibold text-blue-gray sm:col-span-4">
        Via o piazza
        <AddressAutocompleteInput
          id={`${prefix}-street`}
          value={address.street}
          onChange={street => patch({ street })}
          buildSearchInput={street => [street, address.houseNumber].filter(Boolean).join(' ')}
          onSelect={selected => {
            const streetAndNumber = splitStreetAndHouseNumber(selected.via || '');
            patch({
              street: streetAndNumber.street,
              houseNumber: streetAndNumber.houseNumber,
              postalCode: selected.cap || '',
              city: selected.citta || '',
              province: selected.provincia || '',
            });
          }}
          autoComplete="address-line1"
          readOnly={readOnly}
          className="mt-2 h-12 rounded-xl font-normal"
          testId={`${prefix}-street`}
        />
      </label>
      <label className="text-sm font-semibold text-blue-gray sm:col-span-2">
        Numero civico
        <Input value={address.houseNumber} onChange={event => patch({ houseNumber: event.target.value })} autoComplete="address-line2" readOnly={readOnly} className="mt-2 h-12 rounded-xl font-normal" />
      </label>
      <label className="text-sm font-semibold text-blue-gray sm:col-span-2">
        CAP
        <Input inputMode="numeric" maxLength={5} value={address.postalCode} onChange={event => patch({ postalCode: event.target.value.replace(/\D/g, '').slice(0, 5) })} autoComplete="postal-code" readOnly={readOnly} className="mt-2 h-12 rounded-xl font-normal" />
      </label>
      <label className="text-sm font-semibold text-blue-gray sm:col-span-3">
        Città
        <Input value={address.city} onChange={event => patch({ city: event.target.value })} autoComplete="address-level2" readOnly={readOnly} className="mt-2 h-12 rounded-xl font-normal" />
      </label>
      <label className="text-sm font-semibold text-blue-gray sm:col-span-1">
        Prov.
        <Input maxLength={2} value={address.province} onChange={event => patch({ province: event.target.value.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() })} autoComplete="address-level1" readOnly={readOnly} placeholder="CE" className="mt-2 h-12 rounded-xl font-normal uppercase" />
      </label>
    </div>
  );
}
