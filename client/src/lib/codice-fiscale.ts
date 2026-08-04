import { decodeCodiceFiscale } from "@shared/document-ocr";
import { isValidCodiceFiscale } from "@shared/fiscal-validation";

export interface CfDecoded {
  dataNascita?: string; // YYYY-MM-DD
  sesso?: "M" | "F";
  luogoNascita?: string; // "Comune (PR)" oppure undefined se estero/sconosciuto
}

let comuniPromise: Promise<Record<string, string>> | null = null;
function loadComuni(): Promise<Record<string, string>> {
  if (!comuniPromise) {
    comuniPromise = import("@shared/comuni-catastali.json").then(
      (m) => (m.default ?? m) as Record<string, string>
    );
  }
  return comuniPromise;
}

// Omocodia: nelle posizioni numeriche le cifre possono essere sostituite da lettere
const OMOCODIA: Record<string, string> = {
  L: "0", M: "1", N: "2", P: "3", Q: "4", R: "5", S: "6", T: "7", U: "8", V: "9",
};

/**
 * Decodifica un CF valido: data di nascita, sesso e comune di nascita
 * (dal codice catastale nelle posizioni 12-15). Ritorna null se il CF
 * non è valido (checksum errato o formato sbagliato).
 */
export async function decodeCfCompleto(cfRaw: string): Promise<CfDecoded | null> {
  const cf = cfRaw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (cf.length !== 16 || !isValidCodiceFiscale(cf)) return null;

  const base = decodeCodiceFiscale(cf);
  const result: CfDecoded = { ...base };

  // Codice catastale (Belfiore): lettera + 3 cifre (con eventuale omocodia)
  let code = cf.slice(11, 15);
  code =
    code[0] +
    code
      .slice(1)
      .split("")
      .map((c) => (/\d/.test(c) ? c : OMOCODIA[c] ?? c))
      .join("");
  if (code[0] === "Z") {
    // Nati all'estero: il codice indica lo Stato, non abbiamo la tabella
    result.luogoNascita = undefined;
  } else {
    const comuni = await loadComuni();
    result.luogoNascita = comuni[code];
  }
  return result;
}
