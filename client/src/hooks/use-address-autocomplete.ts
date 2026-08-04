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
  const lastQueryRef = useRef('');

  const clear = useCallback(() => {
    setSuggestions([]);
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const search = useCallback((input: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!availableRef.current || input.trim().length < 4) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      lastQueryRef.current = input;
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
        // Ignora risposte fuori ordine
        if (lastQueryRef.current === input) {
          setSuggestions(data.suggestions || []);
        }
      } catch {
        // Silenzioso: il form resta utilizzabile come input libero
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  }, []);

  const resolveDetails = useCallback(async (placeId: string): Promise<ParsedAddress | null> => {
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
      return data.address as ParsedAddress;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  return { suggestions, loading, search, clear, resolveDetails };
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
  const [match, setMatch] = useState<CapMatch | null>(null);

  const lookup = useCallback((cap: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setMatch(null);
    if (!availableRef.current || !/^\d{5}$/.test(cap.trim())) return;
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await apiRequest('GET', `/api/places/cap-lookup?cap=${cap.trim()}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.available === false) {
          availableRef.current = false;
          return;
        }
        setMatch(data.match || null);
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
