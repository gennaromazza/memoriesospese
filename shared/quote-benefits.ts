/**
 * QUOTE BENEFITS ENGINE
 * Logica pura per calcolo benefici inclusi in base ai prodotti selezionati.
 *
 * Il "benefit" è uno o più prodotti specifici del preventivo che diventano
 * SERVIZIO INCLUSO quando il cliente seleziona certe combinazioni di altri prodotti.
 *
 * Tutte le funzioni sono pure (nessun side-effect).
 * La fonte di verità è il campo `benefitRules` sul documento Quote in Firestore.
 */

export type BenefitStatus = 'locked' | 'preview' | 'unlocked';

/**
 * Migra le regole benefit dal vecchio formato (benefitProductName: string)
 * al nuovo formato (benefitProductNames: string[]).
 * Chiamare ovunque si caricano dati da Firestore.
 */
export function migrateBenefitRules(rules: any[]): BenefitRule[] {
  if (!Array.isArray(rules)) return [];
  return rules.map(rule => {
    // Se ha già il nuovo formato, usalo così com'è
    if (Array.isArray(rule.benefitProductNames)) return rule as BenefitRule;
    // Migra dal vecchio formato: benefitProductName (string) → benefitProductNames (string[])
    const legacyName: string = rule.benefitProductName ?? '';
    return {
      id: rule.id,
      benefitProductNames: legacyName ? [legacyName] : [],
      enabled: rule.enabled ?? true,
      requiredProductNames: rule.requiredProductNames ?? [],
      minSelectableCount: rule.minSelectableCount,
    } as BenefitRule;
  });
}

/**
 * Regola benefit configurata dall'admin.
 * Definisce quali prodotti diventano Servizi Inclusi e in base a quali condizioni.
 */
export interface BenefitRule {
  id: string;
  benefitProductNames: string[];    // Nomi dei prodotti che diventano Servizi Inclusi
  enabled: boolean;

  requiredProductNames?: string[];  // Nomi esatti dei prodotti trigger richiesti (tutti)
  minSelectableCount?: number;      // Numero minimo di prodotti selezionabili che devono essere selezionati
}

/**
 * Stato calcolato di un singolo benefit.
 */
export interface BenefitState {
  rule: BenefitRule;
  status: BenefitStatus;
  isUnlocked: boolean;

  missingProductNames: string[];  // Prodotti trigger ancora da selezionare
  missingCount: number;           // Quanti prodotti mancano (per minSelectableCount)
  currentCount: number;           // Quanti prodotti selezionabili NON-benefit sono già selezionati

  feedbackMessage: string;        // Messaggio UI dinamico
}

/**
 * Calcola lo stato di ogni benefit in base ai prodotti selezionati.
 *
 * NOTA: i prodotti benefit stessi sono ESCLUSI dal conteggio `selectedSelectableCount`
 * usato per la soglia `minSelectableCount`. Questo evita il circolo vizioso dove
 * un benefit auto-selezionato contribuisce a mantenere sbloccata la propria regola.
 *
 * @param rules                     Regole configurate dall'admin (da `quote.benefitRules`)
 * @param selectedProductNames      Nomi dei prodotti selezionati dal cliente
 * @param allSelectableProductNames Tutti i nomi dei prodotti selezionabili del preventivo
 */
export function computeBenefitStates(
  rules: BenefitRule[],
  selectedProductNames: string[],
  allSelectableProductNames: string[]
): BenefitState[] {
  const selectedSet = new Set(selectedProductNames);

  // Raccoglie tutti i nomi di prodotti benefit da TUTTE le regole attive.
  // Questi vengono esclusi dal conteggio dei trigger per evitare il circolo vizioso:
  // un benefit auto-selezionato non deve contribuire a sbloccare se stesso.
  const allBenefitNames = new Set<string>(
    rules.filter(r => r.enabled).flatMap(r => r.benefitProductNames ?? [])
  );

  // Conta i prodotti selezionabili selezionati, ESCLUDENDO i prodotti benefit
  const selectedSelectableCount = selectedProductNames.filter(name =>
    allSelectableProductNames.includes(name) && !allBenefitNames.has(name)
  ).length;

  return rules
    .filter(rule => rule.enabled)
    .map(rule => {
      const missingProductNames = (rule.requiredProductNames ?? []).filter(
        name => !selectedSet.has(name)
      );

      const neededCount = rule.minSelectableCount ?? 0;
      const missingCount = neededCount > 0
        ? Math.max(0, neededCount - selectedSelectableCount)
        : 0;

      const hasRequiredProducts = rule.requiredProductNames && rule.requiredProductNames.length > 0
        ? missingProductNames.length === 0
        : true;

      const hasRequiredCount = rule.minSelectableCount
        ? selectedSelectableCount >= rule.minSelectableCount
        : true;

      const isUnlocked = hasRequiredProducts && hasRequiredCount;

      let status: BenefitStatus;
      if (isUnlocked) {
        status = 'unlocked';
      } else if (selectedSelectableCount > 0) {
        status = 'preview';
      } else {
        status = 'locked';
      }

      const benefitLabel = formatBenefitNames(rule.benefitProductNames);
      const feedbackMessage = isUnlocked
        ? `${benefitLabel} — inclusi come Servizio Incluso`
        : buildMissingMessage(rule, missingProductNames, missingCount);

      return {
        rule,
        status,
        isUnlocked,
        missingProductNames,
        missingCount,
        currentCount: selectedSelectableCount,
        feedbackMessage,
      };
    });
}

/** Formatta un array di nomi prodotto in una stringa leggibile */
function formatBenefitNames(names: string[]): string {
  if (!names || names.length === 0) return 'il servizio';
  if (names.length === 1) return names[0];
  const last = names[names.length - 1];
  const rest = names.slice(0, -1);
  return `${rest.join(', ')} e ${last}`;
}

function buildMissingMessage(
  rule: BenefitRule,
  missingProducts: string[],
  missingCount: number
): string {
  const benefitLabel = formatBenefitNames(rule.benefitProductNames);
  const parts: string[] = [];

  if (missingProducts.length === 1) {
    parts.push(`Aggiungi "${missingProducts[0]}" per sbloccare ${benefitLabel} come Servizio Incluso`);
  } else if (missingProducts.length > 1) {
    parts.push(`Aggiungi ${missingProducts.map(n => `"${n}"`).join(' e ')} per sbloccare ${benefitLabel} come Servizio Incluso`);
  }

  if (missingCount === 1) {
    parts.push(`Ti manca 1 servizio per sbloccare ${benefitLabel}`);
  } else if (missingCount > 1) {
    parts.push(`Ti mancano ${missingCount} servizi per sbloccare ${benefitLabel}`);
  }

  return parts.join(' · ') || `Seleziona i servizi per sbloccare ${benefitLabel}`;
}
