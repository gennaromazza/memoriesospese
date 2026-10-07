import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

type StoredValueValidator<T extends string> = (value: string) => value is T;

/**
 * Mantiene uno stato stringa sincronizzato con la sessione del browser.
 *
 * Il validator è opzionale: serve a scartare valori legacy non più validi
 * senza cambiare il formato già presente in sessionStorage.
 */
export function useSessionStorageState<T extends string>(
  key: string,
  defaultValue: T,
  isValidValue?: StoredValueValidator<T>,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    const storedValue = sessionStorage.getItem(key);

    if (storedValue === null) {
      return defaultValue;
    }

    if (isValidValue && !isValidValue(storedValue)) {
      return defaultValue;
    }

    return storedValue as T;
  });

  useEffect(() => {
    sessionStorage.setItem(key, value);
  }, [key, value]);

  return [value, setValue];
}
