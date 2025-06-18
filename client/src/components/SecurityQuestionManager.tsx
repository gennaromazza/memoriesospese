import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Shield, Save, AlertCircle, CheckCircle } from 'lucide-react';

interface SecurityQuestionManagerProps {
  galleryId: string;
  initialData?: {
    requiresSecurityQuestion?: boolean;
    securityQuestionType?: string;
    securityQuestionCustom?: string;
    securityAnswer?: string;
  };
}

const QUESTION_TYPES = [
  { value: 'location', label: "Qual è il nome della location dell'evento?" },
  { value: 'month', label: "In che mese si è svolto l'evento?" },
  { value: 'custom', label: 'Domanda personalizzata' }
];

export default function SecurityQuestionManager({ 
  galleryId, 
  initialData 
}: SecurityQuestionManagerProps) {
  const [enabled, setEnabled] = useState(initialData?.requiresSecurityQuestion || false);
  const [questionType, setQuestionType] = useState(initialData?.securityQuestionType || '');
  const [customQuestion, setCustomQuestion] = useState(initialData?.securityQuestionCustom || '');
  const [answer, setAnswer] = useState(initialData?.securityAnswer || '');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const { toast } = useToast();

  const selectedQuestionText = () => {
    if (!questionType) return '';
    const type = QUESTION_TYPES.find(t => t.value === questionType);
    return questionType === 'custom' ? customQuestion : type?.label || '';
  };

  const handleSave = async () => {
    setIsLoading(true);
    setError('');
    setSuccess(false);

    try {
      // Validazione lato client
      if (enabled) {
        if (!questionType) {
          setError('Seleziona un tipo di domanda di sicurezza');
          return;
        }
        
        if (questionType === 'custom' && !customQuestion.trim()) {
          setError('Inserisci una domanda personalizzata');
          return;
        }
        
        if (!answer.trim()) {
          setError('Inserisci la risposta alla domanda di sicurezza');
          return;
        }
      }

      const requestData = {
        userEmail: 'gennaro.mazzacane@gmail.com', // Admin email
        userName: 'Admin',
        requiresSecurityQuestion: enabled,
        securityQuestionType: enabled ? questionType : null,
        securityQuestionCustom: enabled && questionType === 'custom' ? customQuestion.trim() : null,
        securityAnswer: enabled ? answer.trim() : null
      };

      const response = await fetch(`/api/galleries/${galleryId}/security-question`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Errore nel salvataggio');
      }

      const result = await response.json();
      setSuccess(true);
      
      toast({
        title: "Impostazioni salvate",
        description: result.message,
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Errore sconosciuto';
      setError(errorMessage);
      
      toast({
        title: "Errore",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <div className="flex items-center space-x-2">
          <Shield className="h-5 w-5 text-blue-600" />
          <CardTitle>Domanda di Sicurezza</CardTitle>
        </div>
        <CardDescription>
          Configura una domanda di sicurezza aggiuntiva per proteggere l'accesso alla galleria
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Abilitazione domanda di sicurezza */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-base">Abilita domanda di sicurezza</Label>
            <p className="text-sm text-gray-500">
              Gli utenti dovranno rispondere a questa domanda oltre alla password
            </p>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={setEnabled}
            disabled={isLoading}
          />
        </div>

        {enabled && (
          <>
            {/* Tipo di domanda */}
            <div className="space-y-2">
              <Label htmlFor="questionType">Tipo di domanda</Label>
              <Select 
                value={questionType} 
                onValueChange={setQuestionType}
                disabled={isLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona il tipo di domanda" />
                </SelectTrigger>
                <SelectContent>
                  {QUESTION_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Domanda personalizzata */}
            {questionType === 'custom' && (
              <div className="space-y-2">
                <Label htmlFor="customQuestion">Domanda personalizzata</Label>
                <Textarea
                  id="customQuestion"
                  value={customQuestion}
                  onChange={(e) => setCustomQuestion(e.target.value)}
                  placeholder="Inserisci la tua domanda personalizzata"
                  disabled={isLoading}
                  className="min-h-[80px]"
                />
              </div>
            )}

            {/* Anteprima domanda */}
            {questionType && (
              <div className="space-y-2">
                <Label>Anteprima domanda</Label>
                <div className="p-3 bg-gray-50 rounded-md text-sm font-medium">
                  {selectedQuestionText()}
                </div>
              </div>
            )}

            {/* Risposta */}
            <div className="space-y-2">
              <Label htmlFor="answer">Risposta corretta</Label>
              <Input
                id="answer"
                type="text"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Inserisci la risposta corretta"
                disabled={isLoading}
              />
              <p className="text-xs text-gray-500">
                La risposta non è case-sensitive. Esempio: "Milano" è uguale a "milano"
              </p>
            </div>
          </>
        )}

        {/* Messaggi di stato */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert className="border-green-200 bg-green-50">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              Impostazioni salvate con successo!
            </AlertDescription>
          </Alert>
        )}

        {/* Pulsante salva */}
        <Button 
          onClick={handleSave}
          disabled={isLoading}
          className="w-full"
        >
          <Save className="h-4 w-4 mr-2" />
          {isLoading ? 'Salvataggio...' : 'Salva Impostazioni'}
        </Button>
      </CardContent>
    </Card>
  );
}