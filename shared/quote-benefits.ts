/**
 * QUOTE BENEFITS ENGINE
 * Logica pura per calcolo benefici inclusi in base ai servizi selezionati.
 *
 * Tutte le funzioni sono pure (nessun side-effect).
 * La fonte di verità è il campo `benefitRules` sul documento Quote in Firestore.
 */

export type BenefitStatus = 'locked' | 'preview' | 'unlocked';

/**
 * Regola benefit configurata dall'admin.
 * Almeno una condizione (requiredProductNames o minSelectableCount) deve essere definita.
 */
export interface BenefitRule {
  id: string;
  name: string;                     // Es. "Gallery digitale"
  description?: string;             // Descrizione opzionale
  valueEur?: number;                // Valore economico (solo marketing, NON sommato al totale)
  enabled: boolean;

  requiredProductNames?: string[];  // Nomi esatti dei prodotti selezionabili richiesti
  minSelectableCount?: number;      // Numero minimo di prodotti selezionabili che devono essere selezionati
}

/**
 * Stato calcolato di un singolo benefit.
 */
export interface BenefitState {
  rule: BenefitRule;
  status: BenefitStatus;
  isUnlocked: boolean;

  missingProductNames: string[];  // Prodotti ancora da selezionare (per requiredProductNames)
  missingCount: number;           // Quanti prodotti mancano (per minSelectableCount)
  currentCount: number;           // Quanti prodotti selezionabili sono già selezionati

  feedbackMessage: string;        // Messaggio UI dinamico
}

/**
 * Calcola lo stato di ogni benefit in base ai prodotti selezionati.
 *
 * @param rules                    Regole configurate sull'admin (da `quote.benefitRules`)
 * @param selectedProductNames     Nomi dei prodotti selezionati dal cliente
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

      const hasRequiredProducts = rule.requiredProductNames
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
        ? `${rule.name} – incluso per voi`
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
  const parts: string[] = [];

  if (missingProducts.length === 1) {
    parts.push(`Aggiungi "${missingProducts[0]}" per attivare ${rule.name}`);
  } else if (missingProducts.length > 1) {
    parts.push(`Aggiungi ${missingProducts.map(n => `"${n}"`).join(' e ')} per attivare ${rule.name}`);
  }

  if (missingCount === 1) {
    parts.push(`Ti manca 1 servizio per attivare ${rule.name}`);
  } else if (missingCount > 1) {
    parts.push(`Ti mancano ${missingCount} servizi per attivare ${rule.name}`);
  }

  return parts.join(' · ') || `Seleziona i servizi per sbloccare ${rule.name}`;
}
