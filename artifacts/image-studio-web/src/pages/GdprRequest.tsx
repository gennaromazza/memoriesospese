import { useState } from 'react';
import { Link } from 'wouter';
import { ArrowLeft, Shield, Trash2, Download, CheckCircle, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { createUrl } from '@/lib/basePath';
import { apiRequest } from '@/lib/queryClient';

type RequestType = 'deletion' | 'export' | null;

export default function GdprRequest() {
  const { toast } = useToast();
  const [requestType, setRequestType] = useState<RequestType>(null);
  const [formData, setFormData] = useState({
    nome: '',
    cognome: '',
    email: '',
    telefono: '',
    motivo: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [requestId, setRequestId] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.email) {
      toast({
        title: 'Email obbligatoria',
        description: 'Inserisci la tua email per procedere con la richiesta.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const endpoint = requestType === 'deletion' ? '/api/gdpr/deletion-request' : '/api/gdpr/export-request';
      const response = await apiRequest('POST', endpoint, formData);
      const result = await response.json();

      if (result.success) {
        setRequestId(result.requestId);
        setIsSuccess(true);
        toast({
          title: 'Richiesta inviata',
          description: 'Riceverai una conferma via email.',
        });
      } else {
        throw new Error(result.error || 'Errore sconosciuto');
      }
    } catch (error: any) {
      toast({
        title: 'Errore',
        description: error.message || 'Impossibile inviare la richiesta.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-off-white py-12 px-4">
        <div className="max-w-lg mx-auto">
          <Card className="text-center">
            <CardContent className="pt-8 pb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-2xl font-semibold text-gray-800 mb-2">Richiesta Inviata</h2>
              <p className="text-gray-600 mb-4">
                La tua richiesta è stata ricevuta. Riceverai una conferma via email.
              </p>
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <p className="text-sm text-gray-500">ID Richiesta</p>
                <p className="font-mono text-sm font-medium" data-testid="gdpr-request-id">{requestId}</p>
              </div>
              <p className="text-sm text-gray-500 mb-6">
                Elaboreremo la tua richiesta entro 30 giorni come previsto dal GDPR.
              </p>
              <Link href={createUrl('/')}>
                <Button className="bg-sage hover:bg-sage/90" data-testid="gdpr-back-home">
                  Torna alla Homepage
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-off-white py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <Link href={createUrl('/')}>
            <Button variant="ghost" className="text-sage-600 hover:text-sage-700">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Torna alla Homepage
            </Button>
          </Link>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Shield className="w-8 h-8 text-sage" />
              <div>
                <CardTitle className="text-2xl">I Tuoi Diritti Privacy (GDPR)</CardTitle>
                <CardDescription>
                  Ai sensi del Regolamento UE 2016/679, hai diritto di richiedere la cancellazione o l'esportazione dei tuoi dati personali.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
        </Card>

        {!requestType ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card 
              className="cursor-pointer hover:border-red-300 hover:shadow-md transition-all"
              onClick={() => setRequestType('deletion')}
              data-testid="gdpr-select-deletion"
            >
              <CardContent className="pt-6 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-100 mb-4">
                  <Trash2 className="w-6 h-6 text-red-600" />
                </div>
                <h3 className="font-semibold text-lg mb-2">Cancellazione Dati</h3>
                <p className="text-sm text-gray-600">
                  Richiedi la cancellazione di tutti i tuoi dati personali (Art. 17 GDPR - Diritto all'oblio)
                </p>
              </CardContent>
            </Card>

            <Card 
              className="cursor-pointer hover:border-blue-300 hover:shadow-md transition-all"
              onClick={() => setRequestType('export')}
              data-testid="gdpr-select-export"
            >
              <CardContent className="pt-6 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 mb-4">
                  <Download className="w-6 h-6 text-blue-600" />
                </div>
                <h3 className="font-semibold text-lg mb-2">Esportazione Dati</h3>
                <p className="text-sm text-gray-600">
                  Richiedi una copia di tutti i tuoi dati personali (Art. 20 GDPR - Portabilità)
                </p>
              </CardContent>
            </Card>
          </div>
        ) : (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                {requestType === 'deletion' ? (
                  <Trash2 className="w-6 h-6 text-red-600" />
                ) : (
                  <Download className="w-6 h-6 text-blue-600" />
                )}
                <div>
                  <CardTitle>
                    {requestType === 'deletion' ? 'Richiesta Cancellazione Dati' : 'Richiesta Esportazione Dati'}
                  </CardTitle>
                  <CardDescription>
                    Compila il form per procedere con la richiesta
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="nome">Nome</Label>
                    <Input
                      id="nome"
                      value={formData.nome}
                      onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                      placeholder="Il tuo nome"
                      data-testid="gdpr-input-nome"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cognome">Cognome</Label>
                    <Input
                      id="cognome"
                      value={formData.cognome}
                      onChange={(e) => setFormData({ ...formData, cognome: e.target.value })}
                      placeholder="Il tuo cognome"
                      data-testid="gdpr-input-cognome"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="La tua email (utilizzata per registrarti o prenotare)"
                    required
                    data-testid="gdpr-input-email"
                  />
                  <p className="text-xs text-gray-500">
                    Inserisci l'email con cui ti sei registrato o hai effettuato prenotazioni
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="telefono">Telefono (opzionale)</Label>
                  <Input
                    id="telefono"
                    value={formData.telefono}
                    onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                    placeholder="Il tuo numero di telefono"
                    data-testid="gdpr-input-telefono"
                  />
                </div>

                {requestType === 'deletion' && (
                  <div className="space-y-2">
                    <Label htmlFor="motivo">Motivo della richiesta (opzionale)</Label>
                    <Textarea
                      id="motivo"
                      value={formData.motivo}
                      onChange={(e) => setFormData({ ...formData, motivo: e.target.value })}
                      placeholder="Puoi indicare il motivo della tua richiesta..."
                      rows={3}
                      data-testid="gdpr-input-motivo"
                    />
                  </div>
                )}

                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-amber-800">
                    <p className="font-medium">Importante</p>
                    <p>
                      {requestType === 'deletion' 
                        ? 'La cancellazione dei dati è irreversibile. Potremmo contattarti per verificare la tua identità prima di procedere.'
                        : 'Riceverai i tuoi dati in formato elettronico entro 30 giorni dalla verifica della richiesta.'}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setRequestType(null)}
                    className="w-full sm:w-auto"
                    data-testid="gdpr-back-btn"
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Indietro
                  </Button>
                  <Button
                    type="submit"
                    disabled={isSubmitting || !formData.email}
                    className={`w-full sm:flex-1 ${requestType === 'deletion' ? 'bg-red-600 hover:bg-red-700' : 'bg-sage hover:bg-sage/90'}`}
                    data-testid="gdpr-submit-btn"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Invio in corso...
                      </>
                    ) : (
                      <>
                        {requestType === 'deletion' ? <Trash2 className="w-4 h-4 mr-2" /> : <Download className="w-4 h-4 mr-2" />}
                        Invia Richiesta
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <div className="mt-8 text-center text-sm text-gray-500">
          <p>
            Per qualsiasi domanda, contattaci a:{' '}
            <a href="mailto:image.studio.fotografico@gmail.com" className="text-sage hover:underline">
              image.studio.fotografico@gmail.com
            </a>
          </p>
          <p className="mt-2">
            <Link href={createUrl('/privacy')} className="text-sage hover:underline">Privacy Policy</Link>
            {' • '}
            <Link href={createUrl('/cookie-policy')} className="text-sage hover:underline">Cookie Policy</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
