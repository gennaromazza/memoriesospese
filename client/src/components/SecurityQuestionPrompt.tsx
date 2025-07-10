import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';
import { Shield, AlertCircle } from 'lucide-react';

interface SecurityQuestionPromptProps {
  question: string;
  onSubmit: (answer: string) => void;
  error?: string;
  isLoading?: boolean;
}

export default function SecurityQuestionPrompt({
  question,
  onSubmit,
  error,
  isLoading = false
}: SecurityQuestionPromptProps) {
  const [answer, setAnswer] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (answer.trim()) {
      onSubmit(answer.trim());
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
          <Shield className="h-6 w-6 text-blue-600" />
        </div>
        <CardTitle className="text-xl">Domanda di Sicurezza</CardTitle>
        <CardDescription>
          Per accedere alla galleria, rispondi alla domanda di sicurezza
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="securityAnswer" className="text-sm font-medium">
              {question}
            </Label>
            <Input
              id="securityAnswer"
              type="text"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Inserisci la tua risposta"
              disabled={isLoading}
              className="w-full"
              autoFocus
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button 
            type="submit" 
            className="w-full" 
            disabled={!answer.trim() || isLoading}
          >
            {isLoading ? 'Verifica in corso...' : 'Conferma'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}