import React, { useState, useEffect } from 'react';
import { useGalleryAccess } from '../hooks/use-gallery-access';
import SecurityQuestionPrompt from './SecurityQuestionPrompt';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';
import { Lock, AlertCircle } from 'lucide-react';

interface GalleryAccessFlowProps {
  galleryId: string;
  onAccessGranted: () => void;
}

type AccessStep = 'loading' | 'password' | 'security-question' | 'granted';

export default function GalleryAccessFlow({ galleryId, onAccessGranted }: GalleryAccessFlowProps) {
  const [currentStep, setCurrentStep] = useState<AccessStep>('loading');
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  
  const { getAccessInfo, verifyAccess, accessInfo, isLoading, error } = useGalleryAccess();

  useEffect(() => {
    const initializeAccess = async () => {
      try {
        const info = await getAccessInfo(galleryId);
        
        if (!info.requiresPassword && !info.requiresSecurityQuestion) {
          // Accesso libero
          setCurrentStep('granted');
          onAccessGranted();
        } else if (info.requiresPassword) {
          setCurrentStep('password');
        } else if (info.requiresSecurityQuestion) {
          setCurrentStep('security-question');
        }
      } catch (error) {
        console.error('Errore inizializzazione accesso:', error);
      }
    };

    initializeAccess();
  }, [galleryId, getAccessInfo, onAccessGranted]);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');

    if (!password.trim()) {
      setPasswordError('Password richiesta');
      return;
    }

    try {
      if (accessInfo?.requiresSecurityQuestion) {
        // Se richiede anche domanda di sicurezza, passa al prossimo step
        setCurrentStep('security-question');
      } else {
        // Solo password richiesta
        await verifyAccess({ galleryId, password });
        setCurrentStep('granted');
        onAccessGranted();
      }
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : 'Errore verifica password');
    }
  };

  const handleSecurityAnswerSubmit = async (securityAnswer: string) => {
    try {
      await verifyAccess({ 
        galleryId, 
        password: accessInfo?.requiresPassword ? password : undefined,
        securityAnswer 
      });
      setCurrentStep('granted');
      onAccessGranted();
    } catch (error) {
      // L'errore sarà mostrato dal componente SecurityQuestionPrompt
      console.error('Errore verifica domanda sicurezza:', error);
    }
  };

  if (currentStep === 'loading') {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardContent className="pt-6">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
            <p className="mt-2 text-sm text-gray-600">Verifica accesso galleria...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (currentStep === 'password') {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
            <Lock className="h-6 w-6 text-blue-600" />
          </div>
          <CardTitle className="text-xl">Accesso Protetto</CardTitle>
          <CardDescription>
            Questa galleria è protetta da password
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Password Galleria</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Inserisci la password"
                disabled={isLoading}
                autoFocus
              />
            </div>

            {passwordError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{passwordError}</AlertDescription>
              </Alert>
            )}

            <Button 
              type="submit" 
              className="w-full" 
              disabled={!password.trim() || isLoading}
            >
              {isLoading ? 'Verifica...' : 'Continua'}
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  if (currentStep === 'security-question' && accessInfo?.securityQuestion) {
    return (
      <SecurityQuestionPrompt
        question={accessInfo.securityQuestion}
        onSubmit={handleSecurityAnswerSubmit}
        error={error}
        isLoading={isLoading}
      />
    );
  }

  if (currentStep === 'granted') {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardContent className="pt-6">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <Lock className="h-6 w-6 text-green-600" />
            </div>
            <h3 className="text-lg font-semibold text-green-800">Accesso Autorizzato</h3>
            <p className="text-sm text-green-600 mt-2">Caricamento galleria in corso...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return null;
}