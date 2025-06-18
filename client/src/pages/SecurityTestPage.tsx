import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import SecurityQuestionManager from '@/components/SecurityQuestionManager';
import GalleryAccessFlow from '@/components/GalleryAccessFlow';

export default function SecurityTestPage() {
  const [testGalleryId, setTestGalleryId] = useState('');
  const [showManager, setShowManager] = useState(false);
  const [showAccessFlow, setShowAccessFlow] = useState(false);
  const [accessGranted, setAccessGranted] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Test Sistema Domande di Sicurezza
          </h1>
          <p className="text-gray-600">
            Interfaccia per testare il nuovo sistema di autenticazione con domande di sicurezza
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          {/* Configurazione Admin */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Configurazione Admin</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Gallery ID di Test</label>
                  <Input
                    value={testGalleryId}
                    onChange={(e) => setTestGalleryId(e.target.value)}
                    placeholder="Inserisci un Gallery ID esistente"
                  />
                </div>
                
                <Button 
                  onClick={() => setShowManager(true)}
                  disabled={!testGalleryId}
                  className="w-full"
                >
                  Apri Gestione Domande di Sicurezza
                </Button>
                
                {showManager && testGalleryId && (
                  <div className="mt-6">
                    <SecurityQuestionManager 
                      galleryId={testGalleryId}
                      initialData={{
                        requiresSecurityQuestion: false,
                        securityQuestionType: '',
                        securityQuestionCustom: '',
                        securityAnswer: ''
                      }}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Test Accesso Utente */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Test Accesso Utente</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Gallery ID da Testare</label>
                  <Input
                    value={testGalleryId}
                    onChange={(e) => setTestGalleryId(e.target.value)}
                    placeholder="Stesso Gallery ID configurato sopra"
                  />
                </div>
                
                <Button 
                  onClick={() => {
                    setShowAccessFlow(true);
                    setAccessGranted(false);
                  }}
                  disabled={!testGalleryId}
                  className="w-full"
                >
                  Simula Accesso Galleria
                </Button>
                
                {showAccessFlow && testGalleryId && !accessGranted && (
                  <div className="mt-6">
                    <GalleryAccessFlow
                      galleryId={testGalleryId}
                      onAccessGranted={() => setAccessGranted(true)}
                    />
                  </div>
                )}
                
                {accessGranted && (
                  <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                    <h3 className="font-semibold text-green-800">Accesso Riuscito!</h3>
                    <p className="text-green-600 text-sm mt-1">
                      L'utente ha superato tutti i controlli di sicurezza e può accedere alla galleria.
                    </p>
                    <Button 
                      onClick={() => {
                        setShowAccessFlow(false);
                        setAccessGranted(false);
                      }}
                      variant="outline"
                      size="sm"
                      className="mt-3"
                    >
                      Testa di nuovo
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Istruzioni */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Come Testare</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal list-inside space-y-2 text-sm">
              <li>Inserisci un Gallery ID esistente nel campo sopra</li>
              <li>Usa "Gestione Domande di Sicurezza" per configurare una domanda</li>
              <li>Abilita la domanda di sicurezza e salva le impostazioni</li>
              <li>Usa "Simula Accesso Galleria" per testare il flusso utente</li>
              <li>Verifica che vengano richiesti password e domanda di sicurezza</li>
            </ol>
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <h4 className="font-semibold text-blue-800 text-sm">Tipi di Domande Disponibili:</h4>
              <ul className="text-blue-600 text-xs mt-1 space-y-1">
                <li>• <strong>Location:</strong> "Qual è il nome della location dell'evento?"</li>
                <li>• <strong>Mese:</strong> "In che mese si è svolto l'evento?"</li>
                <li>• <strong>Personalizzata:</strong> Domanda definita dall'admin</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}