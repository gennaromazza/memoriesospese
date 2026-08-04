/**
 * Helper puri per Google Places (New API) — parsing addressComponents.
 */

export interface PlaceAddressComponent {
  types: string[];
  longText?: string;
  shortText?: string;
}

export interface ParsedAddress {
  via?: string;
  citta?: string;
  cap?: string;
  provincia?: string;
}

/**
 * Converte gli addressComponents di Place Details (New) nei 4 campi
 * indirizzo dell'anagrafica: via (con civico), città, CAP, provincia (sigla).
 */
export function parseAddressComponents(components: PlaceAddressComponent[] | undefined): ParsedAddress {
  if (!components?.length) return {};
  const find = (type: string) => components.find((c) => c.types?.includes(type));

  const route = find('route')?.longText;
  const streetNumber = find('street_number')?.longText;
  const via = route ? (streetNumber ? `${route}, ${streetNumber}` : route) : undefined;

  // Città: locality è il comune; alcuni luoghi usano postal_town o admin_area_level_3
  const citta =
    find('locality')?.longText ||
    find('postal_town')?.longText ||
    find('administrative_area_level_3')?.longText;

  const cap = find('postal_code')?.longText;

  // Provincia: sigla (es. MI) da administrative_area_level_2
  const provinciaShort = find('administrative_area_level_2')?.shortText;
  const provincia = provinciaShort && provinciaShort.length <= 3 ? provinciaShort.toUpperCase() : provinciaShort;

  return {
    via: via || undefined,
    citta: citta || undefined,
    cap: cap || undefined,
    provincia: provincia || undefined,
  };
}
