import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, Mail, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface EmailStatus {
  smtp: { available: boolean; error: string | null };
  sendgrid: { available: boolean; error: string | null };
  config: {
    host: string;
    port: string;
    user: string;
    from: string;
    hasSendGridKey: boolean;
  };
  workingProvider: string | null;
  message: string;
}

export default function EmailStatusPanel() {
  const [status, setStatus] = useState<EmailStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastTest, setLastTest] = useState<Date | null>(null);
  const { toast } = useToast();

  const testEmailConfiguration = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/test-email');
      if (response.ok) {
        const data = await response.json();
        setStatus(data);
        setLastTest(new Date());
        
        toast({
          title: data.success ? "Test completato" : "Test fallito",
          description: data.message,
          variant: data.success ? "default" : "destructive",
        });
      } else {
        throw new Error('Errore nel test email');
      }
    } catch (error) {
      toast({
        title: "Errore",
        description: "Impossibile testare la configurazione email",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const sendTestEmail = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/send-welcome-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: status?.config.from || 'test@example.com',
          galleryName: 'Test Gallery'
        }),
      });

      if (response.ok) {
        toast({
          title: "Email di test inviata",
          description: "Controlla i log del server per i dettagli",
        });
      } else {
        throw new Error('Errore nell\'invio email di test');
      }
    } catch (error) {
      toast({
        title: "Errore",
        description: "Impossibile inviare email di test",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Stato Sistema Email
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button 
            onClick={testEmailConfiguration}
            disabled={isLoading}
            variant="outline"
            size="sm"
          >
            {isLoading ? (
              <RefreshCw className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Testa Configurazione
          </Button>
          
          {status && (
            <Button 
              onClick={sendTestEmail}
              disabled={isLoading || !status.workingProvider}
              size="sm"
            >
              <Mail className="h-4 w-4 mr-2" />
              Invia Email Test
            </Button>
          )}
        </div>

        {lastTest && (
          <p className="text-sm text-muted-foreground">
            Ultimo test: {lastTest.toLocaleString()}
          </p>
        )}

        {status && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-medium">Provider Attivo:</span>
              {status.workingProvider ? (
                <Badge variant="default" className="bg-green-100 text-green-800">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  {status.workingProvider}
                </Badge>
              ) : (
                <Badge variant="destructive">
                  <XCircle className="h-3 w-3 mr-1" />
                  Nessuno
                </Badge>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <h4 className="font-medium mb-2">SMTP</h4>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    {status.smtp.available ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-600" />
                    )}
                    <span>{status.smtp.available ? 'Disponibile' : 'Non disponibile'}</span>
                  </div>
                  {status.smtp.error && (
                    <p className="text-red-600 text-xs">{status.smtp.error}</p>
                  )}
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-2">SendGrid</h4>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    {status.sendgrid.available ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-600" />
                    )}
                    <span>{status.sendgrid.available ? 'Disponibile' : 'Non disponibile'}</span>
                  </div>
                  {status.sendgrid.error && (
                    <p className="text-red-600 text-xs">{status.sendgrid.error}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-4 p-3 bg-gray-50 rounded-lg">
              <h4 className="font-medium mb-2">Configurazione</h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>Host: {status.config.host}</div>
                <div>Porta: {status.config.port}</div>
                <div>Utente: {status.config.user}</div>
                <div>Da: {status.config.from}</div>
                <div>SendGrid Key: {status.config.hasSendGridKey ? 'Configurata' : 'Mancante'}</div>
              </div>
            </div>

            <div className="mt-4 p-3 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>Modalità corrente:</strong> {status.message}
              </p>
              {process.env.NODE_ENV === 'development' && (
                <p className="text-xs text-blue-600 mt-1">
                  In modalità sviluppo, le email vengono simulate e registrate nei log del server.
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}