import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import {
  Search,
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle2,
  Wrench,
  Play,
  RefreshCw,
  Users,
  FileText,
  ShoppingCart,
  Image,
  ArrowLeft,
  Loader2,
  Download,
  ChevronDown
} from "lucide-react";
import {
  analyzeAllLegacyJobs,
  fixAllIssues,
  syncClientSourceRefs,
  type FullAnalysisReport,
  type JobAnalysisResult,
  type AnalysisIssue,
  type FullFixReport
} from "@/lib/legacyJobsAnalyzer";

const categoryLabels: Record<string, string> = {
  missing_client: "Cliente mancante",
  orphan_order: "Ordine orfano",
  orphan_quote: "Preventivo orfano",
  orphan_gallery: "Galleria orfana",
  client_sourceref_missing: "SourceRef cliente mancante",
  invalid_timestamp: "Timestamp non valido",
  missing_field: "Campo mancante",
  financial_mismatch: "Dati finanziari incoerenti",
  duplicate_reference: "Riferimento duplicato",
  invalid_status: "Status non valido",
  order_jobid_mismatch: "JobId ordine errato",
  quote_jobid_mismatch: "JobId preventivo errato",
  gallery_jobid_mismatch: "JobId galleria errato"
};

const categoryIcons: Record<string, any> = {
  missing_client: Users,
  orphan_order: ShoppingCart,
  orphan_quote: FileText,
  orphan_gallery: Image,
  client_sourceref_missing: Users,
  invalid_timestamp: AlertCircle,
  missing_field: AlertTriangle,
  financial_mismatch: AlertTriangle,
  duplicate_reference: AlertCircle,
  invalid_status: AlertTriangle,
  order_jobid_mismatch: ShoppingCart,
  quote_jobid_mismatch: FileText,
  gallery_jobid_mismatch: Image
};

function IssueTypeBadge({ type }: { type: 'error' | 'warning' | 'info' }) {
  if (type === 'error') {
    return <Badge variant="destructive" className="text-xs">Errore</Badge>;
  }
  if (type === 'warning') {
    return <Badge variant="outline" className="text-xs border-yellow-500 text-yellow-700">Avviso</Badge>;
  }
  return <Badge variant="secondary" className="text-xs">Info</Badge>;
}

function IssueIcon({ type }: { type: 'error' | 'warning' | 'info' }) {
  if (type === 'error') {
    return <AlertCircle className="h-4 w-4 text-red-500" />;
  }
  if (type === 'warning') {
    return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
  }
  return <Info className="h-4 w-4 text-blue-500" />;
}

export default function AdminLegacyJobsAnalyzer() {
  const isAdmin = useIsAdmin();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, label: '' });
  const [report, setReport] = useState<FullAnalysisReport | null>(null);
  const [fixReport, setFixReport] = useState<FullFixReport | null>(null);
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set());
  const [filterType, setFilterType] = useState<'all' | 'errors' | 'warnings' | 'fixable'>('all');

  const handleAnalyze = useCallback(async () => {
    setIsAnalyzing(true);
    setReport(null);
    setFixReport(null);
    setSelectedJobIds(new Set());
    setProgress({ current: 0, total: 0, label: 'Avvio analisi...' });

    try {
      const result = await analyzeAllLegacyJobs((current, total, jobName) => {
        setProgress({ current, total, label: jobName });
      });
      
      setReport(result);
      
      toast({
        title: "Analisi completata",
        description: `Analizzati ${result.legacyJobsCount} jobs legacy, trovati ${result.totalIssues} problemi`
      });
    } catch (error: any) {
      toast({
        title: "Errore analisi",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsAnalyzing(false);
    }
  }, [toast]);

  const handleFixAll = useCallback(async () => {
    if (!report) return;

    setIsFixing(true);
    setProgress({ current: 0, total: 0, label: 'Applicazione fix...' });

    try {
      const result = await fixAllIssues(report, (current, total, jobName) => {
        setProgress({ current, total, label: jobName });
      });
      
      setFixReport(result);
      
      toast({
        title: "Fix completati",
        description: `${result.totalFixesApplied} fix applicati, ${result.totalFixesFailed} falliti`
      });

      if (result.totalFixesFailed === 0) {
        handleAnalyze();
      }
    } catch (error: any) {
      toast({
        title: "Errore fix",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsFixing(false);
    }
  }, [report, toast, handleAnalyze]);

  const handleSyncSourceRefs = useCallback(async () => {
    setIsSyncing(true);
    setProgress({ current: 0, total: 0, label: 'Sincronizzazione...' });

    try {
      const result = await syncClientSourceRefs((current, total) => {
        setProgress({ current, total, label: `Cliente ${current}/${total}` });
      });
      
      toast({
        title: "Sincronizzazione completata",
        description: `${result.updated} clienti aggiornati, ${result.errors} errori`
      });
    } catch (error: any) {
      toast({
        title: "Errore sincronizzazione",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsSyncing(false);
    }
  }, [toast]);

  const toggleJobSelection = (jobId: string) => {
    setSelectedJobIds(prev => {
      const next = new Set(prev);
      if (next.has(jobId)) {
        next.delete(jobId);
      } else {
        next.add(jobId);
      }
      return next;
    });
  };

  const selectAllWithIssues = () => {
    if (!report) return;
    const ids = new Set(report.results.filter(r => r.fixableCount > 0).map(r => r.jobId));
    setSelectedJobIds(ids);
  };

  const exportReport = () => {
    if (!report) return;
    
    const json = JSON.stringify(report, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `legacy-jobs-analysis-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredResults = report?.results.filter(r => {
    if (filterType === 'all') return true;
    if (filterType === 'errors') return r.issueCount.errors > 0;
    if (filterType === 'warnings') return r.issueCount.warnings > 0;
    if (filterType === 'fixable') return r.fixableCount > 0;
    return true;
  }) || [];

  if (!isAdmin) {
    return (
      <div className="max-w-7xl mx-auto py-6 px-4 text-center">
        <h1 className="text-2xl font-bold text-red-600">Accesso Negato</h1>
        <p className="mt-4">Solo gli amministratori possono accedere a questa pagina.</p>
        <Button onClick={() => navigate("/admin")} className="mt-4" data-testid="button-go-admin">
          Vai alla Dashboard Admin
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto py-6 px-4">
      <div className="flex items-center gap-4 mb-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/admin")}
          data-testid="button-back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Analisi Jobs Legacy</h1>
          <p className="text-muted-foreground">
            Verifica integrità jobs importati dal vecchio gestionale
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3 mb-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Search className="h-4 w-4" />
              Analizza
            </CardTitle>
            <CardDescription>
              Scansiona tutti i jobs legacy per trovare problemi
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button
              onClick={handleAnalyze}
              disabled={isAnalyzing || isFixing}
              className="w-full"
              data-testid="button-analyze"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Analizzando...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Avvia Analisi
                </>
              )}
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Wrench className="h-4 w-4" />
              Fix Automatici
            </CardTitle>
            <CardDescription>
              Correggi automaticamente i problemi risolvibili
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button
              onClick={handleFixAll}
              disabled={!report || report.fixableIssues === 0 || isFixing || isAnalyzing}
              variant="outline"
              className="w-full"
              data-testid="button-fix-all"
            >
              {isFixing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Correggendo...
                </>
              ) : (
                <>
                  <Wrench className="h-4 w-4 mr-2" />
                  Fix Tutti ({report?.fixableIssues || 0})
                </>
              )}
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <RefreshCw className="h-4 w-4" />
              Sync SourceRefs
            </CardTitle>
            <CardDescription>
              Sincronizza jobIds nei clienti con jobs effettivi
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button
              onClick={handleSyncSourceRefs}
              disabled={isSyncing || isAnalyzing || isFixing}
              variant="outline"
              className="w-full"
              data-testid="button-sync"
            >
              {isSyncing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sincronizzando...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Sincronizza Clienti
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      </div>

      {(isAnalyzing || isFixing || isSyncing) && (
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>{progress.label}</span>
                <span>{progress.current} / {progress.total}</span>
              </div>
              <Progress value={progress.total > 0 ? (progress.current / progress.total) * 100 : 0} />
            </div>
          </CardContent>
        </Card>
      )}

      {report && (
        <>
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Riepilogo Analisi</CardTitle>
                <Button variant="outline" size="sm" onClick={exportReport} data-testid="button-export">
                  <Download className="h-4 w-4 mr-2" />
                  Esporta JSON
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-3xl font-bold">{report.legacyJobsCount}</div>
                  <div className="text-sm text-muted-foreground">Jobs Legacy</div>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="text-3xl font-bold text-green-600">{report.jobsClean}</div>
                  <div className="text-sm text-muted-foreground">Senza Problemi</div>
                </div>
                <div className="text-center p-4 bg-red-50 rounded-lg">
                  <div className="text-3xl font-bold text-red-600">{report.jobsWithIssues}</div>
                  <div className="text-sm text-muted-foreground">Con Problemi</div>
                </div>
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <div className="text-3xl font-bold text-blue-600">{report.fixableIssues}</div>
                  <div className="text-sm text-muted-foreground">Risolvibili Auto</div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="flex items-center gap-2 p-3 border rounded-lg">
                  <AlertCircle className="h-5 w-5 text-red-500" />
                  <div>
                    <div className="font-semibold">{report.issuesByType.errors}</div>
                    <div className="text-xs text-muted-foreground">Errori</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-3 border rounded-lg">
                  <AlertTriangle className="h-5 w-5 text-yellow-500" />
                  <div>
                    <div className="font-semibold">{report.issuesByType.warnings}</div>
                    <div className="text-xs text-muted-foreground">Avvisi</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-3 border rounded-lg">
                  <Info className="h-5 w-5 text-blue-500" />
                  <div>
                    <div className="font-semibold">{report.issuesByType.info}</div>
                    <div className="text-xs text-muted-foreground">Info</div>
                  </div>
                </div>
              </div>

              {Object.keys(report.issuesByCategory).length > 0 && (
                <div>
                  <h4 className="font-medium mb-3">Problemi per Categoria</h4>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(report.issuesByCategory)
                      .sort((a, b) => b[1] - a[1])
                      .map(([category, count]) => {
                        const Icon = categoryIcons[category] || AlertCircle;
                        return (
                          <Badge key={category} variant="outline" className="text-xs py-1">
                            <Icon className="h-3 w-3 mr-1" />
                            {categoryLabels[category] || category}: {count}
                          </Badge>
                        );
                      })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {fixReport && (
            <Card className="mb-6 border-green-200 bg-green-50">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2 text-green-700">
                  <CheckCircle2 className="h-5 w-5" />
                  Report Fix Applicati
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold">{fixReport.totalJobsFixed}</div>
                    <div className="text-sm text-muted-foreground">Jobs Corretti</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">{fixReport.totalFixesApplied}</div>
                    <div className="text-sm text-muted-foreground">Fix Applicati</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-600">{fixReport.totalFixesFailed}</div>
                    <div className="text-sm text-muted-foreground">Fix Falliti</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-4">
                <CardTitle className="text-lg">Dettaglio Jobs ({filteredResults.length})</CardTitle>
                <div className="flex items-center gap-2">
                  <Button
                    variant={filterType === 'all' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFilterType('all')}
                    data-testid="filter-all"
                  >
                    Tutti
                  </Button>
                  <Button
                    variant={filterType === 'errors' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFilterType('errors')}
                    data-testid="filter-errors"
                  >
                    <AlertCircle className="h-3 w-3 mr-1" />
                    Errori
                  </Button>
                  <Button
                    variant={filterType === 'warnings' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFilterType('warnings')}
                    data-testid="filter-warnings"
                  >
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Avvisi
                  </Button>
                  <Button
                    variant={filterType === 'fixable' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFilterType('fixable')}
                    data-testid="filter-fixable"
                  >
                    <Wrench className="h-3 w-3 mr-1" />
                    Risolvibili
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px]">
                <Accordion type="multiple" className="space-y-2">
                  {filteredResults.map((result) => (
                    <AccordionItem
                      key={result.jobId}
                      value={result.jobId}
                      className="border rounded-lg px-4"
                    >
                      <AccordionTrigger className="hover:no-underline py-3">
                        <div className="flex items-center gap-3 flex-1 text-left">
                          <Checkbox
                            checked={selectedJobIds.has(result.jobId)}
                            onCheckedChange={() => toggleJobSelection(result.jobId)}
                            onClick={(e) => e.stopPropagation()}
                            data-testid={`checkbox-job-${result.jobId}`}
                          />
                          
                          {result.issues.length === 0 ? (
                            <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                          ) : result.issueCount.errors > 0 ? (
                            <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
                          ) : (
                            <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0" />
                          )}
                          
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{result.jobName}</div>
                            <div className="text-xs text-muted-foreground">
                              {result.eventDate?.toLocaleDateString('it-IT') || 'Data non disponibile'} • {result.status} • {result.jobSource}
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2 shrink-0">
                            {result.issueCount.errors > 0 && (
                              <Badge variant="destructive" className="text-xs">
                                {result.issueCount.errors} errori
                              </Badge>
                            )}
                            {result.issueCount.warnings > 0 && (
                              <Badge variant="outline" className="text-xs border-yellow-500 text-yellow-700">
                                {result.issueCount.warnings} avvisi
                              </Badge>
                            )}
                            {result.fixableCount > 0 && (
                              <Badge variant="secondary" className="text-xs">
                                <Wrench className="h-3 w-3 mr-1" />
                                {result.fixableCount}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </AccordionTrigger>
                      
                      <AccordionContent className="pb-4">
                        {result.issues.length === 0 ? (
                          <div className="text-center py-4 text-green-600">
                            <CheckCircle2 className="h-8 w-8 mx-auto mb-2" />
                            <p>Nessun problema rilevato</p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {result.issues.map((issue, idx) => (
                              <div
                                key={idx}
                                className={`p-3 rounded-lg border ${
                                  issue.type === 'error' ? 'bg-red-50 border-red-200' :
                                  issue.type === 'warning' ? 'bg-yellow-50 border-yellow-200' :
                                  'bg-blue-50 border-blue-200'
                                }`}
                              >
                                <div className="flex items-start gap-2">
                                  <IssueIcon type={issue.type} />
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                      <IssueTypeBadge type={issue.type} />
                                      <Badge variant="outline" className="text-xs">
                                        {categoryLabels[issue.category] || issue.category}
                                      </Badge>
                                      {issue.fixable && (
                                        <Badge variant="secondary" className="text-xs">
                                          <Wrench className="h-3 w-3 mr-1" />
                                          Auto-fix
                                        </Badge>
                                      )}
                                    </div>
                                    <p className="text-sm">{issue.message}</p>
                                    {issue.field && (
                                      <p className="text-xs text-muted-foreground mt-1">
                                        Campo: <code className="bg-muted px-1 rounded">{issue.field}</code>
                                      </p>
                                    )}
                                    {issue.fixDescription && (
                                      <p className="text-xs text-green-700 mt-1">
                                        Fix: {issue.fixDescription}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        
                        <div className="mt-4 flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate(`/admin/jobs/${result.jobId}`)}
                            data-testid={`button-view-job-${result.jobId}`}
                          >
                            Visualizza Job
                          </Button>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </ScrollArea>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
