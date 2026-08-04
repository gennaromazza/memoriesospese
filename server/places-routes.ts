/**
 * Places API Routes — proxy verso Google Places API (New)
 *
 * La chiave (GOOGLE_PLACES_API_KEY) resta lato server, mai esposta al browser.
 * Se la chiave manca o Google non risponde, gli endpoint rispondono 200 con
 * { available: false } così il form degrada silenziosamente a input libero.
 */
import { Router } from 'express';
import { authenticateFirebase } from './email-routes.js';
import { parseAddressComponents } from '../shared/places-utils.js';

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
  if (!input || typeof input !== 'string' || input.trim().length < 3) {
    return res.json({ available: true, suggestions: [] });
  }

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
        ...(sessionToken && { sessionToken: String(sessionToken) }),
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
  if (!placeId || !/^[\w-]+$/.test(placeId)) {
    return res.status(400).json({ error: 'placeId non valido' });
  }

  try {
    const params = new URLSearchParams({ languageCode: 'it' });
    if (req.query.sessionToken) params.set('sessionToken', String(req.query.sessionToken));

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
    const address = parseAddressComponents(data.addressComponents);
    return res.json({ available: true, address, formattedAddress: data.formattedAddress });
  } catch (error) {
    console.warn('⚠️ Places details non raggiungibile:', error);
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

export default router;
