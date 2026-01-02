import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { getAuth } from "firebase/auth";
import { 
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ArrowLeft,
  CreditCard,
  FileText,
  Calendar,
  ExternalLink,
  RefreshCw,
  Download,
  Filter
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface DiscrepancyReport {
  jobId: string;
  jobSource: 'import' | 'new' | 'unknown';
  clientName: string;
  clientEmail: string;
  eventDate: string | null;
  quoteIds: string[];
  quoteTotale: number;
  quoteCount: number;
  signedQuoteCount: number;
  scheduleId: string | null;
  scheduleTotale: number;
  scheduleTotalePagato: number;
  scheduleSaldoResiduo: number;
  scheduleRateCount: number;
  scheduleRatePagate: number;
  sumOfRates: number;
  discrepancy: number;
  discrepancyType: 'quote_vs_schedule' | 'schedule_vs_rates' | 'both' | 'none';
  issues: string[];
}

interface AuditStats {
  totalJobs: number;
  jobsWithDiscrepancies: number;
  importedJobsWithIssues: number;
  newJobsWithIssues: number;
  totalDiscrepancyAmount: number;
  byType: {
    quote_vs_schedule: number;
    schedule_vs_rates: number;
    both: number;
  };
}

interface AuditResult {
  success: boolean;
  stats: AuditStats;
  reports: DiscrepancyReport[];
}

export default function PaymentDiscrepanciesAudit() {
  const isAdmin = useIsAdmin();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

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

  const runAudit = async () => {
    setIsLoading(true);
    setResult(null);
    
    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/audit/payment-discrepancies', { headers });
      
      if (!response.ok) {
        throw new Error('Errore durante l\'audit');
      }
      
      const data: AuditResult = await response.json();
      setResult(data);
      
      toast({
        title: "Analisi completata",
        description: `Trovati ${data.stats.jobsWithDiscrepancies} job con discrepanze`,
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

  const filteredReports = result?.reports.filter(r => {
    if (sourceFilter !== 'all' && r.jobSource !== sourceFilter) return false;
    if (typeFilter !== 'all' && r.discrepancyType !== typeFilter) return false;
    return true;
  }) || [];

  const exportCSV = () => {
    if (!filteredReports.length) return;
    
    const headers = ['Job ID', 'Origine', 'Cliente', 'Data Evento', 'Totale Preventivo', 'Totale Piano', 'Pagato', 'Residuo', 'Discrepanza', 'Tipo', 'Problemi'];
    const rows = filteredReports.map(r => [
      r.jobId,
      r.jobSource,
      r.clientName,
      r.eventDate || '',
      r.quoteTotale.toFixed(2),
      r.scheduleTotale.toFixed(2),
      r.scheduleTotalePagato.toFixed(2),
      r.scheduleSaldoResiduo.toFixed(2),
      r.discrepancy.toFixed(2),
      r.discrepancyType,
      r.issues.join(' | ')
    ]);
    
    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `discrepanze-pagamenti-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-6 px-4 max-w-7xl">
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/admin')}
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Audit Discrepanze Pagamenti</h1>
            <p className="text-muted-foreground">
              Analizza differenze tra preventivi e piani pagamenti
            </p>
          </div>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Analisi Pagamenti
            </CardTitle>
            <CardDescription>
              Confronta il totale dei preventivi firmati con il totale dei piani pagamenti per ogni job.
              Identifica discrepanze tra job importati dal vecchio gestionale e nuovi job.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={runAudit} 
              disabled={isLoading}
              data-testid="button-run-audit"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Analisi in corso...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Esegui Analisi
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {result && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <Card>
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold">{result.stats.totalJobs}</div>
                  <div className="text-sm text-muted-foreground">Job Totali</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold text-destructive">
                    {result.stats.jobsWithDiscrepancies}
                  </div>
                  <div className="text-sm text-muted-foreground">Con Discrepanze</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold text-orange-500">
                    {result.stats.importedJobsWithIssues}
                  </div>
                  <div className="text-sm text-muted-foreground">Importati</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold text-blue-500">
                    {result.stats.newJobsWithIssues}
                  </div>
                  <div className="text-sm text-muted-foreground">Nuovi</div>
                </CardContent>
              </Card>
            </div>

            <Card className="mb-6">
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <CardTitle>
                    Risultati ({filteredReports.length} job)
                  </CardTitle>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Select value={sourceFilter} onValueChange={setSourceFilter}>
                      <SelectTrigger className="w-[140px]" data-testid="select-source-filter">
                        <Filter className="h-4 w-4 mr-2" />
                        <SelectValue placeholder="Origine" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tutti</SelectItem>
                        <SelectItem value="import">Importati</SelectItem>
                        <SelectItem value="new">Nuovi</SelectItem>
                        <SelectItem value="unknown">Sconosciuto</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={typeFilter} onValueChange={setTypeFilter}>
                      <SelectTrigger className="w-[180px]" data-testid="select-type-filter">
                        <SelectValue placeholder="Tipo discrepanza" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tutti i tipi</SelectItem>
                        <SelectItem value="quote_vs_schedule">Preventivo vs Piano</SelectItem>
                        <SelectItem value="schedule_vs_rates">Piano vs Rate</SelectItem>
                        <SelectItem value="both">Entrambi</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button 
                      variant="outline" 
                      onClick={exportCSV}
                      disabled={!filteredReports.length}
                      data-testid="button-export-csv"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Esporta CSV
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[600px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Origine</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead className="text-right">Preventivo</TableHead>
                        <TableHead className="text-right">Piano</TableHead>
                        <TableHead className="text-right">Pagato</TableHead>
                        <TableHead className="text-right">Residuo</TableHead>
                        <TableHead>Problemi</TableHead>
                        <TableHead>Azioni</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredReports.map((report) => (
                        <TableRow key={report.jobId}>
                          <TableCell>
                            <div className="font-medium">{report.clientName}</div>
                            <div className="text-xs text-muted-foreground truncate max-w-[150px]">
                              {report.clientEmail}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={report.jobSource === 'import' ? 'secondary' : 'default'}>
                              {report.jobSource === 'import' ? 'Importato' : 
                               report.jobSource === 'new' ? 'Nuovo' : '?'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {report.eventDate ? (
                              <div className="flex items-center gap-1 text-sm">
                                <Calendar className="h-3 w-3" />
                                {report.eventDate}
                              </div>
                            ) : '-'}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            €{report.quoteTotale.toFixed(2)}
                            {report.signedQuoteCount > 0 && (
                              <Badge variant="outline" className="ml-1 text-xs">
                                {report.signedQuoteCount} firmati
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            €{report.scheduleTotale.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-green-600">
                            €{report.scheduleTotalePagato.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-orange-600">
                            €{report.scheduleSaldoResiduo.toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1 max-w-[250px]">
                              {report.issues.map((issue, i) => (
                                <div key={i} className="text-xs text-destructive flex items-start gap-1">
                                  <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                                  {issue}
                                </div>
                              ))}
                              {report.issues.length === 0 && (
                                <div className="text-xs text-green-600 flex items-center gap-1">
                                  <CheckCircle2 className="h-3 w-3" />
                                  Nessun problema
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => navigate(`/admin/jobs/${report.jobId}`)}
                              data-testid={`button-view-job-${report.jobId}`}
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {filteredReports.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                            {result.stats.jobsWithDiscrepancies === 0 
                              ? 'Nessuna discrepanza trovata - tutti i job sono allineati!'
                              : 'Nessun risultato con i filtri selezionati'}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>

            {result.stats.jobsWithDiscrepancies > 0 && (
              <Alert>
                <FileText className="h-4 w-4" />
                <AlertTitle>Riepilogo Discrepanze</AlertTitle>
                <AlertDescription>
                  <ul className="mt-2 space-y-1 text-sm">
                    <li>• <strong>{result.stats.byType.quote_vs_schedule}</strong> job con differenza tra preventivo e piano pagamenti</li>
                    <li>• <strong>{result.stats.byType.schedule_vs_rates}</strong> job con differenza tra totale piano e somma rate</li>
                    <li>• <strong>{result.stats.byType.both}</strong> job con entrambi i problemi</li>
                    <li>• Totale discrepanze: <strong>€{result.stats.totalDiscrepancyAmount.toFixed(2)}</strong></li>
                  </ul>
                </AlertDescription>
              </Alert>
            )}
          </>
        )}
      </div>
    </div>
  );
}
