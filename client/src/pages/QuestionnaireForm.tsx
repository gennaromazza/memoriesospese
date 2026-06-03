/**
 * Public Questionnaire Form Page - Fase 7 Completa
 * Form multi-step per bride/groom con validazione token, autosave e navigazione
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useSearch } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { 
  AlertCircle, 
  Heart, 
  Users, 
  ChevronLeft, 
  ChevronRight, 
  Save, 
  Send,
  Clock,
  CheckCircle,
  ArrowLeft,
  Shield,
  FileText
} from 'lucide-react';
import { QuestionnaireService } from '@/lib/questionnaire';
import { FaqSet, Role, QuestionKey } from '@shared/schema';
import { debounce } from '@shared/schema';

interface QuestionnaireFormParams {
  galleryId: string;
}

interface FormData {
  [key: string]: string;
}

interface QuestionnaireState {
  currentStep: number;
  totalSteps: number;
  answers: FormData;
  isSubmitted: boolean;
  hasChanges: boolean;
  lastSaved: number | null;
}

const AUTOSAVE_DELAY = 7000; // 7 secondi
const LOCAL_STORAGE_KEY = 'questionnaire-draft';

export default function QuestionnaireForm() {
  const params = useParams<QuestionnaireFormParams>();
  const search = useSearch();
  const { toast } = useToast();
  
  // Stato base
  const [isLoading, setIsLoading] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Dati questionario
  const [faqSet, setFaqSet] = useState<FaqSet | null>(null);
  const [questionnaireId, setQuestionnaireId] = useState<string>('');
  const [currentRole, setCurrentRole] = useState<Role | null>(null);
  
  // Stato form
  const [formState, setFormState] = useState<QuestionnaireState>({
    currentStep: 0,
    totalSteps: 0, // Inizializzato a 0, verrà aggiornato dinamicamente
    answers: {},
    isSubmitted: false,
    hasChanges: false,
    lastSaved: null
  });
  
  // Consensi e privacy
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);

  // Debug function for privacy consent
  const handlePrivacyConsentChange = (checked: boolean | string) => {
    console.log('🔥 Privacy consent change:', checked, typeof checked);
    const booleanValue = checked === true || checked === 'true';
    setPrivacyConsent(booleanValue);
    console.log('🔥 Privacy consent set to:', booleanValue);
  };

  // Alternative handler for direct toggle
  const togglePrivacyConsent = () => {
    const newValue = !privacyConsent;
    console.log('🔥 Privacy consent toggle - old:', privacyConsent, 'new:', newValue);
    setPrivacyConsent(newValue);
  };

  // Estrai parametri URL
  const urlParams = new URLSearchParams(search);
  const tokenFromUrl = urlParams.get('token');
  const [token, setToken] = useState<string | null>(() => {
    return tokenFromUrl || localStorage.getItem('questionnaire-token');
  });
  const [hasValidated, setHasValidated] = useState(
    localStorage.getItem('questionnaire-token-valid') === 'true'
  );

  const roleFromUrl = urlParams.get('role') as Role | null;
  
  // Use currentRole from state or fall back to URL role
  const role = currentRole || roleFromUrl;

  // Domanda corrente
  const currentQuestion = useMemo(() => {
    if (!faqSet || formState.currentStep >= faqSet.questions.length) return null;
    return faqSet.questions[formState.currentStep];
  }, [faqSet, formState.currentStep]);

  // Progress percentage
  const progressPercentage = useMemo(() => {
    return Math.round((formState.currentStep / formState.totalSteps) * 100);
  }, [formState.currentStep, formState.totalSteps]);

  // Debounced autosave
  const debouncedSave = useCallback(
    debounce(async (answers: FormData) => {
      const activeRole = currentRole || roleFromUrl;
      if (!params?.galleryId || !questionnaireId || !activeRole) return;
      
      try {
        setIsSaving(true);
        
        // Salva ogni risposta individualmente
        const savePromises = Object.entries(answers).map(([questionKey, answer]) => 
          QuestionnaireService.saveDraft(
            params.galleryId,
            questionnaireId,
            activeRole,
            questionKey as QuestionKey,
            answer
          )
        );
        
        await Promise.all(savePromises);
        
        // Salva anche in localStorage come backup
        const localData = {
          galleryId: params.galleryId,
          questionnaireId,
          role: activeRole,
          answers,
          timestamp: Date.now()
        };
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(localData));
        
        setFormState(prev => ({ ...prev, lastSaved: Date.now(), hasChanges: false }));
        
        toast({
          title: "Bozza salvata",
          description: "Le tue risposte sono state salvate automaticamente",
          variant: "default"
        });
      } catch (error) {
        console.error('Errore autosave:', error);
        toast({
          title: "Errore salvataggio",
          description: "Impossibile salvare le risposte. Riprova.",
          variant: "destructive"
        });
      } finally {
        setIsSaving(false);
      }
    }, AUTOSAVE_DELAY),
    [params?.galleryId, questionnaireId, currentRole, roleFromUrl, toast]
  );

  // Validazione token e caricamento dati
  useEffect(() => {
    validateTokenAndLoadData();
  }, [token, currentRole, roleFromUrl]);

  // Meta tags noindex/nofollow
  useEffect(() => {
    const metaRobots = document.createElement('meta');
    metaRobots.name = 'robots';
    metaRobots.content = 'noindex, nofollow, noarchive, nosnippet';
    document.head.appendChild(metaRobots);

    return () => {
      const existingMeta = document.querySelector('meta[name="robots"]');
      if (existingMeta) {
        document.head.removeChild(existingMeta);
      }
    };
  }, []);

  // Autosave quando cambiano le risposte
  useEffect(() => {
    if (formState.hasChanges && Object.keys(formState.answers).length > 0) {
      debouncedSave(formState.answers);
    }
  }, [formState.answers, formState.hasChanges, debouncedSave]);

  const validateTokenAndLoadData = async () => {
    if (!token || !params?.galleryId) {
      console.error('🔴 LINK INCOMPLETO - Parametri mancanti:');
      console.error('🔴 token presente:', !!token);
      console.error('🔴 role presente:', !!roleFromUrl, '(opzionale)');
      console.error('🔴 galleryId presente:', !!params?.galleryId);
      console.error('🔴 URL completo:', window.location.href);
      setIsLoading(false);
      setTokenValid(false);
      return;
    }

    try {
      // 🎯 Step 2: Salta validazione remota se già validato
      if (hasValidated && localStorage.getItem('questionnaire-session')) {
        const savedQuestionnaireId = localStorage.getItem('questionnaire-id');
        const savedRole = localStorage.getItem('questionnaire-role') as Role | null;
        if (savedQuestionnaireId && savedRole) {
          setTokenValid(true);
          setQuestionnaireId(savedQuestionnaireId);
          setCurrentRole(savedRole);
          
          // Cleanup URL params se necessario
          const { TokenValidationService } = await import('@/lib/tokenValidation');
          TokenValidationService.cleanupUrlParams();
          
          // Carica direttamente i dati senza validazione remota
          await loadQuestionnaireData(savedQuestionnaireId);
          setIsLoading(false);
          return;
        }
      }

      // Validazione remota necessaria
      const { TokenValidationService } = await import('@/lib/tokenValidation');
      
      const validation = await TokenValidationService.validateTokenAndCreateSession(
        token,
        params.galleryId,
        roleFromUrl || undefined, // Convert null to undefined
        TokenValidationService.generateBrowserFingerprint()
      );

      if (!validation.valid || !validation.questionnaireId || !validation.role) {
        setTokenValid(false);
        setIsLoading(false);
        return;
      }

      setTokenValid(true);
      setQuestionnaireId(validation.questionnaireId);
      setCurrentRole(validation.role); // Set the inferred role
      setHasValidated(true);
      
      // 🎯 Salva tutto in localStorage dopo validazione riuscita
      localStorage.setItem('questionnaire-token', token);
      localStorage.setItem('questionnaire-token-valid', 'true');
      localStorage.setItem('questionnaire-role', validation.role);
      if (validation.sessionId) {
        localStorage.setItem('questionnaire-session', validation.sessionId);
      }
      localStorage.setItem('questionnaire-id', validation.questionnaireId);

      // Mantieni URL pulito
      TokenValidationService.cleanupUrlParams();

      // Carica set domande e dati esistenti
      await loadQuestionnaireData(validation.questionnaireId);
      
    } catch (error) {
      console.error('Errore validazione token:', error);
      setTokenValid(false);
      // Reset validation state on error
      setHasValidated(false);
      localStorage.removeItem('questionnaire-token-valid');
      localStorage.removeItem('questionnaire-session');
      localStorage.removeItem('questionnaire-id');
    } finally {
      setIsLoading(false);
    }
  };

  const loadQuestionnaireData = async (qId: string) => {
    const activeRole = currentRole || roleFromUrl;
    if (!params?.galleryId || !activeRole) return;

    try {
      // Carica set domande attivo
      const activeFaqSet = await QuestionnaireService.getActiveFaqSet();
      if (!activeFaqSet) {
        throw new Error('Nessun set di domande attivo trovato');
      }
      
      setFaqSet(activeFaqSet);
      setFormState(prev => ({ ...prev, totalSteps: activeFaqSet.questions.length }));

      // Carica bozze esistenti
      const draft = await QuestionnaireService.getDraft(params.galleryId, qId, activeRole);
      
      // Carica da localStorage se disponibile e più recente
      const localStorageData = loadFromLocalStorage();
      
      let initialAnswers: FormData = {};
      
      if (localStorageData && localStorageData.timestamp > (draft?.updatedAt || 0)) {
        initialAnswers = localStorageData.answers;
        toast({
          title: "Bozza recuperata",
          description: "Abbiamo recuperato le tue risposte salvate localmente",
          variant: "default"
        });
      } else if (draft) {
        initialAnswers = draft.answers;
        toast({
          title: "Progressi recuperati",
          description: "Abbiamo caricato le tue risposte precedenti",
          variant: "default"
        });
      }

      // Verifica se è già stato sottomesso
      const finalAnswers = await QuestionnaireService.getAnswers(params.galleryId, qId, activeRole);
      if (finalAnswers) {
        setFormState(prev => ({
          ...prev,
          answers: finalAnswers.answers,
          isSubmitted: true,
          currentStep: activeFaqSet.questions.length - 1
        }));
        return;
      }

      // Imposta stato iniziale
      setFormState(prev => ({
        ...prev,
        answers: initialAnswers,
        currentStep: findLastAnsweredStep(initialAnswers, activeFaqSet.questions),
        hasChanges: false
      }));

    } catch (error) {
      console.error('Errore caricamento dati questionario:', error);
      toast({
        title: "Errore caricamento",
        description: "Impossibile caricare il questionario",
        variant: "destructive"
      });
    }
  };

  const loadFromLocalStorage = () => {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (!stored) return null;
      
      const data = JSON.parse(stored);
      const activeRole = currentRole || roleFromUrl;
      if (data.galleryId === params?.galleryId && data.role === activeRole) {
        return data;
      }
    } catch (error) {
      console.error('Errore caricamento localStorage:', error);
    }
    return null;
  };

  const findLastAnsweredStep = (answers: FormData, questions: any[]): number => {
    for (let i = questions.length - 1; i >= 0; i--) {
      if (answers[questions[i].key]) {
        return Math.min(i + 1, questions.length - 1);
      }
    }
    return 0;
  };

  const handleAnswerChange = (value: string) => {
    if (!currentQuestion) return;

    setFormState(prev => ({
      ...prev,
      answers: {
        ...prev.answers,
        [currentQuestion.key]: value
      },
      hasChanges: true
    }));
  };

  const handlePrevStep = () => {
    if (formState.currentStep > 0) {
      setFormState(prev => ({
        ...prev,
        currentStep: prev.currentStep - 1
      }));
    }
  };

  const handleNextStep = () => {
    if (formState.currentStep < formState.totalSteps - 1) {
      setFormState(prev => ({
        ...prev,
        currentStep: prev.currentStep + 1
      }));
    }
  };

  const handleManualSave = async () => {
    const activeRole = currentRole || roleFromUrl;
    if (!params?.galleryId || !questionnaireId || !activeRole) return;

    try {
      setIsSaving(true);
      await debouncedSave(formState.answers);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmit = async () => {
    const activeRole = currentRole || roleFromUrl;
    if (!params?.galleryId || !questionnaireId || !activeRole || !faqSet) return;

    // Verifica che tutte le domande abbiano risposta
    const unansweredQuestions = faqSet.questions.filter(q => 
      !formState.answers[q.key] || formState.answers[q.key].trim() === ''
    );

    if (unansweredQuestions.length > 0) {
      toast({
        title: "Questionario incompleto",
        description: `Mancano ${unansweredQuestions.length} risposte. Completa tutte le domande prima di inviare.`,
        variant: "destructive"
      });
      return;
    }

    if (!privacyConsent) {
      toast({
        title: "Consenso richiesto",
        description: "È necessario accettare l'informativa sulla privacy per procedere",
        variant: "destructive"
      });
      return;
    }

    try {
      setIsSubmitting(true);
      
      await QuestionnaireService.submitAnswers(
        params.galleryId,
        questionnaireId,
        activeRole,
        formState.answers as Record<QuestionKey, string>
      );

      setFormState(prev => ({ ...prev, isSubmitted: true }));
      
      // Pulisci localStorage
      localStorage.removeItem(LOCAL_STORAGE_KEY);

      // Notifica admin via email (fire-and-forget, non blocca l'utente)
      fetch('/api/email/questionnaire-completed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          galleryId: params.galleryId,
          questionnaireId,
          role: activeRole,
        }),
      })
        .then(r => {
          if (!r.ok) console.warn('⚠️ Notifica admin questionario non riuscita:', r.status);
          else console.log('✅ Admin notificato del completamento questionario');
        })
        .catch(err => console.warn('⚠️ Errore invio notifica admin:', err));
      
      toast({
        title: "Questionario inviato!",
        description: "Grazie per aver condiviso i vostri ricordi speciali",
        variant: "default"
      });

      setSubmitDialogOpen(false);
      
    } catch (error) {
      console.error('Errore invio questionario:', error);
      toast({
        title: "Errore invio",
        description: "Impossibile inviare il questionario. Riprova.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-rose-50 to-pink-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rose-600 mx-auto mb-6"></div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Caricamento questionario...
          </h2>
          <p className="text-gray-600">
            Verifica token e caricamento domande
          </p>
        </div>
      </div>
    );
  }

  // Token invalid state
  if (!tokenValid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-rose-50">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center gap-2 text-red-600">
              <AlertCircle className="w-6 h-6" />
              Accesso Negato
            </CardTitle>
            <CardDescription>
              Token non valido o scaduto
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-gray-600 mb-4">
              Il link utilizzato non è valido o è scaduto. 
              Contatta gli sposi per un nuovo link di accesso.
            </p>
            <div className="space-y-2">
              <p className="text-sm text-gray-500">
                Galleria: {params?.galleryId}
              </p>
              {role && (
                <p className="text-sm text-gray-500">
                  Ruolo richiesto: {role === 'bride' ? 'Sposa' : 'Sposo'}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Submitted state
  if (formState.isSubmitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50">
        <div className="container mx-auto p-6 max-w-4xl">
          <div className="text-center py-16">
            <CheckCircle className="w-20 h-20 text-green-600 mx-auto mb-6" />
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              Questionario Completato!
            </h1>
            <p className="text-xl text-gray-600 mb-8">
              Grazie per aver condiviso i vostri ricordi speciali
            </p>
            
            <Card className="max-w-2xl mx-auto">
              <CardContent className="p-8">
                <div className="space-y-4">
                  <div className="flex items-center justify-center gap-2 text-lg">
                    <Heart className="w-6 h-6 text-rose-500" />
                    <span className="font-semibold">
                      {role === 'bride' ? 'Sposa' : 'Sposo'}
                    </span>
                  </div>
                  
                  <p className="text-gray-600">
                    Le tue risposte sono state salvate con successo. 
                    I tuoi ricordi diventeranno parte di un album personalizzato 
                    che celebra la vostra storia d'amore.
                  </p>
                  
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <p className="text-sm text-blue-800">
                      <strong>Prossimi passi:</strong> Attendi che anche il tuo partner completi 
                      il questionario. Una volta completate entrambe le parti, 
                      riceverete l'album personalizzato.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // Main questionnaire form
  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50">
      <div className="container mx-auto p-6 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-8 pt-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Heart className="w-8 h-8 text-rose-500" />
            <h1 className="text-4xl font-bold text-gray-900">
              Questionario Coppia
            </h1>
          </div>
          <p className="text-gray-600 text-lg">
            Condividi i momenti speciali del vostro amore
          </p>
          <div className="flex items-center justify-center gap-4 mt-4">
            <Badge variant="outline" className="text-rose-600 border-rose-200">
              {role === 'bride' ? '👰 Sposa' : '🤵 Sposo'}
            </Badge>
            <Badge variant="secondary">
              Domanda {formState.currentStep + 1} di {formState.totalSteps}
            </Badge>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">
              Progresso questionario
            </span>
            <span className="text-sm text-gray-500">
              {progressPercentage}%
            </span>
          </div>
          <Progress value={progressPercentage} className="h-2" />
        </div>

        {/* Auto-save indicator */}
        {(isSaving || formState.lastSaved) && (
          <div className="flex items-center justify-center gap-2 mb-6 text-sm text-gray-500">
            {isSaving ? (
              <>
                <Clock className="w-4 h-4 animate-spin" />
                <span>Salvataggio in corso...</span>
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span>
                  Ultima modifica salvata: {new Date(formState.lastSaved!).toLocaleTimeString('it-IT')}
                </span>
              </>
            )}
          </div>
        )}

        {/* Question Form */}
        {currentQuestion && (
          <Card className="border-2 border-rose-100 mb-8">
            <CardHeader>
              <CardTitle className="text-2xl text-center">
                {currentQuestion.text}
              </CardTitle>
              <CardDescription className="text-center">
                Domanda {formState.currentStep + 1} di {formState.totalSteps}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label htmlFor="answer" className="text-base font-medium">
                  La tua risposta
                </Label>
                {currentQuestion.type === 'textarea' ? (
                  <Textarea
                    id="answer"
                    value={formState.answers[currentQuestion.key] || ''}
                    onChange={(e) => handleAnswerChange(e.target.value)}
                    placeholder="Condividi qui il tuo ricordo o pensiero..."
                    className="mt-2 min-h-[120px] text-base"
                    maxLength={1500}
                  />
                ) : (
                  <Input
                    id="answer"
                    value={formState.answers[currentQuestion.key] || ''}
                    onChange={(e) => handleAnswerChange(e.target.value)}
                    placeholder="Inserisci la tua risposta..."
                    className="mt-2 text-base"
                    maxLength={200}
                  />
                )}
                <div className="flex justify-between mt-2">
                  <p className="text-sm text-gray-500">
                    {currentQuestion.type === 'textarea' 
                      ? 'Massimo 1500 caratteri' 
                      : 'Massimo 200 caratteri'
                    }
                  </p>
                  <p className="text-sm text-gray-500">
                    {(formState.answers[currentQuestion.key] || '').length} caratteri
                  </p>
                </div>
              </div>

              {/* Navigation */}
              <div className="flex items-center justify-between pt-4">
                <Button
                  variant="outline"
                  onClick={handlePrevStep}
                  disabled={formState.currentStep === 0}
                  className="flex items-center gap-2"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Precedente
                </Button>

                <Button
                  variant="outline"
                  onClick={handleManualSave}
                  disabled={isSaving || !formState.hasChanges}
                  className="flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  {isSaving ? 'Salvando...' : 'Salva'}
                </Button>

                {formState.currentStep < formState.totalSteps - 1 ? (
                  <Button
                    onClick={handleNextStep}
                    className="flex items-center gap-2"
                  >
                    Avanti
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                ) : (
                  <AlertDialog open={submitDialogOpen} onOpenChange={setSubmitDialogOpen}>
                    <AlertDialogTrigger asChild>
                      <Button className="flex items-center gap-2 bg-green-600 hover:bg-green-700">
                        <Send className="w-4 h-4" />
                        Invia Questionario
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                      <AlertDialogHeader>
                        <AlertDialogTitle>Conferma invio</AlertDialogTitle>
                        <AlertDialogDescription asChild>
                          <div className="space-y-4 text-left">
                            <p>
                              Stai per inviare il questionario completo. 
                              Una volta inviato, non potrai più modificare le risposte.
                            </p>
                            
                            <div className="bg-blue-50 p-4 rounded-lg">
                              <h4 className="font-medium text-blue-900 mb-2">
                                Riepilogo completamento:
                              </h4>
                            <ul className="text-sm text-blue-800 space-y-1">
                              <li>✓ Domande completate: {Object.keys(formState.answers).length}/{formState.totalSteps}</li>
                              <li>✓ Tutte le risposte sono state verificate</li>
                              <li>✓ I dati sono stati salvati automaticamente</li>
                            </ul>
                          </div>

                          {/* Privacy Consent Section */}
                          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                            <div 
                              className={`flex items-start space-x-3 cursor-pointer p-2 rounded transition-colors ${
                                privacyConsent ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'
                              } border`}
                              onClick={togglePrivacyConsent}
                              data-testid="privacy-consent-area"
                            >
                              <div className="relative">
                                <Checkbox
                                  id="privacy"
                                  checked={privacyConsent}
                                  onCheckedChange={handlePrivacyConsentChange}
                                  data-testid="checkbox-privacy-consent"
                                  className="pointer-events-none"
                                />
                                {/* Fallback visual indicator */}
                                <div className={`absolute inset-0 flex items-center justify-center ${
                                  privacyConsent ? 'text-green-600' : 'text-gray-400'
                                }`}>
                                  {privacyConsent ? '✓' : '○'}
                                </div>
                              </div>
                              <div className="flex-1">
                                <label 
                                  htmlFor="privacy" 
                                  className="text-sm text-gray-700 leading-5 cursor-pointer"
                                >
                                  <strong>Consenso privacy richiesto:</strong> Accetto che i miei dati vengano utilizzati per la creazione 
                                  dell'album personalizzato e confermo di aver letto l'informativa sulla privacy.
                                </label>
                                <div className="mt-1 text-xs text-gray-500">
                                  Clicca qui o sul checkbox per dare il consenso
                                </div>
                              </div>
                              <div className={`text-lg ${privacyConsent ? 'text-green-600' : 'text-gray-400'}`}>
                                {privacyConsent ? '✅' : '❌'}
                              </div>
                            </div>
                            
                            {/* Alternative buttons */}
                            <div className="flex gap-2 mt-3">
                              <Button
                                type="button"
                                variant={privacyConsent ? "default" : "outline"}
                                size="sm"
                                onClick={() => setPrivacyConsent(true)}
                                className="flex-1"
                                data-testid="button-accept-privacy"
                              >
                                ✓ Accetto
                              </Button>
                              <Button
                                type="button"
                                variant={!privacyConsent ? "default" : "outline"}
                                size="sm"
                                onClick={() => setPrivacyConsent(false)}
                                className="flex-1"
                                data-testid="button-decline-privacy"
                              >
                                ✗ Non accetto
                              </Button>
                            </div>
                          </div>
                          
                          {/* Debug info */}
                            <div className="text-xs text-gray-500 bg-gray-100 p-2 rounded mt-2">
                              <strong>Debug Info:</strong> Privacy consent: {privacyConsent ? 'TRUE ✅' : 'FALSE ❌'} | 
                              Submit button: {(!privacyConsent || isSubmitting) ? 'DISABLED 🔒' : 'ENABLED ✅'} |
                              Submitting: {isSubmitting ? 'YES' : 'NO'}
                            </div>
                          </div>
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Annulla</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleSubmit}
                          disabled={isSubmitting || !privacyConsent}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          {isSubmitting ? 'Invio in corso...' : 'Conferma e invia'}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Security Notice */}
        <Card className="border border-gray-200 bg-gray-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Shield className="w-4 h-4" />
              <span>
                I tuoi dati sono protetti e utilizzati esclusivamente per la creazione dell'album personalizzato.
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}