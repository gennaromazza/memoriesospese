import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { getAuth } from "firebase/auth";
import { 
  Search,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ArrowLeft,
  ShieldAlert,
  Database,
  RefreshCw,
  XCircle,
  Info,
  Clock,
  FileWarning
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface AuditIssue {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  category: 'security' | 'data-integrity' | 'consistency' | 'performance';
  title: string;
  description: string;
  affectedCollection?: string;
  affectedDocId?: string;
  suggestedFix?: string;
}

interface AuditResult {
  success: boolean;
  timestamp: string;
  durationMs: number;
  totalIssues: number;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  issues: AuditIssue[];
}

export default function AuditSystem() {
  const isAdmin = useIsAdmin();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(false);
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Accesso Negato</AlertTitle>
              <AlertDescription>
                Solo gli amministratori possono accedere a questa pagina.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getAuthHeaders = async () => {
    const auth = getAuth();
    const token = await auth.currentUser?.getIdToken();
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  };

  const runFullAudit = async () => {
    setIsLoading(true);
    setAuditResult(null);
    
    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/audit/full', { headers });
      
      if (!response.ok) {
        throw new Error('Errore durante l\'audit');
      }
      
      const result: AuditResult = await response.json();
      setAuditResult(result);
      
      if (result.criticalCount > 0) {
        toast({
          variant: "destructive",
          title: "Problemi critici trovati",
          description: `${result.criticalCount} problemi critici richiedono attenzione immediata`,
        });
      } else if (result.warningCount > 0) {
        toast({
          title: "Audit completato",
          description: `${result.warningCount} avvisi trovati, nessun problema critico`,
        });
      } else {
        toast({
          title: "Sistema OK",
          description: "Nessun problema trovato durante l'audit",
        });
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Errore",
        description: error.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const runDataIntegrityAudit = async () => {
    setIsLoading(true);
    setAuditResult(null);
    
    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/audit/data-integrity', { headers });
      
      if (!response.ok) {
        throw new Error('Errore durante l\'audit');
      }
      
      const result: AuditResult = await response.json();
      setAuditResult(result);
      
      toast({
        title: "Audit integrità dati completato",
        description: `${result.totalIssues} problemi trovati`,
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Errore",
        description: error.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const runConsistencyAudit = async () => {
    setIsLoading(true);
    setAuditResult(null);
    
    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/audit/consistency', { headers });
      
      if (!response.ok) {
        throw new Error('Errore durante l\'audit');
      }
      
      const result: AuditResult = await response.json();
      setAuditResult(result);
      
      toast({
        title: "Audit consistenza completato",
        description: `${result.totalIssues} problemi trovati`,
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Errore",
        description: error.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <XCircle className="h-5 w-5 text-destructive" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case 'info':
        return <Info className="h-5 w-5 text-blue-500" />;
      default:
        return null;
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <Badge variant="destructive">Critico</Badge>;
      case 'warning':
        return <Badge className="bg-yellow-500">Avviso</Badge>;
      case 'info':
        return <Badge variant="secondary">Info</Badge>;
      default:
        return null;
    }
  };

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'security':
        return 'Sicurezza';
      case 'data-integrity':
        return 'Integrità Dati';
      case 'consistency':
        return 'Consistenza';
      case 'performance':
        return 'Performance';
      default:
        return category;
    }
  };

  const filteredIssues = auditResult?.issues.filter(issue => 
    selectedCategory === 'all' || issue.category === selectedCategory
  ) || [];

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-8 px-4 max-w-6xl">
        <div className="flex items-center gap-4 mb-8">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => navigate('/admin/dashboard')}
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Audit Sistema</h1>
            <p className="text-muted-foreground">
              Verifica integrità, sicurezza e consistenza del sistema
            </p>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3 mb-8">
          <Card className="cursor-pointer hover:border-primary transition-colors" onClick={runFullAudit}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Search className="h-5 w-5" />
                Audit Completo
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Esegue tutti i controlli di sicurezza, integrità e consistenza
              </p>
            </CardContent>
            <CardFooter>
              <Button 
                className="w-full" 
                disabled={isLoading}
                data-testid="button-full-audit"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Search className="h-4 w-4 mr-2" />
                )}
                Avvia Audit Completo
              </Button>
            </CardFooter>
          </Card>

          <Card className="cursor-pointer hover:border-primary transition-colors" onClick={runDataIntegrityAudit}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Database className="h-5 w-5" />
                Integrità Dati
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Verifica riferimenti orfani e campi mancanti
              </p>
            </CardContent>
            <CardFooter>
              <Button 
                variant="outline"
                className="w-full" 
                disabled={isLoading}
                data-testid="button-data-audit"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Database className="h-4 w-4 mr-2" />
                )}
                Verifica Integrità
              </Button>
            </CardFooter>
          </Card>

          <Card className="cursor-pointer hover:border-primary transition-colors" onClick={runConsistencyAudit}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <RefreshCw className="h-5 w-5" />
                Consistenza Stati
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Verifica workflow e stati ordini/preventivi
              </p>
            </CardContent>
            <CardFooter>
              <Button 
                variant="outline"
                className="w-full" 
                disabled={isLoading}
                data-testid="button-consistency-audit"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Verifica Consistenza
              </Button>
            </CardFooter>
          </Card>
        </div>

        {isLoading && (
          <Card className="mb-8">
            <CardContent className="pt-6">
              <div className="flex items-center justify-center gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <div>
                  <p className="font-medium">Audit in corso...</p>
                  <p className="text-sm text-muted-foreground">Analisi di tutte le collezioni del database</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {auditResult && (
          <>
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {auditResult.criticalCount > 0 ? (
                    <XCircle className="h-6 w-6 text-destructive" />
                  ) : auditResult.warningCount > 0 ? (
                    <AlertTriangle className="h-6 w-6 text-yellow-500" />
                  ) : (
                    <CheckCircle2 className="h-6 w-6 text-green-500" />
                  )}
                  Risultato Audit
                </CardTitle>
                <CardDescription className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  {new Date(auditResult.timestamp).toLocaleString('it-IT')} - Completato in {auditResult.durationMs}ms
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-muted p-4 rounded-lg text-center">
                    <div className="text-3xl font-bold">{auditResult.totalIssues}</div>
                    <div className="text-sm text-muted-foreground">Problemi Totali</div>
                  </div>
                  <div className="bg-red-50 dark:bg-red-950 p-4 rounded-lg text-center">
                    <div className="text-3xl font-bold text-destructive">{auditResult.criticalCount}</div>
                    <div className="text-sm text-destructive">Critici</div>
                  </div>
                  <div className="bg-yellow-50 dark:bg-yellow-950 p-4 rounded-lg text-center">
                    <div className="text-3xl font-bold text-yellow-600">{auditResult.warningCount}</div>
                    <div className="text-sm text-yellow-600">Avvisi</div>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg text-center">
                    <div className="text-3xl font-bold text-blue-600">{auditResult.infoCount}</div>
                    <div className="text-sm text-blue-600">Info</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {auditResult.totalIssues > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileWarning className="h-5 w-5" />
                    Problemi Rilevati
                  </CardTitle>
                  <div className="flex gap-2 mt-2">
                    <Button
                      variant={selectedCategory === 'all' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedCategory('all')}
                    >
                      Tutti ({auditResult.totalIssues})
                    </Button>
                    <Button
                      variant={selectedCategory === 'data-integrity' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedCategory('data-integrity')}
                    >
                      Integrità
                    </Button>
                    <Button
                      variant={selectedCategory === 'consistency' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedCategory('consistency')}
                    >
                      Consistenza
                    </Button>
                    <Button
                      variant={selectedCategory === 'security' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedCategory('security')}
                    >
                      Sicurezza
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[500px]">
                    <Accordion type="single" collapsible className="w-full">
                      {filteredIssues.map((issue, index) => (
                        <AccordionItem key={issue.id} value={issue.id}>
                          <AccordionTrigger className="hover:no-underline">
                            <div className="flex items-center gap-3 text-left">
                              {getSeverityIcon(issue.severity)}
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">{issue.title}</span>
                                  {getSeverityBadge(issue.severity)}
                                  <Badge variant="outline">{getCategoryLabel(issue.category)}</Badge>
                                </div>
                              </div>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="pl-8 space-y-3">
                              <p className="text-muted-foreground">{issue.description}</p>
                              
                              {issue.affectedCollection && (
                                <div className="flex gap-2 text-sm">
                                  <span className="font-medium">Collezione:</span>
                                  <code className="bg-muted px-2 py-0.5 rounded">{issue.affectedCollection}</code>
                                </div>
                              )}
                              
                              {issue.affectedDocId && (
                                <div className="flex gap-2 text-sm">
                                  <span className="font-medium">Documento:</span>
                                  <code className="bg-muted px-2 py-0.5 rounded">{issue.affectedDocId}</code>
                                </div>
                              )}
                              
                              {issue.suggestedFix && (
                                <Alert>
                                  <Info className="h-4 w-4" />
                                  <AlertTitle>Suggerimento</AlertTitle>
                                  <AlertDescription>{issue.suggestedFix}</AlertDescription>
                                </Alert>
                              )}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}

            {auditResult.totalIssues === 0 && (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center py-8">
                    <CheckCircle2 className="h-16 w-16 mx-auto mb-4 text-green-500" />
                    <h3 className="text-xl font-semibold mb-2">Sistema in salute!</h3>
                    <p className="text-muted-foreground">
                      Nessun problema rilevato durante l'audit del sistema.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
