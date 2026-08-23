/**
 * Places API Routes — proxy verso Google Places API (New)
 *
 * La chiave (GOOGLE_PLACES_API_KEY) resta lato server, mai esposta al browser.
 * Se la chiave manca o Google non risponde, gli endpoint rispondono 200 con
 * { available: false } così il form degrada silenziosamente a input libero.
 */
import { Router } from 'express';
import { authenticateFirebase } from './email-routes.js';
import { parseAddressComponents, isItalianPlace } from '../shared/places-utils.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Session token valido solo se UUID; altrimenti viene ignorato. */
function sanitizeSessionToken(raw: unknown): string | undefined {
  const v = typeof raw === 'string' ? raw : '';
  return UUID_RE.test(v) ? v : undefined;
}

const router = Router();

const PLACES_BASE = 'https://places.googleapis.com/v1';

function getApiKey(): string | undefined {
  return process.env.GOOGLE_PLACES_API_KEY || undefined;
}

/**
 * POST /api/places/autocomplete
 * body: { input: string, sessionToken?: string }
 * Suggerimenti indirizzo ristretti all'Italia.
 */
router.post('/autocomplete', authenticateFirebase, async (req: any, res) => {
  const apiKey = getApiKey();
  const { input, sessionToken } = req.body || {};

  if (!apiKey) return res.json({ available: false, suggestions: [] });
  if (!input || typeof input !== 'string' || input.trim().length < 3 || input.length > 200) {
    return res.json({ available: true, suggestions: [] });
  }
  const safeSessionToken = sanitizeSessionToken(sessionToken);

  try {
    const response = await fetch(`${PLACES_BASE}/places:autocomplete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
      },
      body: JSON.stringify({
        input: input.trim(),
        languageCode: 'it',
        includedRegionCodes: ['it'],
        ...(safeSessionToken && { sessionToken: safeSessionToken }),
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`⚠️ Places autocomplete errore ${response.status}: ${errText.slice(0, 300)}`);
      return res.json({ available: false, suggestions: [] });
    }

    const data = await response.json();
    const suggestions = (data.suggestions || [])
      .map((s: any) => s.placePrediction)
      .filter(Boolean)
      .map((p: any) => ({
        placeId: p.placeId,
        text: p.text?.text || '',
      }))
      .filter((p: any) => p.placeId && p.text)
      .slice(0, 5);

    return res.json({ available: true, suggestions });
  } catch (error) {
    console.warn('⚠️ Places autocomplete non raggiungibile:', error);
    return res.json({ available: false, suggestions: [] });
  }
});

/**
 * GET /api/places/details/:placeId?sessionToken=...
 * Ritorna i 4 campi indirizzo già parsati.
 */
router.get('/details/:placeId', authenticateFirebase, async (req: any, res) => {
  const apiKey = getApiKey();
  if (!apiKey) return res.json({ available: false });

  const placeId = String(req.params.placeId || '');
  if (!placeId || placeId.length > 512 || !/^[\w-]+$/.test(placeId)) {
    return res.status(400).json({ error: 'placeId non valido' });
  }

  try {
    const params = new URLSearchParams({ languageCode: 'it' });
    const safeSessionToken = sanitizeSessionToken(req.query.sessionToken);
    if (safeSessionToken) params.set('sessionToken', safeSessionToken);

    const response = await fetch(`${PLACES_BASE}/places/${encodeURIComponent(placeId)}?${params}`, {
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'addressComponents,formattedAddress',
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`⚠️ Places details errore ${response.status}: ${errText.slice(0, 300)}`);
      return res.json({ available: false });
    }

    const data = await response.json();
    // Scope Italia: non restituire dettagli di luoghi esteri
    if (!isItalianPlace(data.addressComponents)) {
      return res.json({ available: true, address: null });
    }
    const address = parseAddressComponents(data.addressComponents);
    return res.json({ available: true, address, formattedAddress: data.formattedAddress });
  } catch (error) {
    console.warn('⚠️ Places details non raggiungibile:', error);
    return res.json({ available: false });
  }
});

/**
 * GET /api/places/business-details/:placeId
 * Dati pubblici di una location/attività. Viene chiamato solo dopo la scelta
 * dell'admin perché websiteUri appartiene alla fascia Enterprise di Places.
 */
router.get('/business-details/:placeId', authenticateFirebase, async (req: any, res) => {
  const apiKey = getApiKey();
  if (!apiKey) return res.json({ available: false });
  const placeId = String(req.params.placeId || '');
  if (!placeId || placeId.length > 512 || !/^[\w-]+$/.test(placeId)) {
    return res.status(400).json({ error: 'placeId non valido' });
  }
  try {
    const response = await fetch(`${PLACES_BASE}/places/${encodeURIComponent(placeId)}?languageCode=it`, {
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'id,displayName,formattedAddress,addressComponents,websiteUri,googleMapsUri,primaryTypeDisplayName',
      },
    });
    if (!response.ok) {
      const detail = await response.text();
      console.warn(`⚠️ Places business details errore ${response.status}: ${detail.slice(0, 300)}`);
      return res.json({ available: false });
    }
    const data = await response.json();
    if (!isItalianPlace(data.addressComponents)) return res.json({ available: true, place: null });
    const address = parseAddressComponents(data.addressComponents);
    return res.json({
      available: true,
      place: {
        placeId: data.id || placeId,
        name: data.displayName?.text || '',
        formattedAddress: data.formattedAddress || undefined,
        city: address.citta,
        province: address.provincia,
        websiteUri: data.websiteUri || undefined,
        googleMapsUri: data.googleMapsUri || undefined,
        primaryType: data.primaryTypeDisplayName?.text || undefined,
      },
    });
  } catch (error) {
    console.warn('⚠️ Places business details non raggiungibile:', error);
    return res.json({ available: false });
  }
});

/**
 * GET /api/places/cap-lookup?cap=20100
 * Rete di sicurezza CAP→città/provincia (suggerimento non bloccante).
 */
router.get('/cap-lookup', authenticateFirebase, async (req: any, res) => {
  const apiKey = getApiKey();
  if (!apiKey) return res.json({ available: false });

  const cap = String(req.query.cap || '').trim();
  if (!/^\d{5}$/.test(cap)) {
    return res.json({ available: true, match: null });
  }

  try {
    // Autocomplete ristretto ai codici postali italiani
    const acResponse = await fetch(`${PLACES_BASE}/places:autocomplete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
      },
      body: JSON.stringify({
        input: cap,
        languageCode: 'it',
        includedRegionCodes: ['it'],
        includedPrimaryTypes: ['postal_code'],
      }),
    });
    if (!acResponse.ok) return res.json({ available: false });

    const acData = await acResponse.json();
    const first = (acData.suggestions || []).map((s: any) => s.placePrediction).filter(Boolean)[0];
    if (!first?.placeId) return res.json({ available: true, match: null });

    const detResponse = await fetch(`${PLACES_BASE}/places/${encodeURIComponent(first.placeId)}?languageCode=it`, {
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'addressComponents',
      },
    });
    if (!detResponse.ok) return res.json({ available: false });

    const detData = await detResponse.json();
    const address = parseAddressComponents(detData.addressComponents);
    if (!address.citta) return res.json({ available: true, match: null });

    return res.json({
      available: true,
      match: { cap, citta: address.citta, provincia: address.provincia },
    });
  } catch (error) {
    console.warn('⚠️ Places cap-lookup non raggiungibile:', error);
    return res.json({ available: false });
  }
});

/**
 * GET /api/places/cap-by-city?citta=Frattamaggiore&provincia=NA
 * CAP dalla città (usato quando l'indirizzo scelto non ha il civico e Google
 * non fornisce il postal_code). Risponde col CAP solo se univoco: nelle città
 * con più CAP non tira a indovinare.
 */
router.get('/cap-by-city', authenticateFirebase, async (req: any, res) => {
  const apiKey = getApiKey();
  if (!apiKey) return res.json({ available: false });

  const citta = String(req.query.citta || '').trim();
  const provincia = String(req.query.provincia || '').trim();
  if (!citta || citta.length > 100 || provincia.length > 10) {
    return res.json({ available: true, cap: null });
  }

  try {
    // Text Search: per le città con CAP unico Google include postal_code,
    // per quelle multi-CAP (Milano, Roma, ...) lo omette → nessuna ipotesi azzardata
    const response = await fetch(`${PLACES_BASE}/places:searchText`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.addressComponents',
      },
      body: JSON.stringify({
        textQuery: `${citta}${provincia ? ` ${provincia}` : ''} Italia`,
        languageCode: 'it',
      }),
    });
    if (!response.ok) return res.json({ available: false });

    const data = await response.json();
    const comps: any[] = data.places?.[0]?.addressComponents || [];
    const locality = comps.find((c) => c.types?.includes('locality'))?.longText || '';
    const postal = comps.find((c) => c.types?.includes('postal_code'))?.longText || '';
    const isItaly = comps.some((c) => c.types?.includes('country') && c.shortText === 'IT');
    // Compila solo se il risultato è davvero la città richiesta (in Italia)
    const matches = isItaly && locality.toLowerCase() === citta.toLowerCase();
    const cap = matches && /^\d{5}$/.test(postal) ? postal : null;
    return res.json({ available: true, cap });
  } catch (error) {
    console.warn('⚠️ Places cap-by-city non raggiungibile:', error);
    return res.json({ available: false });
  }
});

export default router;
