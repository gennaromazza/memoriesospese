/**
 * QUOTE PUBLIC VIEW PAGE
 * Portale pubblico cliente per visualizzare e firmare preventivo
 */

import { useEffect, useState, useRef, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
// Removed SignatureCanvas - now using text-based signature with elegant font
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Loader2,
  FileText,
  CheckCircle2,
  AlertCircle,
  Trash2,
  MapPin,
  Calendar as CalendarIcon,
  Clock,
  User,
  Mail,
  Phone,
  Home,
  Globe,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Gift,
  Sparkles,
  Zap,
  Lock,
  Unlock,
  PartyPopper,
  CreditCard,
  Timer,
  AlertTriangle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import placeholderUrl from "@assets/generated_images/Custom_product_placeholder_image_f076e89e.png";
import { useToast } from "@/hooks/use-toast";
import { acceptQuote } from "@/lib/quotes";
import type { Quote, QuoteProduct, QuoteClause } from "@shared/quotes-types";
import { calculateQuoteTotals } from "@shared/quote-utils";
import {
  computeBenefitStates,
  migrateBenefitRules,
} from "@shared/quote-benefits";
import type { BenefitState } from "@shared/quote-benefits";
import DOMPurify from "dompurify";
import { formatDueDate } from "@shared/payment-schedule-utils";
import type { PaymentSchedulePreview } from "@shared/payment-schedule-utils";
import { useCountdown } from "@/hooks/useCountdown";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";

interface QuotePublicData {
  quote: Quote;
  jobInfo: {
    nomeEvento?: string;
    eventDate?: string | null;
    location?: string;
    rito?: string;
    rituTime?: string;
    startTime?: string;
    endTime?: string;
    allDay?: boolean;
  } | null;
  clientiInfo?: Array<{
    id: string;
    nome?: string;
    cognome?: string;
    email?: string;
    telefono?: string;
    indirizzo?: string;
    citta?: string;
    cap?: string;
  }>;
  appuntamentiClienti?: Array<{
    clienteId: string;
    orarioAppuntamento?: string;
    noteAppuntamento?: string;
  }>;
  jobTypeInfo?: {
    id?: string;
    nome?: string;
    imageUrl?: string;
  } | null;
}

export default function QuotePublicViewPage() {
  const params = useParams();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const token = params.token;

  // State
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [acceptedClauses, setAcceptedClauses] = useState<string[]>([]);
  const [signerName, setSignerName] = useState("");
  const [studioLogo, setStudioLogo] = useState<string | null>(null);
  const [expandedDescriptions, setExpandedDescriptions] = useState<Set<number>>(
    new Set(),
  );
  const [showBenefitGuide, setShowBenefitGuide] = useState(false);
  const [animatingBenefits, setAnimatingBenefits] = useState<Set<string>>(
    new Set(),
  );
  const [paymentPlanCollapsed, setPaymentPlanCollapsed] = useState(true);
  const prevUnlockedRuleKeyRef = useRef<string | null>(null);
  const benefitInitializedRef = useRef<boolean>(false);
  // Ref stabile per benefitStates: evita closure stale negli useEffect con deps stabili
  const benefitStatesRef = useRef<BenefitState[]>([]);
  // Auto-seleziona i prodotti trigger necessari per sbloccare UNA specifica regola benefit
  // I prodotti benefit stessi NON vengono aggiunti — il cliente li sceglie liberamente
  // FIX: usa updater funzionale per evitare closure stale su selectedProducts
  const autoFillForRule = (bs: BenefitState) => {
    if (!quote) return;
    const allSelectableNames = (quote.products ?? [])
      .filter((p) => p.selectable)
      .map((p) => p.nome);
    setSelectedProducts((prev) => {
      const neededNames = new Set<string>(prev);

      // Aggiungi tutti i prodotti trigger richiesti per questa regola
      for (const name of bs.rule.requiredProductNames ?? []) {
        neededNames.add(name);
      }
      // Se ha minSelectableCount, aggiungi abbastanza prodotti selezionabili
      if (bs.rule.minSelectableCount && bs.rule.minSelectableCount > 0) {
        const currentCount = Array.from(neededNames).filter((n) =>
          allSelectableNames.includes(n),
        ).length;
        let count = currentCount;
        for (const name of allSelectableNames) {
          if (count >= bs.rule.minSelectableCount) break;
          if (!neededNames.has(name)) {
            neededNames.add(name);
            count++;
          }
        }
      }
      return Array.from(neededNames);
    });
    setShowBenefitGuide(false);
  };

  const toggleDescription = (idx: number) => {
    setExpandedDescriptions((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  };

  // Fetch quote data
  const { data, isLoading, error } = useQuery<{
    success: boolean;
    data: QuotePublicData;
  }>({
    queryKey: ["/api/quotes/public", token],
    queryFn: async () => {
      const response = await fetch(`/api/quotes/public/${token}`);
      if (!response.ok) {
        throw new Error("Failed to fetch quote");
      }
      return response.json();
    },
    enabled: !!token,
  });

  const portalData = data?.data;
  const quote = portalData?.quote;
  const jobInfo = portalData?.jobInfo;
  const clientiInfo = portalData?.clientiInfo || [];
  const appuntamentiClienti = portalData?.appuntamentiClienti || [];
  const jobTypeInfo = portalData?.jobTypeInfo;

  // Initialize selected products for variabile quotes.
  // Rimuove i prodotti benefit che non hanno la regola soddisfatta con i trigger pre-selezionati,
  // così al caricamento non compaiono "checkati a prezzo pieno" in modo contraddittorio.
  useEffect(() => {
    if (quote?.type === "variabile" && quote.products) {
      const allPreselected = quote.products
        .filter((p) => p.selected === true)
        .map((p) => p.nome);

      const allSelectableNames = quote.products
        .filter((p) => p.selectable)
        .map((p) => p.nome);
      const rules = migrateBenefitRules(quote.benefitRules ?? []);
      const initStates = computeBenefitStates(
        rules,
        allPreselected,
        allSelectableNames,
      );

      // Nomi di tutti i prodotti benefit (in qualsiasi regola)
      const allBenefitNames = new Set<string>(
        rules.flatMap((r) => r.benefitProductNames ?? []),
      );

      // Stato per nome benefitProduct → isUnlocked
      // FIX: usa lo stato più favorevole — se il prodotto appare in più regole,
      // una sola regola sbloccata è sufficiente per mantenerlo selezionato.
      // Non sovrascrivere con false se già true (stesso comportamento di omaggioByProductName).
      const benefitUnlockedMap = new Map<string, boolean>();
      for (const bs of initStates) {
        for (const name of bs.rule.benefitProductNames ?? []) {
          if (!benefitUnlockedMap.get(name)) {
            benefitUnlockedMap.set(name, bs.isUnlocked);
          }
        }
      }

      // Mantieni solo i prodotti che NON sono benefit, oppure che sono benefit con regola attiva
      const cleanSelected = allPreselected.filter((name) => {
        if (!allBenefitNames.has(name)) return true; // prodotto normale → tienilo
        return benefitUnlockedMap.get(name) === true; // benefit → solo se regola attiva
      });

      setSelectedProducts(cleanSelected);

      // FIX Bug #1: Pre-sincronizza le ref del toast-effect con la chiave calcolata
      // sui prodotti puliti, così il toast non vede un falso "sblocco" al caricamento.
      const initBenefitStates = computeBenefitStates(rules, cleanSelected, allSelectableNames);
      const initUnlockedKey = initBenefitStates
        .filter((bs) => bs.isUnlocked)
        .map((bs) => bs.rule.id)
        .sort()
        .join(",");
      prevUnlockedRuleKeyRef.current = initUnlockedKey;
      benefitInitializedRef.current = true;
    }
  }, [quote]);

  // Load studio logo
  useEffect(() => {
    async function loadStudioLogo() {
      try {
        const settingsDoc = await getDoc(doc(db, "settings", "studio"));
        if (settingsDoc.exists()) {
          const settings = settingsDoc.data();
          if (settings.logo) {
            setStudioLogo(settings.logo);
          }
        }
      } catch (error) {
        console.error("Error loading studio logo:", error);
      }
    }
    loadStudioLogo();
  }, []);

  // Set theme colors
  useEffect(() => {
    if (quote?.theme) {
      document.documentElement.style.setProperty(
        "--theme-primary",
        quote.theme.primaryColor || "#8B9A8B",
      );
      document.documentElement.style.setProperty(
        "--theme-secondary",
        quote.theme.secondaryColor || "#C8D4C8",
      );
    }
    return () => {
      document.documentElement.style.removeProperty("--theme-primary");
      document.documentElement.style.removeProperty("--theme-secondary");
    };
  }, [quote?.theme]);

  // Accept quote mutation
  const acceptMutation = useMutation({
    mutationFn: async () => {
      if (!quote) throw new Error("Quote non trovato");
      if (!signerName.trim())
        throw new Error("Inserisci il tuo nome per firmare");

      // Prodotti benefit sbloccati E selezionati dal cliente al momento della firma
      // (sbloccato ma non selezionato = non è nel carrello)
      const unlockedBenefitNames = Array.from(omaggioByProductName.entries())
        .filter(
          ([name, bs]) => bs.isUnlocked && selectedProducts.includes(name),
        )
        .map(([name]) => name);

      await acceptQuote({
        quoteId: quote.id,
        signature: {
          clientName: signerName.trim(),
        },
        selectedProducts:
          quote.type === "variabile" ? selectedProducts : undefined,
        unlockedBenefitProductNames:
          unlockedBenefitNames.length > 0 ? unlockedBenefitNames : undefined,
        clausesAccepted: acceptedClauses,
      });
    },
    onSuccess: () => {
      toast({
        title: "✅ Preventivo firmato!",
        description: "Il preventivo è stato accettato e firmato con successo",
      });
      // Redirect to unified portal after 1.5s (auto-renders signed view)
      setTimeout(() => {
        navigate(`/quote/${token}`);
      }, 1500);
    },
    onError: (error: Error) => {
      toast({
        title: "❌ Errore firma",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Scadenza preventivo: converte expiresAt in Date
  // Dal server arriva come stringa ISO (via serializeTimestamp); gestisce anche Timestamp e oggetti _seconds
  const expiresAtDate = useMemo<Date | null>(() => {
    const raw = quote?.expiresAt;
    if (!raw) return null;
    try {
      const d = (raw as { toDate?: () => Date }).toDate
        ? (raw as { toDate: () => Date }).toDate()
        : new Date(
            typeof raw === "object" && "_seconds" in raw
              ? (raw as { _seconds: number })._seconds * 1000
              : (raw as unknown as string | number),
          );
      return isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  }, [quote?.expiresAt]);

  // Countdown verso la scadenza (null = nessun intervallo attivo)
  const expiryCountdown = useCountdown(expiresAtDate);
  const isExpired = expiresAtDate ? expiryCountdown.isOver : false;

  // Urgency level basato su ore totali rimanenti (preciso, non floor-dei-giorni):
  // >168h neutral, 72–168h amber, 24–72h orange, <24h red
  const expiryUrgency = useMemo<"neutral" | "amber" | "orange" | "red">(() => {
    if (!expiresAtDate) return "neutral";
    if (isExpired) return "red";
    const totalHours = expiryCountdown.days * 24 + expiryCountdown.hours;
    if (totalHours < 24) return "red";
    if (totalHours <= 72) return "orange";
    if (totalHours <= 168) return "amber";
    return "neutral";
  }, [expiresAtDate, isExpired, expiryCountdown.days, expiryCountdown.hours]);

  // Validation
  const requiredClauses =
    quote?.contractClauses?.filter((c) => c.required) || [];
  const allRequiredAccepted = requiredClauses.every((c) =>
    acceptedClauses.includes(c.id),
  );
  const canSign =
    signerName.trim().length > 0 &&
    allRequiredAccepted &&
    !acceptMutation.isPending &&
    !isExpired;

  // Calcola stati dei benefit inclusi (solo preventivi variabili con regole configurate)
  // DEVE essere prima di totals per poter escludere gli omaggi sbloccati dal totale
  const benefitStates = useMemo<BenefitState[]>(() => {
    if (
      !quote ||
      quote.type !== "variabile" ||
      !quote.benefitRules ||
      quote.benefitRules.length === 0
    ) {
      return [];
    }
    const allSelectableNames = (quote.products ?? [])
      .filter((p) => p.selectable)
      .map((p) => p.nome);
    return computeBenefitStates(
      migrateBenefitRules(quote.benefitRules),
      selectedProducts,
      allSelectableNames,
    );
  }, [quote, selectedProducts]);

  // Aggiorna ref stabile per evitare closure stale negli useEffect con deps stabili
  benefitStatesRef.current = benefitStates;

  // Mappa: nome prodotto → BenefitState (se il prodotto è un omaggio in qualche regola)
  // IMPORTANTE: un prodotto può comparire in più regole. Si usa lo stato PIÙ FAVOREVOLE:
  // se almeno una regola che contiene questo prodotto è sbloccata, il prodotto risulta sbloccato.
  const omaggioByProductName = useMemo(() => {
    const map = new Map<string, BenefitState>();
    for (const bs of benefitStates) {
      for (const name of bs.rule.benefitProductNames ?? []) {
        const existing = map.get(name);
        // Sovrascrive solo se: il prodotto non è ancora nella mappa,
        // OPPURE la nuova regola è sbloccata e quella esistente non lo è
        if (!existing || (!existing.isUnlocked && bs.isUnlocked)) {
          map.set(name, bs);
        }
      }
    }
    return map;
  }, [benefitStates]);

  // Raggruppa prodotti per sezione.
  // Il gruppo null (senza sezione) è sempre il PRIMO, poi le sezioni named in ordine di prima apparizione.
  const productSections = useMemo(() => {
    const products = quote?.products ?? [];
    type SectionGroup = {
      sezione: string | null;
      items: Array<{ product: (typeof products)[0]; idx: number }>;
    };
    const sections: SectionGroup[] = [];
    const sectionMap = new Map<string | null, SectionGroup>();

    // Primo passaggio: costruisci tutti i gruppi (mantenendo l'ordine di prima apparizione)
    products.forEach((product, idx) => {
      const key = product.sezione?.trim() || null;
      if (!sectionMap.has(key)) {
        const group: SectionGroup = { sezione: key, items: [] };
        sections.push(group);
        sectionMap.set(key, group);
      }
      sectionMap.get(key)!.items.push({ product, idx });
    });

    // Assicura che il gruppo null sia sempre primo
    const nullIdx = sections.findIndex((s) => s.sezione === null);
    if (nullIdx > 0) {
      const [nullGroup] = sections.splice(nullIdx, 1);
      sections.unshift(nullGroup);
    }

    return sections;
  }, [quote?.products]);

  // true se almeno una sezione ha un nome (mostra header di sezione)
  const hasSections = useMemo(
    () => productSections.some((s) => s.sezione !== null),
    [productSections],
  );

  // Chiave stabile degli ID delle regole sbloccate
  // La dipendenza è una stringa stabile degli ID delle regole sbloccate,
  // così l'effetto non si riesegue ogni volta che selectedProducts cambia.
  const unlockedRuleKey = benefitStates
    .filter((bs) => bs.isUnlocked)
    .map((bs) => bs.rule.id)
    .sort()
    .join(",");

  // Chiave stabile di tutti gli ID regole configurate (anche bloccate) — usata come dep del toast
  // Sostituisce benefitStates.length: cattura aggiunta/rimozione regole, stabile tra re-render
  const allBenefitRulesKey = benefitStates.map((b) => b.rule.id).join(",");

  // FIX Bug #2 + #3: Gestione unificata aggiunta/rimozione prodotti benefit al cambio del lock.
  // Usa benefitStatesRef per evitare closure stale (benefitStates NON è in deps).
  // Quando una regola si sblocca → aggiunge i prodotti benefit a selectedProducts.
  // Quando una regola si blocca → rimuove i prodotti benefit da selectedProducts.
  const prevUnlockedRuleKeyForAutoRef = useRef<string | null>(null);
  useEffect(() => {
    const currentStates = benefitStatesRef.current;
    const currentUnlockedIds = new Set(unlockedRuleKey ? unlockedRuleKey.split(",") : []);
    const prevUnlockedIds = new Set(
      prevUnlockedRuleKeyForAutoRef.current
        ? prevUnlockedRuleKeyForAutoRef.current.split(",")
        : [],
    );
    prevUnlockedRuleKeyForAutoRef.current = unlockedRuleKey;

    setSelectedProducts((prev) => {
      const set = new Set(prev);
      let changed = false;
      for (const bs of currentStates) {
        const ruleId = bs.rule.id;
        const benefitNames = bs.rule.benefitProductNames ?? [];
        if (currentUnlockedIds.has(ruleId) && !prevUnlockedIds.has(ruleId)) {
          // Regola appena sbloccata → aggiungi prodotti benefit
          for (const n of benefitNames) {
            if (!set.has(n)) { set.add(n); changed = true; }
          }
        } else if (!currentUnlockedIds.has(ruleId) && prevUnlockedIds.has(ruleId)) {
          // Regola appena bloccata → rimuovi prodotti benefit SOLO SE nessun'altra regola li sblocca ancora
          // (un prodotto può apparire in più regole — usa lo stato più favorevole, come omaggioByProductName)
          for (const n of benefitNames) {
            const stillUnlockedByOther = currentStates.some(
              (otherBs) =>
                otherBs.rule.id !== ruleId &&
                otherBs.isUnlocked &&
                (otherBs.rule.benefitProductNames ?? []).includes(n),
            );
            if (set.has(n) && !stillUnlockedByOther) { set.delete(n); changed = true; }
          }
        }
      }
      return changed ? Array.from(set) : prev;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlockedRuleKey]);

  // Toast + animazione quando si sblocca una nuova regola benefit
  useEffect(() => {
    // Solo per preventivi variabili non firmati con regole benefit attive.
    // Se quote non è ancora caricato (null/undefined), non aggiornare lo stato iniziale:
    // aspettiamo che i dati reali siano disponibili prima di fare snapshot.
    if (
      !quote ||
      quote.type !== "variabile" ||
      quote.status === "firmato" ||
      benefitStates.length === 0
    ) {
      // Se quote è già caricato ma non applicabile (fisso/firmato), considera inizializzato
      if (quote !== undefined) {
        benefitInitializedRef.current = true;
        prevUnlockedRuleKeyRef.current = unlockedRuleKey;
      }
      return;
    }

    const prev = prevUnlockedRuleKeyRef.current;

    // Prima esecuzione con dati reali disponibili: salva snapshot iniziale senza toast
    if (!benefitInitializedRef.current) {
      benefitInitializedRef.current = true;
      prevUnlockedRuleKeyRef.current = unlockedRuleKey;
      return;
    }

    if (prev === unlockedRuleKey) return; // Nessun cambiamento

    const prevSet = new Set(prev ? prev.split(",") : []);
    const currentSet = new Set(
      unlockedRuleKey ? unlockedRuleKey.split(",") : [],
    );

    // Trova le regole appena sbloccate (non presenti prima)
    // FIX Bug #3: usa benefitStatesRef (sempre aggiornata) per evitare closure stale
    const newlyUnlocked = benefitStatesRef.current.filter(
      (bs) =>
        bs.isUnlocked && !prevSet.has(bs.rule.id) && currentSet.has(bs.rule.id),
    );

    // Aggiorna sempre il ref PRIMA di ogni possibile return
    prevUnlockedRuleKeyRef.current = unlockedRuleKey;

    if (newlyUnlocked.length > 0) {
      // FIX Bug #8: salva i timer per pulizia nel cleanup dell'effetto
      const timers: ReturnType<typeof setTimeout>[] = [];
      // Mostra toast per ogni regola appena sbloccata
      for (const bs of newlyUnlocked) {
        const giftNames = bs.rule.benefitProductNames ?? [];
        const giftLabel = giftNames.join(", ") || "il servizio";
        // FIX Bug #7: Number() per coercizione sicura dei prezzi da Firestore
        const giftValue = giftNames.reduce((sum, name) => {
          const p = quote?.products?.find((pr) => pr.nome === name);
          return sum + Number(p?.prezzo ?? 0);
        }, 0);

        toast({
          title: `🎁 ${giftLabel} è ora incluso nel tuo preventivo.`,
          description:
            giftValue > 0
              ? `Valore: ${new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(giftValue)} — senza costi aggiuntivi.`
              : "Senza costi aggiuntivi.",
          className: "border-emerald-300 bg-emerald-50 text-emerald-900",
        });

        // Avvia animazione sui card dei prodotti benefit appena sbloccati
        setAnimatingBenefits((prev) => {
          const next = new Set(prev);
          giftNames.forEach((n) => next.add(n));
          return next;
        });
        // Rimuovi l'animazione dopo 1200ms — timer registrato per cleanup
        const tid = setTimeout(() => {
          setAnimatingBenefits((prev) => {
            const next = new Set(prev);
            giftNames.forEach((n) => next.delete(n));
            return next;
          });
        }, 1200);
        timers.push(tid);
      }
      // FIX Bug #8: cleanup dei timer se il componente smonta prima che scadano
      return () => timers.forEach(clearTimeout);
    }
    // FIX Bug #4 deps: allBenefitRulesKey sostituisce benefitStates.length
    // (stabile tra re-render, cattura aggiunta/rimozione di regole ma non flicker inutili)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlockedRuleKey, quote?.type, quote?.status, allBenefitRulesKey]);

  // Calcola il valore monetario dei benefit sbloccati e selezionati
  const unlockedBenefitTotalValue = useMemo(() => {
    if (!quote?.products) return 0;
    // FIX Bug #5+#6: Number() per coercizione sicura; filtra solo i veri omaggio (isUnlocked)
    // Esclude anche i prodotti con p.isOmaggio=true (già gratuiti per scelta admin, non contano come risparmio da benefit)
    return Array.from(omaggioByProductName.entries())
      .filter(([name, bs]) => bs.isUnlocked && selectedProducts.includes(name))
      .reduce((sum, [name]) => {
        const p = quote.products?.find((pr) => pr.nome === name);
        if (!p || p.isOmaggio === true) return sum; // già gratuito per admin, non conta come benefit
        return sum + Number(p.prezzo ?? 0);
      }, 0);
  }, [quote, omaggioByProductName, selectedProducts]);

  // Calculate totals with discount
  const totals = useMemo(() => {
    if (!quote) {
      return {
        totalBeforeDiscount: 0,
        discountAmount: 0,
        totalAfterDiscount: 0,
      };
    }

    // Per preventivi già FIRMATI, usa SEMPRE i totali salvati (non ricalcolare)
    // Questo preserva l'integrità legale del contratto firmato
    if (quote.status === "firmato") {
      const totalAfterDiscount =
        quote.totaleSelezionato ??
        quote.totalAfterDiscount ??
        quote.totaleBase ??
        0;
      const totalBeforeDiscount =
        quote.totalBeforeDiscount ?? totalAfterDiscount;
      const discountAmount = totalBeforeDiscount - totalAfterDiscount;
      return { totalBeforeDiscount, discountAmount, totalAfterDiscount };
    }

    if (quote.type === "fisso") {
      // Fixed quote: use server-calculated totals
      const totalAfterDiscount =
        quote.totalAfterDiscount ?? quote.totaleBase ?? 0;
      const totalBeforeDiscount =
        quote.totalBeforeDiscount ?? totalAfterDiscount;
      const discountAmount = totalBeforeDiscount - totalAfterDiscount;
      return { totalBeforeDiscount, discountAmount, totalAfterDiscount };
    }

    // Variable quote (non firmato): calculate subtotal based on selected products
    // Gli omaggi sbloccati (selezionati + regola attiva) e i prodotti con isOmaggio=true non contribuiscono al totale
    const subtotale = (quote.products ?? [])
      .filter((p) => {
        // Prodotto marcato dall'admin come omaggio → prezzo zero, escludi dal totale
        if (p.isOmaggio === true) return false;
        // Prodotto benefit selezionato con regola sbloccata → GRATIS, escludi dal totale
        const bs = omaggioByProductName.get(p.nome);
        if (bs?.isUnlocked && selectedProducts.includes(p.nome)) return false;
        // Prodotto selezionabile → includi solo se il cliente l'ha selezionato (anche benefit a prezzo pieno)
        if (p.selectable) return selectedProducts.includes(p.nome);
        // Prodotti non selezionabili sono sempre inclusi (prodotti fissi/obbligatori)
        return true;
      })
      // FIX Bug #3: Number() per coercizione sicura (Firestore può restituire stringhe)
      .reduce((sum, p) => sum + Number(p.prezzo ?? 0), 0);

    // Apply discount to selected subtotal
    return calculateQuoteTotals(
      subtotale,
      quote.discountType,
      quote.discountValue,
    );
  }, [quote, selectedProducts, omaggioByProductName]);

  const totale = totals.totalAfterDiscount;

  // Piano pagamenti indicativo (solo pre-firma, indipendente da autoGenerate)
  const indicativePaymentPlan = useMemo<PaymentSchedulePreview | null>(() => {
    if (!quote || quote.status === "firmato") return null;
    if (totale <= 0) return null;
    const eventDate = jobInfo?.eventDate
      ? new Date(jobInfo.eventDate)
      : undefined;

    // Piano di default con 4 rate standard dello studio
    const buildFallbackPlan = (): PaymentSchedulePreview => {
      const round2 = (v: number) => Math.round(v * 100) / 100;
      // Importi: 10% + 60% + 15% + 15%
      const r1 = round2(totale * 0.10); // acconto 10%
      const r2 = round2(totale * 0.60); // 60% pre-evento
      const r3 = round2(totale * 0.15); // 15% scelta album
      const r4 = round2(totale - r1 - r2 - r3); // 15% consegna (resto per evitare arrotondamenti)

      // Date di riferimento
      const today = new Date();
      const addDays = (base: Date, days: number) => {
        const d = new Date(base);
        d.setDate(d.getDate() + days);
        return d;
      };

      let d2: Date, d3: Date, d4: Date;
      if (eventDate) {
        d2 = addDays(eventDate, -7);   // 1 settimana prima dell'evento
        d3 = addDays(eventDate, 90);   // ~90 giorni dopo (scelta album)
        d4 = addDays(eventDate, 150);  // ~150 giorni dopo (consegna lavoro)
      } else {
        // Senza data evento: scadenze relative ad oggi
        d2 = addDays(today, 30);
        d3 = addDays(today, 120);
        d4 = addDays(today, 180);
      }

      return {
        payments: [
          {
            tipo: "acconto",
            importo: r1,
            dataScadenza: today,
            descrizione: "Acconto iniziale – 10%",
          },
          {
            tipo: "rata",
            importo: r2,
            dataScadenza: d2,
            descrizione: "60% — una settimana prima dell'evento",
          },
          {
            tipo: "rata",
            importo: r3,
            dataScadenza: d3,
            descrizione: "15% — scelta dell'album (circa 90 giorni dopo)",
          },
          {
            tipo: "saldo",
            importo: r4,
            dataScadenza: d4,
            descrizione: "15% — consegna del lavoro completo",
          },
        ],
        totale,
        totaleAcconto: r1,
        totaleSaldo: r4,
      };
    };

    // Piano indicativo standard dello studio (4 rate fisse, sempre)
    try {
      return buildFallbackPlan();
    } catch {
      return null;
    }
  }, [quote, totale, jobInfo?.eventDate]);

  // Theme colors with fallback
  const primaryColor = quote?.theme?.primaryColor ?? "#8B9A8B";
  const secondaryColor = quote?.theme?.secondaryColor ?? "#C8D4C8";

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: "EUR",
    }).format(amount);
  };

  // Format date
  const formatDate = (date: any) => {
    if (!date) return "-";
    try {
      // Handle Firestore Timestamp, ISO string, or Date object
      const d = date.toDate ? date.toDate() : new Date(date);
      if (isNaN(d.getTime())) return "-";
      return d.toLocaleDateString("it-IT", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
    } catch {
      return "-";
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="w-12 h-12 animate-spin text-blue-600" />
              <p className="text-gray-600">Caricamento preventivo...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state
  if (error || !data?.success || !quote) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-50 p-4">
        <Card className="w-full max-w-md border-red-200">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
                <FileText className="w-8 h-8 text-red-600" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">
                  Preventivo non trovato
                </h2>
                <p className="text-gray-600">
                  Il link non è valido o è scaduto.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Already signed
  if (quote.status === "firmato") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-50 p-4">
        <Card className="w-full max-w-md border-green-200">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">
                  Preventivo già firmato
                </h2>
                <p className="text-gray-600 mb-4">
                  Questo preventivo è stato già firmato.
                </p>
                <Button onClick={() => navigate(`/quote/${token}`)}>
                  Visualizza Preventivo Firmato
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-4 py-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header con stile October Mist */}
        <Card className="overflow-hidden border-sage/20 shadow-lg bg-gradient-to-br from-off-white to-light-mint">
          {/* Logo Studio - piccolo in alto */}
          {studioLogo && (
            <div className="flex justify-center pt-6 pb-2">
              <div className="p-2 bg-white rounded-xl shadow-sm">
                <img
                  src={studioLogo}
                  alt="Studio Logo"
                  className="h-10 sm:h-12 w-auto object-contain"
                />
              </div>
            </div>
          )}

          {/* Banner immagine copertina tipo lavoro */}
          {jobTypeInfo?.imageUrl && (
            <div className="relative w-full aspect-[16/9] sm:aspect-[21/9] overflow-hidden">
              <img
                src={jobTypeInfo.imageUrl}
                alt={jobTypeInfo.nome || "Tipo lavoro"}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
            </div>
          )}

          <CardHeader className="relative text-center py-6 sm:py-8 px-6">
            <div className="space-y-4">
              {/* Badge tipo preventivo */}
              <div className="flex justify-center mb-4">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-gray/10 backdrop-blur-sm rounded-full border border-blue-gray/20">
                  <FileText className="w-4 h-4 text-blue-gray" />
                  <span className="text-blue-gray font-medium text-sm">
                    {quote.type === "fisso"
                      ? "Preventivo Fisso"
                      : "Preventivo Variabile"}
                  </span>
                </div>
              </div>

              {/* Titolo */}
              <CardTitle className="text-2xl sm:text-3xl font-playfair font-bold text-blue-gray">
                {quote.templateName || "Preventivo"}
              </CardTitle>

              {/* Nome evento */}
              {jobInfo?.nomeEvento && (
                <p className="text-sage text-base sm:text-lg font-medium mt-2">
                  {jobInfo.nomeEvento}
                </p>
              )}
            </div>
          </CardHeader>
        </Card>

        {/* Banner scadenza — visibile solo se expiresAt è impostato (già nel path non-firmato grazie all'early return) */}
        {expiresAtDate &&
          (() => {
            const urgencyStyles = {
              neutral: {
                container: "bg-gray-50 border-gray-200",
                icon: "text-gray-500",
                text: "text-gray-700",
                accent: "text-gray-600",
              },
              amber: {
                container: "bg-amber-50 border-amber-200",
                icon: "text-amber-500",
                text: "text-amber-800",
                accent: "text-amber-700",
              },
              orange: {
                container: "bg-orange-50 border-orange-200",
                icon: "text-orange-500",
                text: "text-orange-800",
                accent: "text-orange-700",
              },
              red: {
                container: "bg-red-50 border-red-300",
                icon: "text-red-500",
                text: "text-red-800",
                accent: "text-red-700",
              },
            }[expiryUrgency];

            const benefitMention =
              unlockedBenefitTotalValue > 0
                ? ` — hai sbloccato ${formatCurrency(unlockedBenefitTotalValue)} di servizi inclusi`
                : "";

            let message: string;
            let subMessage: string | null = null;
            if (isExpired) {
              message = "Proposta scaduta";
              subMessage =
                "Il periodo di validità di questa proposta è terminato. Contatta lo studio per aggiornarla.";
            } else if (expiryUrgency === "red") {
              const h = expiryCountdown.hours;
              message = `Manca${h !== 1 ? "no" : ""} ${h} or${h !== 1 ? "e" : "a"} — ultima possibilità per confermare${benefitMention}`;
            } else if (expiryUrgency === "orange") {
              const d = expiryCountdown.days;
              message = `Manca${d !== 1 ? "no" : ""} ${d} giorn${d !== 1 ? "i" : "o"} — non perdere questa proposta${benefitMention}`;
            } else if (expiryUrgency === "amber") {
              const d = expiryCountdown.days;
              message = `Hai ${d} giorn${d !== 1 ? "i" : "o"} per confermare questa proposta`;
            } else {
              message = `Proposta valida fino al ${formatDueDate(expiresAtDate)}`;
            }

            return (
              <div
                className={`rounded-xl border px-5 py-4 flex items-start gap-4 ${urgencyStyles.container}`}
                data-testid="expiry-banner"
                data-urgency={expiryUrgency}
              >
                <Timer
                  className={`w-5 h-5 mt-0.5 flex-shrink-0 ${urgencyStyles.icon}`}
                />
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold text-sm ${urgencyStyles.text}`}>
                    {message}
                  </p>
                  {subMessage && (
                    <p className={`text-xs mt-1 ${urgencyStyles.accent}`}>
                      {subMessage}
                    </p>
                  )}
                  {!isExpired && unlockedBenefitTotalValue > 0 && (
                    <p
                      className={`text-xs mt-1 flex items-center gap-1 ${urgencyStyles.accent}`}
                    >
                      <Gift className="w-3.5 h-3.5" />
                      {formatCurrency(unlockedBenefitTotalValue)} di servizi
                      inclusi ti aspettano — firma per non perderli
                    </p>
                  )}
                </div>
              </div>
            );
          })()}

        {/* Riepilogo Evento */}
        {jobInfo && (
          <Card className="border-sage/20 bg-gradient-to-br from-white to-light-mint/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg text-blue-gray font-playfair">
                <CalendarIcon className="w-5 h-5 text-sage" />
                Dettagli Evento
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Data e Orari */}
              <div className="grid md:grid-cols-2 gap-4">
                {jobInfo.eventDate && (
                  <div className="flex items-start gap-3">
                    <CalendarIcon className="w-5 h-5 text-gray-500 mt-0.5" />
                    <div>
                      <p className="text-sm text-gray-600">Data Evento</p>
                      <p className="font-semibold">
                        {formatDate(jobInfo.eventDate)}
                      </p>
                    </div>
                  </div>
                )}

                {!jobInfo.allDay && (jobInfo.startTime || jobInfo.endTime) && (
                  <div className="flex items-start gap-3">
                    <Clock className="w-5 h-5 text-gray-500 mt-0.5" />
                    <div>
                      <p className="text-sm text-gray-600">Orario</p>
                      <p className="font-semibold">
                        {jobInfo.startTime && jobInfo.endTime
                          ? `${jobInfo.startTime} - ${jobInfo.endTime}`
                          : jobInfo.startTime ||
                            jobInfo.endTime ||
                            "Tutto il giorno"}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Location Evento */}
              {jobInfo.location && (
                <div className="flex items-start gap-3">
                  <MapPin className="w-5 h-5 text-gray-500 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-600">Location Evento</p>
                    <p className="font-semibold">
                      {jobInfo.location}
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(jobInfo.location)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 text-primary hover:underline text-xs"
                      >
                        Apri in Maps
                      </a>
                    </p>
                  </div>
                </div>
              )}

              {/* Rito/Celebrazione */}
              {(jobInfo.rito || jobInfo.rituTime) && (
                <div className="grid md:grid-cols-2 gap-4">
                  {jobInfo.rito && (
                    <div className="flex items-start gap-3">
                      <MapPin className="w-5 h-5 text-gray-500 mt-0.5" />
                      <div>
                        <p className="text-sm text-gray-600">
                          Luogo Rito/Celebrazione
                        </p>
                        <p className="font-semibold">
                          {jobInfo.rito}
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(jobInfo.rito)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-2 text-primary hover:underline text-xs"
                          >
                            Apri in Maps
                          </a>
                        </p>
                      </div>
                    </div>
                  )}

                  {jobInfo.rituTime && (
                    <div className="flex items-start gap-3">
                      <Clock className="w-5 h-5 text-gray-500 mt-0.5" />
                      <div>
                        <p className="text-sm text-gray-600">Orario Rito</p>
                        <p className="font-semibold">{jobInfo.rituTime}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Clienti - Info Complete */}
              {clientiInfo.length > 0 && (
                <div>
                  <p className="text-sm text-blue-gray mb-4 flex items-center gap-2 font-semibold">
                    <User className="w-5 h-5 text-sage" />
                    {clientiInfo.length === 1
                      ? "Informazioni Cliente"
                      : "Informazioni Clienti"}
                  </p>
                  <div className="grid md:grid-cols-2 gap-4">
                    {clientiInfo.map((cliente, idx) => {
                      const appuntamento = appuntamentiClienti.find(
                        (a) => a.clienteId === cliente.id,
                      );
                      return (
                        <div
                          key={cliente.id}
                          className="bg-gradient-to-br from-white to-light-mint/20 p-5 rounded-xl border border-sage/20 shadow-sm hover:shadow-md transition-all hover:border-sage/40"
                        >
                          {/* Nome */}
                          <div className="flex items-center gap-3 mb-4 pb-3 border-b border-mint/30">
                            <div className="w-10 h-10 rounded-full bg-mint/30 flex items-center justify-center flex-shrink-0">
                              <User className="w-5 h-5 text-blue-gray" />
                            </div>
                            <div>
                              <p className="font-bold text-blue-gray text-lg font-playfair">
                                {cliente.nome} {cliente.cognome}
                              </p>
                              {clientiInfo.length > 1 && (
                                <span className="text-xs text-sage font-medium">
                                  Cliente {idx + 1}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Appuntamento */}
                          {appuntamento?.orarioAppuntamento && (
                            <div className="mb-4 p-3 bg-sage/10 rounded-lg border border-sage/20">
                              <div className="flex items-start gap-3">
                                <div className="w-8 h-8 rounded-full bg-sage/20 flex items-center justify-center flex-shrink-0">
                                  <Clock className="w-4 h-4 text-sage" />
                                </div>
                                <div className="flex-1">
                                  <p className="text-xs text-sage uppercase font-semibold">
                                    Appuntamento
                                  </p>
                                  <p className="text-sm text-blue-gray font-bold">
                                    {appuntamento.orarioAppuntamento}
                                  </p>
                                  {appuntamento.noteAppuntamento && (
                                    <p className="text-xs text-dark-sage mt-1">
                                      {appuntamento.noteAppuntamento}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}

                          <div className="space-y-3">
                            {/* Email */}
                            {cliente.email && (
                              <div className="flex items-start gap-3 p-2 rounded-lg hover:bg-mint/10 transition-colors">
                                <div className="w-8 h-8 rounded-full bg-mint/20 flex items-center justify-center flex-shrink-0">
                                  <Mail className="w-4 h-4 text-blue-gray" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs text-sage uppercase font-medium">
                                    Email
                                  </p>
                                  <p className="text-sm text-blue-gray font-medium break-all">
                                    {cliente.email}
                                  </p>
                                </div>
                              </div>
                            )}

                            {/* Telefono */}
                            {cliente.telefono && (
                              <div className="flex items-start gap-3 p-2 rounded-lg hover:bg-mint/10 transition-colors">
                                <div className="w-8 h-8 rounded-full bg-terracotta/20 flex items-center justify-center flex-shrink-0">
                                  <Phone className="w-4 h-4 text-terracotta" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs text-sage uppercase font-medium">
                                    Telefono
                                  </p>
                                  <p className="text-sm text-blue-gray font-medium">
                                    {cliente.telefono}
                                  </p>
                                </div>
                              </div>
                            )}

                            {/* Indirizzo - cliccabile per Google Maps */}
                            {(cliente.indirizzo || cliente.citta) &&
                              (() => {
                                const addressParts = [
                                  cliente.indirizzo,
                                  cliente.cap,
                                  cliente.citta,
                                ]
                                  .filter(Boolean)
                                  .join(", ");
                                const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressParts)}`;

                                return (
                                  <a
                                    href={mapsUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-start gap-3 p-2 rounded-lg hover:bg-mint/10 transition-colors group cursor-pointer"
                                    data-testid={`link-address-maps-${cliente.id}`}
                                  >
                                    <div className="w-8 h-8 rounded-full bg-cream/50 flex items-center justify-center flex-shrink-0 group-hover:bg-sage/20 transition-colors">
                                      <MapPin className="w-4 h-4 text-blue-gray group-hover:text-sage" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs text-sage uppercase font-medium mb-1 flex items-center gap-1">
                                        Indirizzo
                                        <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                                      </p>
                                      <div className="text-sm text-blue-gray group-hover:text-sage transition-colors">
                                        {cliente.indirizzo && (
                                          <p className="font-medium">
                                            {cliente.indirizzo}
                                          </p>
                                        )}
                                        {cliente.citta && (
                                          <p className="text-dark-sage group-hover:text-sage/80">
                                            {cliente.cap && `${cliente.cap} `}
                                            {cliente.citta}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  </a>
                                );
                              })()}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Prodotti */}
        <Card className="border-sage/20 bg-gradient-to-br from-white to-light-mint/20">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="font-playfair text-blue-gray">
                Prodotti e Servizi
              </CardTitle>
              {/* Tab informativo benefit — visibile solo se ci sono regole benefit */}
              {quote.type === "variabile" && benefitStates.length > 0 && (
                <button
                  onClick={() => setShowBenefitGuide(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 hover:border-amber-300 transition-all shadow-sm"
                  data-testid="button-benefit-guide"
                >
                  <Gift className="w-3.5 h-3.5" />
                  Ottieni Benefict a 0€
                  <Sparkles className="w-3 h-3 text-amber-500" />
                </button>
              )}
            </div>

            {/* Banner progressivo benefit — visibile solo su preventivi variabili con regole */}
            {quote.type === "variabile" &&
              benefitStates.length > 0 &&
              (() => {
                const allUnlocked = benefitStates.every((bs) => bs.isUnlocked);

                if (allUnlocked) {
                  return (
                    <div
                      className="mt-3 flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200"
                      data-testid="benefit-banner-all-unlocked"
                    >
                      <PartyPopper className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                      <span className="text-sm font-semibold text-emerald-700">
                        Hai ottenuto tutti i Benefict a 0€ — ottima scelta.
                      </span>
                    </div>
                  );
                }

                // Regola più vicina allo sblocco = quella con meno prodotti/selezioni mancanti
                const closest = benefitStates
                  .filter((bs) => !bs.isUnlocked)
                  .sort((a, b) => {
                    const totalMissingA =
                      a.missingProductNames.length + a.missingCount;
                    const totalMissingB =
                      b.missingProductNames.length + b.missingCount;
                    return totalMissingA - totalMissingB;
                  })[0];

                if (!closest) return null;

                const giftNames = closest.rule.benefitProductNames ?? [];
                const giftValue = giftNames.reduce((sum, name) => {
                  const p = quote.products?.find((pr) => pr.nome === name);
                  return sum + (p?.prezzo ?? 0);
                }, 0);
                const giftLabel = giftNames.join(", ") || "il servizio";

                const totalMissing =
                  closest.missingProductNames.length + closest.missingCount;
                const totalRequired =
                  (closest.rule.requiredProductNames?.length ?? 0) +
                  (closest.rule.minSelectableCount ?? 0);
                const progressDone = totalRequired - totalMissing;
                const progressPct =
                  totalRequired > 0
                    ? Math.min(100, (progressDone / totalRequired) * 100)
                    : 0;

                const missingText =
                  totalMissing === 1
                    ? "Aggiungi ancora 1 servizio"
                    : `Aggiungi ancora ${totalMissing} servizi`;

                return (
                  <div
                    className="mt-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200"
                    data-testid="benefit-banner-progress"
                  >
                    <div className="flex items-start gap-2 mb-2">
                      <Gift className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-amber-800 leading-snug">
                        <span className="font-semibold">{missingText}</span> e
                        ricevi{" "}
                        <span className="font-semibold">{giftLabel}</span>
                        {giftValue > 0 && (
                          <span className="text-amber-700">
                            {" "}
                            (valore{" "}
                            {new Intl.NumberFormat("it-IT", {
                              style: "currency",
                              currency: "EUR",
                            }).format(giftValue)}
                            )
                          </span>
                        )}{" "}
                        — senza costi aggiuntivi.
                      </p>
                    </div>
                    {totalRequired > 0 && (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-amber-200/60 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="h-1.5 rounded-full bg-amber-500 transition-all duration-500"
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                        <span className="text-xs text-amber-700 font-medium flex-shrink-0">
                          {progressDone}/{totalRequired}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })()}
          </CardHeader>
          <CardContent className="space-y-3">
            {productSections.map(({ sezione, items }) => {
              // Mostra 🎁 solo se TUTTI i prodotti della sezione sono "Servizi Inclusi"
              // (isOmaggio admin-impostato oppure benefit sbloccato)
              const sectionHasBenefits =
                quote.type === "variabile" &&
                items.length > 0 &&
                items.every(({ product: p }) => {
                  const be = omaggioByProductName.get(p.nome);
                  return p.isOmaggio || be?.isUnlocked === true;
                });
              return (
                <div key={sezione ?? "__no_section__"} className="space-y-4">
                  {hasSections && sezione && (
                    <div className="flex items-center gap-3 mt-6 mb-3 first:mt-0">
                      <div className="h-px flex-1 bg-sage/50" />
                      <h3 className="font-playfair text-sm font-bold text-sage uppercase tracking-widest whitespace-nowrap flex items-center gap-1.5">
                        {sectionHasBenefits && <span>🎁</span>}
                        {sezione}
                      </h3>
                      <div className="h-px flex-1 bg-sage/50" />
                    </div>
                  )}
                  {items.map(({ product, idx }) => {
                    const isExpanded = expandedDescriptions.has(idx);
                    const hasLongDescription =
                      product.descrizione && product.descrizione.length > 120;

                    // Stato benefit per questo prodotto
                    const benefitEntry = omaggioByProductName.get(product.nome);
                    // isOmaggioUnlocked: regola sbloccata E prodotto selezionato (auto-selezionato via useEffect)
                    const isOmaggioUnlocked =
                      benefitEntry?.isUnlocked === true &&
                      selectedProducts.includes(product.nome);
                    // isBenefitAvailableButDeselected: regola sbloccata ma l'utente ha deselezionato manualmente il benefit
                    const isBenefitAvailableButDeselected =
                      benefitEntry?.isUnlocked === true &&
                      !selectedProducts.includes(product.nome) &&
                      product.selectable;
                    // Tutti i prodotti selezionabili hanno checkbox, inclusi i prodotti benefit
                    const showCheckbox =
                      quote.type === "variabile" && product.selectable;

                    // Un prodotto è "Servizio Incluso" se: admin l'ha marcato isOmaggio (fisso)
                    // OPPURE la regola benefit è sbloccata e il prodotto è selezionato (auto o manuale)
                    const isServizioIncluso =
                      product.isOmaggio || isOmaggioUnlocked;

                    const isAnimating = animatingBenefits.has(product.nome);

                    return (
                      <div
                        key={idx}
                        className={`p-4 border rounded-xl transition-all duration-300 ${
                          isServizioIncluso
                            ? "border-emerald-300 bg-emerald-50/50 shadow-sm"
                            : isBenefitAvailableButDeselected
                              ? "border-amber-200 bg-amber-50/30 hover:shadow-sm"
                              : "border-mint/30 bg-white hover:border-sage/50 hover:shadow-lg"
                        }${isAnimating ? " benefit-unlock-pulse" : ""}`}
                      >
                        {/* Banner verde: servizio incluso fisso admin O benefit sbloccato e selezionato */}
                        {isServizioIncluso && (
                          <div className="flex items-center gap-2 mb-3 pb-2 border-b border-emerald-200">
                            <span className="text-base">🎁</span>
                            <span className="text-sm font-semibold text-emerald-700">
                              Servizio Incluso
                            </span>
                            <Badge className="ml-auto text-xs bg-emerald-600 text-white border-0">
                              ✓ INCLUSO
                            </Badge>
                          </div>
                        )}
                        {/* Banner ambra: benefit disponibile (regola sbloccata) ma deselezionato manualmente */}
                        {isBenefitAvailableButDeselected &&
                          !isServizioIncluso && (
                            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-amber-200">
                              <span className="text-base">🎁</span>
                              <span className="text-sm font-semibold text-amber-700">
                                Servizio Incluso disponibile
                              </span>
                              <button
                                onClick={() =>
                                  setSelectedProducts((prev) => [
                                    ...prev,
                                    product.nome,
                                  ])
                                }
                                className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 border border-amber-300 text-amber-800 hover:bg-amber-200 transition-colors"
                              >
                                + Aggiungi (incluso)
                              </button>
                            </div>
                          )}
                        {/* Layout responsive: verticale su mobile, orizzontale su desktop */}
                        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                          {/* Checkbox mobile */}
                          {showCheckbox && (
                            <div className="sm:hidden flex items-center gap-2 mb-2">
                              <Checkbox
                                checked={selectedProducts.includes(
                                  product.nome,
                                )}
                                onCheckedChange={(checked) => {
                                  setSelectedProducts((prev) =>
                                    checked
                                      ? [...prev, product.nome]
                                      : prev.filter((p) => p !== product.nome),
                                  );
                                }}
                                data-testid={`checkbox-product-mobile-${idx}`}
                              />
                              <span className="text-sm text-sage">
                                Seleziona questo prodotto
                              </span>
                            </div>
                          )}

                          {/* Desktop checkbox */}
                          {showCheckbox && (
                            <Checkbox
                              checked={selectedProducts.includes(product.nome)}
                              onCheckedChange={(checked) => {
                                setSelectedProducts((prev) =>
                                  checked
                                    ? [...prev, product.nome]
                                    : prev.filter((p) => p !== product.nome),
                                );
                              }}
                              className="mt-1 hidden sm:flex"
                              data-testid={`checkbox-product-${idx}`}
                            />
                          )}

                          {/* Header mobile: immagine + nome + prezzo */}
                          <div className="flex items-start gap-3 sm:contents">
                            {/* Product Image */}
                            <div className="flex-shrink-0">
                              <img
                                src={
                                  product.immagini &&
                                  product.immagini.length > 0
                                    ? product.immagini[0]
                                    : placeholderUrl
                                }
                                alt={product.nome}
                                className="w-20 h-20 sm:w-28 sm:h-28 object-cover rounded-lg border-2 border-mint/30 shadow-sm"
                              />
                            </div>

                            {/* Mobile: Nome e Prezzo affiancati */}
                            <div className="flex-1 min-w-0 sm:hidden">
                              <h3
                                className={`font-bold text-base font-playfair leading-tight ${isServizioIncluso ? "text-emerald-800" : "text-blue-gray"}`}
                              >
                                {product.nome}
                              </h3>
                              {isServizioIncluso ? (
                                <div className="mt-1">
                                  <p className="font-bold text-base text-emerald-600">
                                    ✓ Servizio Incluso
                                  </p>
                                  {isOmaggioUnlocked && product.prezzo > 0 && (
                                    <div className="flex items-center gap-1.5">
                                      <p className="text-xs text-gray-400 line-through">
                                        {formatCurrency(product.prezzo)}
                                      </p>
                                      <p className="text-xs font-bold text-emerald-600">
                                        € 0,00
                                      </p>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <p className="font-bold text-lg text-blue-gray mt-1">
                                  {formatCurrency(product.prezzo)}
                                </p>
                              )}
                              <div className="flex flex-wrap gap-1 mt-2">
                                {product.numeroFoto && (
                                  <Badge
                                    variant="outline"
                                    className="text-xs bg-mint/20 border-mint text-blue-gray"
                                  >
                                    📸 {product.numeroFoto} foto
                                  </Badge>
                                )}
                                {product.categoria && (
                                  <Badge
                                    variant="outline"
                                    className="text-xs bg-terracotta/20 border-terracotta/40 text-blue-gray"
                                  >
                                    {product.categoria}
                                  </Badge>
                                )}
                                {product.isBundle && (
                                  <Badge
                                    variant="outline"
                                    className="text-xs bg-amber-100 border-amber-300 text-amber-700"
                                  >
                                    📦 Pacchetto
                                  </Badge>
                                )}
                              </div>
                              {/* Bundle Items - Mobile */}
                              {product.isBundle &&
                                product.bundleItems &&
                                product.bundleItems.length > 0 && (
                                  <div className="mt-2 pl-2 border-l-2 border-amber-200 space-y-0.5">
                                    <p className="text-xs font-medium text-amber-700">
                                      Include:
                                    </p>
                                    {product.bundleItems.map(
                                      (item, itemIdx) => (
                                        <div
                                          key={itemIdx}
                                          className="flex items-center gap-1.5 text-xs text-dark-sage"
                                        >
                                          <span>└</span>
                                          <span>{item.prodottoNome}</span>
                                          {item.numeroFoto &&
                                            item.numeroFoto > 0 && (
                                              <span className="text-blue-600">
                                                ({item.numeroFoto} foto)
                                              </span>
                                            )}
                                        </div>
                                      ),
                                    )}
                                  </div>
                                )}
                            </div>
                          </div>

                          {/* Desktop: contenuto centrale */}
                          <div className="hidden sm:block flex-1 min-w-0">
                            <h3
                              className={`font-bold text-lg mb-1 font-playfair ${isServizioIncluso ? "text-emerald-800" : "text-blue-gray"}`}
                            >
                              {product.nome}
                            </h3>
                            {product.descrizione && (
                              <p className="text-sm text-dark-sage mt-1 leading-relaxed">
                                {product.descrizione}
                              </p>
                            )}
                            <div className="flex flex-wrap gap-2 mt-3">
                              {product.numeroFoto && (
                                <Badge
                                  variant="outline"
                                  className="text-xs bg-mint/20 border-mint text-blue-gray"
                                >
                                  📸 {product.numeroFoto} foto
                                </Badge>
                              )}
                              {product.categoria && (
                                <Badge
                                  variant="outline"
                                  className="text-xs bg-terracotta/20 border-terracotta/40 text-blue-gray"
                                >
                                  {product.categoria}
                                </Badge>
                              )}
                              {product.isBundle && (
                                <Badge
                                  variant="outline"
                                  className="text-xs bg-amber-100 border-amber-300 text-amber-700"
                                >
                                  📦 Pacchetto
                                </Badge>
                              )}
                            </div>
                            {/* Bundle Items - Desktop */}
                            {product.isBundle &&
                              product.bundleItems &&
                              product.bundleItems.length > 0 && (
                                <div className="mt-3 pl-3 border-l-2 border-amber-200 space-y-1">
                                  <p className="text-xs font-medium text-amber-700 mb-1">
                                    Include:
                                  </p>
                                  {product.bundleItems.map((item, itemIdx) => (
                                    <div
                                      key={itemIdx}
                                      className="flex items-center gap-2 text-xs text-dark-sage"
                                    >
                                      <span>└</span>
                                      <span>{item.prodottoNome}</span>
                                      {item.quantita > 1 && (
                                        <span className="text-gray-500">
                                          x{item.quantita}
                                        </span>
                                      )}
                                      {item.numeroFoto &&
                                        item.numeroFoto > 0 && (
                                          <span className="text-blue-600">
                                            ({item.numeroFoto} foto)
                                          </span>
                                        )}
                                    </div>
                                  ))}
                                </div>
                              )}
                          </div>

                          {/* Desktop: prezzo a destra */}
                          <div className="hidden sm:block text-right flex-shrink-0">
                            {isServizioIncluso ? (
                              <div>
                                <p className="font-bold text-xl sm:text-2xl text-emerald-600">
                                  ✓ Servizio Incluso
                                </p>
                                {isOmaggioUnlocked && product.prezzo > 0 && (
                                  <div className="flex items-center justify-end gap-2 mt-0.5">
                                    <p className="text-sm text-gray-400 line-through">
                                      {formatCurrency(product.prezzo)}
                                    </p>
                                    <p className="text-sm font-bold text-emerald-600">
                                      € 0,00
                                    </p>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <p className="font-bold text-xl sm:text-2xl text-blue-gray">
                                {formatCurrency(product.prezzo)}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Mobile: descrizione sotto con "Continua a leggere" */}
                        {product.descrizione && (
                          <div className="sm:hidden mt-3 pt-3 border-t border-mint/20">
                            <p
                              className={`text-sm text-dark-sage leading-relaxed ${!isExpanded && hasLongDescription ? "line-clamp-2" : ""}`}
                            >
                              {product.descrizione}
                            </p>
                            {hasLongDescription && (
                              <button
                                onClick={() => toggleDescription(idx)}
                                className="flex items-center gap-1 text-xs text-sage hover:text-dark-sage mt-2 font-medium"
                                data-testid={`button-toggle-description-${idx}`}
                              >
                                {isExpanded ? (
                                  <>
                                    <ChevronUp className="w-3 h-3" />
                                    Mostra meno
                                  </>
                                ) : (
                                  <>
                                    <ChevronDown className="w-3 h-3" />
                                    Continua a leggere
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}

            <Separator className="my-4" />

            {/* Discount Breakdown */}
            {totals.discountAmount > 0 && (
              <div className="space-y-2 text-sm mb-4">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotale</span>
                  <span>{formatCurrency(totals.totalBeforeDiscount)}</span>
                </div>
                <div className="flex justify-between text-emerald-600 font-medium">
                  <span>
                    Sconto
                    {quote.discountType === "percent" &&
                    typeof quote.discountValue === "number"
                      ? ` (${quote.discountValue}%)`
                      : ""}
                  </span>
                  <span>-{formatCurrency(totals.discountAmount)}</span>
                </div>
              </div>
            )}

            {/* Servizi Inclusi — visibile solo quando almeno un benefit è sbloccato e selezionato */}
            {unlockedBenefitTotalValue > 0 && (
              <div
                className="flex justify-between items-center text-sm mb-3"
                data-testid="benefit-total-row"
              >
                <span className="text-emerald-700 font-medium flex items-center gap-1.5">
                  <Gift className="w-3.5 h-3.5" />
                  Servizi Inclusi
                </span>
                <span className="flex items-center gap-2">
                  <span className="line-through text-muted-foreground">
                    {formatCurrency(unlockedBenefitTotalValue)}
                  </span>
                  <span className="font-bold text-emerald-600">€0</span>
                </span>
              </div>
            )}

            {/* Totale */}
            <div className="flex justify-between items-center text-xl font-bold">
              <span>Totale</span>
              <span className="text-2xl" style={{ color: primaryColor }}>
                {formatCurrency(totale)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Piano pagamenti indicativo — visibile sempre pre-firma (indipendente da autoGenerate) */}
        {indicativePaymentPlan && (
          <Card className="border-sage/20 bg-gradient-to-br from-white to-light-mint/10">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2 font-playfair text-blue-gray text-lg">
                  <CreditCard className="w-5 h-5 text-sage" />
                  Come funzionerebbero i pagamenti
                </CardTitle>
                {/* Toggle per mobile */}
                <button
                  className="sm:hidden flex items-center gap-1 text-xs text-sage font-medium"
                  onClick={() => setPaymentPlanCollapsed((p) => !p)}
                  aria-expanded={!paymentPlanCollapsed}
                  data-testid="button-toggle-payment-plan"
                >
                  {paymentPlanCollapsed ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronUp className="w-4 h-4" />
                  )}
                  {paymentPlanCollapsed ? "Mostra" : "Nascondi"}
                </button>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Basato sui servizi selezionati — aggiornato in tempo reale
              </p>
            </CardHeader>

            <CardContent
              className={`space-y-4 ${paymentPlanCollapsed ? "hidden sm:block" : ""}`}
            >
              {/* Timeline rate */}
              <div className="relative">
                {/* Linea verticale */}
                <div className="absolute left-5 top-5 bottom-5 w-px bg-sage/20 hidden sm:block" />

                <div className="space-y-3">
                  {indicativePaymentPlan.payments.map((payment, idx) => {
                    const isFirst = idx === 0;
                    const isLast =
                      idx === indicativePaymentPlan.payments.length - 1;
                    const iconBg =
                      payment.tipo === "acconto"
                        ? "bg-sage text-white"
                        : payment.tipo === "saldo"
                          ? "bg-blue-gray text-white"
                          : "bg-mint/50 text-blue-gray";

                    return (
                      <div
                        key={idx}
                        className="flex items-start gap-4 relative"
                      >
                        {/* Numero/Icona step */}
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold z-10 ${iconBg}`}
                        >
                          {idx + 1}
                        </div>
                        {/* Contenuto */}
                        <div
                          className={`flex-1 rounded-xl border px-4 py-3 ${
                            isFirst
                              ? "border-sage/30 bg-sage/5"
                              : isLast
                                ? "border-blue-gray/20 bg-blue-gray/5"
                                : "border-mint/30 bg-white"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2 flex-wrap">
                            <div>
                              <p className="font-semibold text-blue-gray text-sm">
                                {payment.descrizione}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Entro il {formatDueDate(payment.dataScadenza)}
                              </p>
                            </div>
                            <span
                              className="font-bold text-lg text-blue-gray"
                              style={{ color: primaryColor }}
                            >
                              {formatCurrency(payment.importo)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Nota legale discreta */}
              <p className="text-xs text-muted-foreground flex items-center gap-1.5 pt-2 border-t border-sage/10">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                Piano indicativo — gli importi e le scadenze esatte verranno
                confermati alla firma del contratto.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Clausole Contrattuali */}
        {quote.contractClauses && quote.contractClauses.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Clausole Contrattuali</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {quote.contractClauses.map((clause) => (
                <div
                  key={clause.id}
                  className="flex items-start gap-3 p-3 border rounded-lg"
                >
                  <Checkbox
                    checked={acceptedClauses.includes(clause.id)}
                    onCheckedChange={(checked) => {
                      setAcceptedClauses((prev) =>
                        checked
                          ? [...prev, clause.id]
                          : prev.filter((c) => c !== clause.id),
                      );
                    }}
                    data-testid={`checkbox-clause-${clause.id}`}
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p
                        className="text-sm"
                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(clause.text ?? "") }}
                      />
                      {clause.required && (
                        <Badge variant="destructive" className="text-xs">
                          Obbligatoria
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {requiredClauses.length > 0 && !allRequiredAccepted && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Devi accettare tutte le clausole obbligatorie per continuare
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        )}

        {/* Firma Digitale */}
        <Card className="border-sage/30 bg-gradient-to-br from-white to-light-mint/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-playfair text-blue-gray">
              <FileText className="w-5 h-5 text-sage" />
              Firma Digitale
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-2">
              Per accettare questo preventivo, inserisci il tuo nome completo e
              apponi la tua firma digitale qui sotto.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Nome Firmante */}
            <div className="space-y-2">
              <Label
                htmlFor="signer-name"
                className="text-base font-semibold flex items-center gap-2"
              >
                <User className="w-4 h-4" />
                Il tuo Nome Completo *
              </Label>
              <Input
                id="signer-name"
                placeholder="Scrivi qui il tuo nome e cognome (es. Mario Rossi)"
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                data-testid="input-signer-name"
                className="text-base py-6"
              />
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Il nome che inserisci apparirà nel contratto firmato
              </p>
            </div>

            {/* Signature Preview */}
            <div>
              <Label>Anteprima Firma</Label>
              <div className="border-2 border-sage/30 rounded-lg p-8 bg-gradient-to-br from-white to-sage/5 min-h-[160px] flex items-center justify-center">
                {signerName.trim() ? (
                  <p
                    className="text-6xl text-sage"
                    style={{ fontFamily: "'Great Vibes', cursive" }}
                    data-testid="signature-preview"
                  >
                    {signerName.trim()}
                  </p>
                ) : (
                  <p className="text-muted-foreground italic">
                    La tua firma apparirà qui
                  </p>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Il tuo nome verrà visualizzato con un font elegante stile firma
              </p>
            </div>

            {/* Alert scadenza — blocca firma se preventivo scaduto */}
            {isExpired && (
              <Alert variant="destructive" data-testid="alert-expired">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Il periodo di validità di questa proposta è terminato.
                  Contatta lo studio per aggiornarla.
                </AlertDescription>
              </Alert>
            )}

            {/* Submit */}
            <Button
              onClick={() => acceptMutation.mutate()}
              disabled={!canSign}
              className="w-full"
              size="lg"
              data-testid="button-submit-signature"
            >
              {acceptMutation.isPending ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  Firma in corso...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-5 w-5 mr-2" />
                  Firma e Accetta Preventivo
                </>
              )}
            </Button>

            {!canSign && !isExpired && (
              <p className="text-sm text-muted-foreground text-center">
                {!signerName.trim() && "Inserisci il tuo nome. "}
                {!allRequiredAccepted &&
                  "Accetta tutte le clausole obbligatorie."}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Footer */}
        {quote.theme?.footerText && (
          <div className="text-center text-sm text-muted-foreground">
            <p>{quote.theme.footerText}</p>
          </div>
        )}
      </div>

      {/* ───────────────────────────────────────
          MODALE GUIDA BENEFIT
          ─────────────────────────────────────── */}
      <Dialog open={showBenefitGuide} onOpenChange={setShowBenefitGuide}>
        <DialogContent className="max-w-lg w-[95vw] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-playfair text-xl text-blue-gray">
              <Gift className="w-5 h-5 text-amber-500" />
              Come ottenere Benefict e Servizi a 0€
            </DialogTitle>
            <DialogDescription className="text-sm text-dark-sage">
              Seleziona i servizi indicati e il relativo Servizio Incluso si
              sblocca automaticamente — senza costi aggiuntivi.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 mt-2">
            {benefitStates.map((bs, i) => {
              const giftNames = bs.rule.benefitProductNames ?? [];
              const reqNames = bs.rule.requiredProductNames ?? [];
              const minCount = bs.rule.minSelectableCount;
              const isUnlocked = bs.isUnlocked;

              return (
                <div
                  key={i}
                  className={`rounded-xl border p-4 transition-all ${
                    isUnlocked
                      ? "border-emerald-300 bg-emerald-50"
                      : "border-amber-200 bg-amber-50/60"
                  }`}
                >
                  {/* Header: status + gift name */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      {isUnlocked ? (
                        <Unlock className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                      ) : (
                        <Lock className="w-4 h-4 text-amber-600 flex-shrink-0" />
                      )}
                      <span className="font-semibold text-sm">
                        {giftNames.join(", ")}
                      </span>
                    </div>
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                        isUnlocked
                          ? "bg-emerald-600 text-white"
                          : "bg-amber-200 text-amber-800"
                      }`}
                    >
                      {isUnlocked ? "✓ SBLOCCATO" : "DA SBLOCCARE"}
                    </span>
                  </div>

                  {/* Condizioni visuali */}
                  <div className="space-y-1.5">
                    {/* Prodotti trigger richiesti */}
                    {reqNames.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 items-center">
                        <span className="text-xs text-dark-sage font-medium">
                          Includi nel preventivo:
                        </span>
                        {reqNames.map((name) => {
                          const selected = selectedProducts.includes(name);
                          return (
                            <span
                              key={name}
                              className={`text-xs px-2 py-0.5 rounded-full border font-medium flex items-center gap-1 ${
                                selected
                                  ? "bg-emerald-100 border-emerald-300 text-emerald-700"
                                  : "bg-white border-amber-300 text-amber-700"
                              }`}
                            >
                              {selected ? "✓" : "○"} {name}
                            </span>
                          );
                        })}
                      </div>
                    )}

                    {/* Minimo selezionabili */}
                    {minCount && minCount > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-dark-sage font-medium">
                          Minimo:
                        </span>
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            bs.currentCount >= minCount
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {bs.currentCount}/{minCount} servizi selezionati
                        </span>
                        {/* Barra progresso */}
                        <div className="flex-1 bg-gray-200 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-1.5 rounded-full transition-all ${
                              bs.currentCount >= minCount
                                ? "bg-emerald-500"
                                : "bg-amber-400"
                            }`}
                            style={{
                              width: `${Math.min(100, (bs.currentCount / minCount) * 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Pulsante autocompila per questa singola regola */}
                  {!isUnlocked &&
                    (reqNames.length > 0 || (minCount && minCount > 0)) && (
                      <button
                        onClick={() => autoFillForRule(bs)}
                        className="mt-3 w-full flex items-center justify-center gap-1.5 text-xs font-semibold py-1.5 px-3 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-300 transition-all"
                        data-testid={`button-autofill-rule-${i}`}
                      >
                        <Zap className="w-3 h-3" />
                        Seleziona i servizi per sbloccare questo Servizio
                        Incluso
                      </button>
                    )}
                </div>
              );
            })}
          </div>

          {/* Nota esplicativa */}
          <div className="mt-4 pt-4 border-t border-dashed border-gray-200">
            <p className="text-xs text-center text-dark-sage opacity-70">
              I servizi trigger vengono aggiunti alla selezione — puoi sempre
              modificarli. I Servizi Inclusi li scegli tu: se la regola è
              attiva, il costo diventa €0.
            </p>
          </div>

          {/* Tutto già sbloccato */}
          {benefitStates.length > 0 &&
            benefitStates.every((bs) => bs.isUnlocked) && (
              <div className="mt-3 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-center">
                <p className="text-sm font-semibold text-emerald-700">
                  🎉 Ottimo! Hai sbloccato tutti i Servizi Inclusi.
                </p>
              </div>
            )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
