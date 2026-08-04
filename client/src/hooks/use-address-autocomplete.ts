/**
 * Hook per l'autocompletamento indirizzo via proxy server (/api/places).
 * Degrada silenziosamente: se il server segnala available:false smette di interrogare.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '@/lib/queryClient';
import type { ParsedAddress } from '@shared/places-utils';

export interface AddressSuggestion {
  placeId: string;
  text: string;
}

export function useAddressAutocomplete() {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const availableRef = useRef(true); // fino a prova contraria
  const sessionTokenRef = useRef<string>(crypto.randomUUID());
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  // Generazione richieste: incrementata in modo sincrono a OGNI input,
  // così le risposte arrivate in ritardo (per input ormai obsoleti) vengono scartate.
  const generationRef = useRef(0);
  const detailsGenerationRef = useRef(0);

  const clear = useCallback(() => {
    generationRef.current += 1;
    setSuggestions([]);
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const search = useCallback((input: string) => {
    const generation = ++generationRef.current;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!availableRef.current || input.trim().length < 4) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      if (generation !== generationRef.current) return;
      setLoading(true);
      try {
        const res = await apiRequest('POST', '/api/places/autocomplete', {
          input,
          sessionToken: sessionTokenRef.current,
        });
        if (!res.ok) throw new Error('autocomplete failed');
        const data = await res.json();
        if (data.available === false) {
          availableRef.current = false;
          setSuggestions([]);
          return;
        }
        // Applica solo se questa è ancora la richiesta più recente
        if (generation === generationRef.current) {
          setSuggestions(data.suggestions || []);
        }
      } catch {
        // Silenzioso: il form resta utilizzabile come input libero
        if (generation === generationRef.current) setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  }, []);

  const resolveDetails = useCallback(async (placeId: string): Promise<ParsedAddress | null> => {
    const generation = ++detailsGenerationRef.current;
    try {
      const res = await apiRequest(
        'GET',
        `/api/places/details/${encodeURIComponent(placeId)}?sessionToken=${sessionTokenRef.current}`
      );
      if (!res.ok) return null;
      const data = await res.json();
      // Nuova sessione dopo la selezione (regola di billing Google)
      sessionTokenRef.current = crypto.randomUUID();
      if (data.available === false || !data.address) return null;
      // Se nel frattempo è stata selezionata un'altra voce, scarta questo risultato
      if (generation !== detailsGenerationRef.current) return null;
      return data.address as ParsedAddress;
    } catch {
      return null;
    }
  }, []);

  /**
   * CAP dalla città (quando l'indirizzo selezionato non include il civico
   * e quindi Google non fornisce il postal_code). Null se non univoco.
   */
  const resolveCapByCity = useCallback(async (citta: string, provincia?: string): Promise<string | null> => {
    try {
      const params = new URLSearchParams({ citta });
      if (provincia) params.set('provincia', provincia);
      const res = await apiRequest('GET', `/api/places/cap-by-city?${params}`);
      if (!res.ok) return null;
      const data = await res.json();
      return (data.available && data.cap) || null;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  return { suggestions, loading, search, clear, resolveDetails, resolveCapByCity };
}

export interface CapMatch {
  cap: string;
  citta: string;
  provincia?: string;
}

/**
 * Rete di sicurezza CAP→città: interroga il server quando il CAP è completo (5 cifre).
 */
export function useCapLookup() {
  const availableRef = useRef(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const generationRef = useRef(0);
  const [match, setMatch] = useState<CapMatch | null>(null);

  const lookup = useCallback((cap: string) => {
    // Generazione sincrona: ogni modifica del CAP invalida le risposte precedenti
    const generation = ++generationRef.current;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setMatch(null);
    if (!availableRef.current || !/^\d{5}$/.test(cap.trim())) return;
    debounceRef.current = setTimeout(async () => {
      if (generation !== generationRef.current) return;
      try {
        const res = await apiRequest('GET', `/api/places/cap-lookup?cap=${cap.trim()}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.available === false) {
          availableRef.current = false;
          return;
        }
        // Applica solo se il CAP non è cambiato nel frattempo
        if (generation === generationRef.current) {
          setMatch(data.match || null);
        }
      } catch {
        // silenzioso
      }
    }, 500);
  }, []);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  return { match, lookup, clearMatch: () => setMatch(null) };
}
