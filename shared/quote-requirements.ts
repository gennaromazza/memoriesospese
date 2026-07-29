/**
 * QUOTE REQUIREMENTS ENGINE (Esclusioni / Prerequisiti)
 *
 * Logica pura per le regole di ESCLUSIONE nei preventivi variabili:
 * alcuni prodotti sono selezionabili SOLO se il cliente ha già selezionato
 * determinati prodotti "trigger" (es. "Anteprima Video" richiede "Videomaker a casa").
 *
 * Speculare al motore benefit (shared/quote-benefits.ts) ma al contrario:
 * invece di regalare un prodotto quando le condizioni si attivano,
 * BLOCCA la selezione di un prodotto finché le condizioni non sono soddisfatte.
 *
 * Tutte le funzioni sono pure (nessun side-effect).
 * La fonte di verità è il campo `requirementRules` su template e Quote in Firestore.
 */

/** Tipo di regola:
 *  - 'requires': i prodotti bloccati sono selezionabili solo con TUTTI i trigger selezionati
 *  - 'excludes': i prodotti del gruppo si escludono a vicenda (max 1 selezionabile)
 */
export type RequirementRuleType = 'requires' | 'excludes';

/**
 * Regola requisito configurata dall'admin.
 * type 'requires': i prodotti in `blockedProductNames` sono selezionabili solo quando
 *   TUTTI i prodotti in `requiredProductNames` sono selezionati.
 * type 'excludes': i prodotti in `blockedProductNames` (≥2) sono mutuamente esclusivi:
 *   selezionandone uno, gli altri vengono bloccati. `requiredProductNames` non è usato.
 */
export interface RequirementRule {
  id: string;
  enabled: boolean;
  type: RequirementRuleType;
  blockedProductNames: string[];   // requires: prodotti bloccati | excludes: gruppo mutuamente esclusivo
  requiredProductNames: string[];  // requires: prodotti trigger richiesti (TUTTI) | excludes: non usato
}

/** Stato calcolato di un singolo prodotto bloccato da una o più regole */
export interface BlockedProductState {
  productName: string;
  isBlocked: boolean;
  missingProductNames: string[];  // Trigger ancora da selezionare (unione tra le regole che lo bloccano)
  message: string;                // Messaggio UI: "Richiede: X" / "Richiede: X e Y"
}

/** Normalizza regole caricate da Firestore (campi mancanti → default sicuri) */
export function migrateRequirementRules(rules: any[]): RequirementRule[] {
  if (!Array.isArray(rules)) return [];
  return rules
    .filter(r => r && typeof r === 'object')
    .map(r => ({
      id: String(r.id ?? ''),
      enabled: r.enabled !== false,
      type: (r.type === 'excludes' ? 'excludes' : 'requires') as RequirementRuleType,
      blockedProductNames: Array.isArray(r.blockedProductNames) ? r.blockedProductNames.filter(Boolean) : [],
      requiredProductNames: Array.isArray(r.requiredProductNames) ? r.requiredProductNames.filter(Boolean) : [],
    }));
}

/** Formatta i nomi mancanti: "X" oppure "X e Y" oppure "X, Y e Z" */
export function formatRequiredNames(names: string[]): string {
  if (!names || names.length === 0) return '';
  if (names.length === 1) return names[0];
  const last = names[names.length - 1];
  return `${names.slice(0, -1).join(', ')} e ${last}`;
}

/**
 * Calcola la mappa dei prodotti bloccati in base ai prodotti selezionati.
 *
 * Una regola è "soddisfatta" quando TUTTI i suoi requiredProductNames sono selezionati.
 * Un prodotto è bloccato se ALMENO UNA regola attiva che lo contiene non è soddisfatta.
 * Regole senza trigger o senza prodotti bloccati vengono ignorate (mai bloccare tutto per errore).
 *
 * @param rules                Regole configurate dall'admin
 * @param selectedProductNames Nomi dei prodotti attualmente selezionati.
 *   CONTRATTO per i chiamanti: includere SEMPRE anche i prodotti "sempre inclusi"
 *   (selectable === false oppure isOmaggio), altrimenti i trigger/gruppi che li
 *   contengono producono risultati errati.
 * @returns Mappa nome prodotto → stato di blocco (solo per i prodotti attualmente bloccati)
 */
export function computeBlockedProducts(
  rules: RequirementRule[],
  selectedProductNames: string[]
): Map<string, BlockedProductState> {
  const selectedSet = new Set(selectedProductNames);
  const blocked = new Map<string, BlockedProductState>();

  const addBlock = (productName: string, causeNames: string[], buildMessage: (names: string[]) => string) => {
    const existing = blocked.get(productName);
    const merged = existing
      ? Array.from(new Set([...existing.missingProductNames, ...causeNames]))
      : [...causeNames];
    blocked.set(productName, {
      productName,
      isBlocked: true,
      missingProductNames: merged,
      // Nota: se lo stesso prodotto è bloccato da regole di tipo diverso,
      // prevale il messaggio dell'ultima regola valutata (caso raro, comunque bloccato)
      message: buildMessage(merged),
    });
  };

  for (const rule of rules) {
    if (!rule.enabled) continue;

    if (rule.type === 'excludes') {
      // Gruppo mutuamente esclusivo: serve un gruppo di almeno 2 prodotti
      const group = rule.blockedProductNames ?? [];
      if (group.length < 2) continue;
      // Membri del gruppo selezionati, nell'ordine della selezione corrente
      const selectedMembers = selectedProductNames.filter(name => group.includes(name));
      if (selectedMembers.length === 0) continue; // nessuno selezionato → tutti liberi
      const first = selectedMembers[0];
      for (const productName of group) {
        // Blocca tutti gli altri membri; se più di uno è selezionato (stato sporco),
        // resta libero solo il PRIMO selezionato — gli altri vengono bloccati/rimossi
        if (productName === first) continue;
        addBlock(productName, [first], names => `Non compatibile con: ${formatRequiredNames(names)}`);
      }
      continue;
    }

    // type 'requires'
    if (!rule.blockedProductNames?.length || !rule.requiredProductNames?.length) continue;

    const missing = rule.requiredProductNames.filter(name => !selectedSet.has(name));
    if (missing.length === 0) continue; // regola soddisfatta → nessun blocco

    for (const productName of rule.blockedProductNames) {
      addBlock(productName, missing, names => `Richiede: ${formatRequiredNames(names)}`);
    }
  }

  return blocked;
}

/**
 * Ripulisce una selezione rimuovendo i prodotti bloccati, a cascata fino a stabilità.
 *
 * La cascata serve perché rimuovere un prodotto può bloccarne altri:
 * es. togliendo "Videomaker a casa" si rimuove "Anteprima Video", e se un'altra
 * regola richiedeva "Anteprima Video" per "Permanenza al ristorante", cade anche quella.
 *
 * @returns selezione valida + elenco dei prodotti rimossi (in ordine di rimozione)
 */
export function sanitizeSelection(
  rules: RequirementRule[],
  selectedProductNames: string[]
): { selection: string[]; removed: string[] } {
  let current = [...selectedProductNames];
  const removed: string[] = [];

  // Fixpoint: al massimo N iterazioni (ogni iterazione rimuove almeno 1 prodotto)
  for (let i = 0; i <= selectedProductNames.length; i++) {
    const blocked = computeBlockedProducts(rules, current);
    const toRemove = current.filter(name => blocked.has(name));
    if (toRemove.length === 0) break;
    removed.push(...toRemove);
    current = current.filter(name => !blocked.has(name));
  }

  return { selection: current, removed };
}

/**
 * Valida una selezione senza modificarla (per il server).
 * @returns lista dei prodotti selezionati che risultano bloccati (vuota = selezione valida)
 */
export function findInvalidSelections(
  rules: RequirementRule[],
  selectedProductNames: string[]
): BlockedProductState[] {
  const blocked = computeBlockedProducts(rules, selectedProductNames);
  return selectedProductNames
    .filter(name => blocked.has(name))
    .map(name => blocked.get(name)!);
}
