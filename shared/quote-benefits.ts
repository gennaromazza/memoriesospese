/**
 * QUOTE BENEFITS ENGINE
 * Logica pura per calcolo benefici inclusi in base ai prodotti selezionati.
 *
 * Il "benefit" è un prodotto specifico del preventivo che diventa GRATUITO
 * quando il cliente seleziona certe combinazioni di altri prodotti.
 *
 * Tutte le funzioni sono pure (nessun side-effect).
 * La fonte di verità è il campo `benefitRules` sul documento Quote in Firestore.
 */

export type BenefitStatus = 'locked' | 'preview' | 'unlocked';

/**
 * Regola benefit configurata dall'admin.
 * Definisce quale prodotto diventa gratuito e in base a quali condizioni.
 */
export interface BenefitRule {
  id: string;
  benefitProductName: string;       // Nome del prodotto che diventa GRATUITO (in omaggio)
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
  currentCount: number;           // Quanti prodotti selezionabili sono già selezionati

  feedbackMessage: string;        // Messaggio UI dinamico
}

/**
 * Calcola lo stato di ogni benefit in base ai prodotti selezionati.
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

  const selectedSelectableCount = selectedProductNames.filter(name =>
    allSelectableProductNames.includes(name)
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

      const feedbackMessage = isUnlocked
        ? `${rule.benefitProductName} — incluso in omaggio per voi`
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

function buildMissingMessage(
  rule: BenefitRule,
  missingProducts: string[],
  missingCount: number
): string {
  const benefitName = rule.benefitProductName || 'il beneficio';
  const parts: string[] = [];

  if (missingProducts.length === 1) {
    parts.push(`Aggiungi "${missingProducts[0]}" per ricevere ${benefitName} in omaggio`);
  } else if (missingProducts.length > 1) {
    parts.push(`Aggiungi ${missingProducts.map(n => `"${n}"`).join(' e ')} per ricevere ${benefitName} in omaggio`);
  }

  if (missingCount === 1) {
    parts.push(`Ti manca 1 servizio per ricevere ${benefitName} in omaggio`);
  } else if (missingCount > 1) {
    parts.push(`Ti mancano ${missingCount} servizi per ricevere ${benefitName} in omaggio`);
  }

  return parts.join(' · ') || `Seleziona i servizi per ricevere ${benefitName} in omaggio`;
}
