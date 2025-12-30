import { useState } from "react";
import { useFirebaseAuth } from "@/context/FirebaseAuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Phone, RefreshCw, Play, CheckCircle, AlertCircle, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

interface SampleItem {
  id: string;
  field: string;
  from: string;
  to: string;
}

interface CollectionPreview {
  total: number;
  toUpdate: number;
  samples?: SampleItem[];
}

interface MigrationPreview {
  clienti: CollectionPreview;
  bookings: CollectionPreview;
  orders: CollectionPreview;
  jobs: CollectionPreview;
  consultations: CollectionPreview;
}

interface MigrationResult {
  success: boolean;
  results: {
    clienti: { updated: number; errors: number };
    bookings: { updated: number; errors: number };
    orders: { updated: number; errors: number };
    jobs: { updated: number; errors: number };
    consultations: { updated: number; errors: number };
  };
}

export default function PhoneMigrationPage() {
  const { user, isLoading: authLoading } = useFirebaseAuth();
  const { toast } = useToast();
  const [preview, setPreview] = useState<MigrationPreview | null>(null);
  const [migrationResult, setMigrationResult] = useState<MigrationResult | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);

  const ADMIN_EMAILS = ["gennaro.mazzacane@gmail.com"];
  const isAdmin = user?.email && ADMIN_EMAILS.includes(user.email);

  const loadPreview = async () => {
    if (!user) return;
    setIsLoadingPreview(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/admin/phone-migration-preview', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) {
        throw new Error('Errore nel caricamento anteprima');
      }
      
      const data = await response.json();
      setPreview(data);
      setMigrationResult(null);
      
      toast({
        title: "Anteprima caricata",
        description: "Controlla i numeri da formattare prima di procedere"
      });
    } catch (error) {
      console.error('Errore preview:', error);
      toast({
        title: "Errore",
        description: "Impossibile caricare l'anteprima",
        variant: "destructive"
      });
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const runMigration = async () => {
    if (!user) return;
    setIsMigrating(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/admin/migrate-phone-numbers', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error('Errore nella migrazione');
      }
      
      const data = await response.json();
      setMigrationResult(data);
      setPreview(null);
      
      const totalUpdated = Object.values(data.results).reduce((sum: number, r: any) => sum + r.updated, 0);
      
      toast({
        title: "Migrazione completata",
        description: `${totalUpdated} numeri formattati con successo`
      });
    } catch (error) {
      console.error('Errore migrazione:', error);
      toast({
        title: "Errore",
        description: "Impossibile completare la migrazione",
        variant: "destructive"
      });
    } finally {
      setIsMigrating(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sage-50 to-beige-50 flex items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-sage-600" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sage-50 to-beige-50 flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="text-red-600 flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Accesso Negato
            </CardTitle>
            <CardDescription>
              Solo gli amministratori possono accedere a questa pagina.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const getTotalToUpdate = () => {
    if (!preview) return 0;
    return preview.clienti.toUpdate + preview.bookings.toUpdate + 
           preview.orders.toUpdate + preview.jobs.toUpdate + preview.consultations.toUpdate;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-sage-50 to-beige-50 p-4 sm:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/admin" data-testid="link-back-dashboard">
            <Button variant="ghost" size="sm" data-testid="button-back-dashboard">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Torna al Dashboard
            </Button>
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              Migrazione Numeri Telefono
            </CardTitle>
            <CardDescription>
              Standardizza tutti i numeri di telefono nel database per la compatibilità WhatsApp.
              I numeri italiani verranno formattati con il prefisso +39.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-3">
              <Button 
                onClick={loadPreview} 
                disabled={isLoadingPreview}
                variant="outline"
                data-testid="button-load-preview"
              >
                {isLoadingPreview ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Carica Anteprima
              </Button>
              
              {preview && getTotalToUpdate() > 0 && (
                <Button 
                  onClick={runMigration} 
                  disabled={isMigrating}
                  className="bg-sage-600 hover:bg-sage-700"
                  data-testid="button-run-migration"
                >
                  {isMigrating ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4 mr-2" />
                  )}
                  Esegui Migrazione ({getTotalToUpdate()} numeri)
                </Button>
              )}
            </div>

            {preview && (
              <div className="space-y-4 mt-6">
                <h3 className="font-medium text-lg">Anteprima Modifiche</h3>
                
                {Object.entries(preview).map(([collection, data]) => (
                  <Card key={collection} className="bg-muted/30">
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm font-medium capitalize flex items-center justify-between">
                        <span>{collection}</span>
                        <span className="text-xs bg-sage-100 text-sage-700 px-2 py-1 rounded">
                          {data.toUpdate} / {data.total} da aggiornare
                        </span>
                      </CardTitle>
                    </CardHeader>
                    {data.samples && data.samples.length > 0 && (
                      <CardContent className="py-2">
                        <div className="text-xs space-y-1">
                          {data.samples.slice(0, 3).map((sample: SampleItem, i: number) => (
                            <div key={i} className="flex items-center gap-2 text-muted-foreground">
                              <span className="font-mono">{sample.from}</span>
                              <span>→</span>
                              <span className="font-mono text-sage-600">{sample.to}</span>
                              <span className="text-xs">({sample.field})</span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    )}
                  </Card>
                ))}

                {getTotalToUpdate() === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <CheckCircle className="h-12 w-12 mx-auto mb-3 text-green-500" />
                    <p>Tutti i numeri sono già formattati correttamente!</p>
                  </div>
                )}
              </div>
            )}

            {migrationResult && (
              <div className="space-y-4 mt-6">
                <h3 className="font-medium text-lg flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  Migrazione Completata
                </h3>
                
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  {Object.entries(migrationResult.results).map(([collection, result]) => (
                    <Card key={collection} className="bg-green-50 border-green-200">
                      <CardContent className="py-3 text-center">
                        <div className="text-2xl font-bold text-green-600">{result.updated}</div>
                        <div className="text-xs text-muted-foreground capitalize">{collection}</div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
