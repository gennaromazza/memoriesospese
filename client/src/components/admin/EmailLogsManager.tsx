import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Mail, CheckCircle, XCircle, Clock, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { auth } from "@/lib/firebase";

interface EmailLog {
  id: string;
  to: string | string[];
  subject: string;
  type: string;
  status: 'sent' | 'failed';
  sentAt: string | null;
  clientName?: string;
  relatedDocId?: string;
  relatedDocType?: string;
  errorMessage?: string;
}

interface EmailStats {
  last24h: number;
  last7d: number;
  total: number;
  failed: number;
}

const EMAIL_TYPE_LABELS: Record<string, string> = {
  'booking_confirmation': 'Conferma Prenotazione',
  'booking_reminder': 'Promemoria Prenotazione',
  'quote_sent': 'Preventivo Inviato',
  'quote_signed': 'Preventivo Firmato',
  'payment_reminder': 'Promemoria Pagamento',
  'payment_received': 'Pagamento Ricevuto',
  'gallery_pin': 'PIN Galleria',
  'gallery_photos': 'Nuove Foto Galleria',
  'selection_reminder': 'Promemoria Selezione',
  'selection_completed': 'Selezione Completata',
  'consultation_confirmation': 'Conferma Consulenza',
  'consultation_reminder': 'Promemoria Consulenza',
  'collaborator_assignment': 'Assegnazione Collaboratore',
  'order_confirmation': 'Conferma Ordine',
  'order_ready': 'Ordine Pronto',
  'bulk_email': 'Email Massiva',
  'test': 'Email di Test',
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'N/A';
  const date = new Date(dateStr);
  return date.toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatRecipients(to: string | string[]): string {
  if (Array.isArray(to)) {
    return to.length > 1 ? `${to[0]} (+${to.length - 1})` : to[0];
  }
  return to;
}

export default function EmailLogsManager() {
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  // Fetch email stats
  const { data: statsData, isLoading: isLoadingStats } = useQuery({
    queryKey: ['/api/email/logs/stats'],
    queryFn: async () => {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/email/logs/stats', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch stats');
      return res.json();
    },
    staleTime: 60000, // 1 minuto
  });

  // Fetch email logs
  const { data: logsData, isLoading: isLoadingLogs, refetch } = useQuery({
    queryKey: ['/api/email/logs', typeFilter],
    queryFn: async () => {
      const token = await auth.currentUser?.getIdToken();
      const url = typeFilter === 'all' 
        ? '/api/email/logs?limit=100'
        : `/api/email/logs?limit=100&type=${typeFilter}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch logs');
      return res.json();
    },
    staleTime: 30000, // 30 secondi
  });

  const stats: EmailStats = statsData?.stats || { last24h: 0, last7d: 0, total: 0, failed: 0 };
  const logs: EmailLog[] = logsData?.logs || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Storico Email</h2>
          <p className="text-sm text-gray-500">Monitora tutte le email inviate dal sistema</p>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => refetch()}
          className="gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Aggiorna
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-500" />
              <div>
                <div className="text-2xl font-bold">
                  {isLoadingStats ? <Skeleton className="h-8 w-12" /> : stats.last24h}
                </div>
                <p className="text-xs text-gray-500">Ultime 24h</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-green-500" />
              <div>
                <div className="text-2xl font-bold">
                  {isLoadingStats ? <Skeleton className="h-8 w-12" /> : stats.last7d}
                </div>
                <p className="text-xs text-gray-500">Ultimi 7 giorni</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-sage" />
              <div>
                <div className="text-2xl font-bold">
                  {isLoadingStats ? <Skeleton className="h-8 w-12" /> : stats.total}
                </div>
                <p className="text-xs text-gray-500">Totale inviate</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-500" />
              <div>
                <div className="text-2xl font-bold">
                  {isLoadingStats ? <Skeleton className="h-8 w-12" /> : stats.failed}
                </div>
                <p className="text-xs text-gray-500">Fallite</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[250px]">
            <SelectValue placeholder="Filtra per tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte le email</SelectItem>
            {Object.entries(EMAIL_TYPE_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <span className="text-sm text-gray-500">
          {logs.length} email trovate
        </span>
      </div>

      {/* Email Logs List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Email Recenti</CardTitle>
          <CardDescription>
            Ultime email inviate dal sistema
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingLogs ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Mail className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Nessuna email trovata</p>
              <p className="text-sm">Le email inviate appariranno qui</p>
            </div>
          ) : (
            <ScrollArea className="h-[500px]">
              <div className="space-y-2">
                {logs.map((log) => (
                  <div 
                    key={log.id}
                    className="border rounded-lg p-3 hover:bg-gray-50 transition-colors"
                  >
                    <div 
                      className="flex items-start justify-between cursor-pointer"
                      onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {log.status === 'sent' ? (
                            <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                          )}
                          <span className="font-medium text-sm truncate">
                            {log.subject}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <span className="truncate">{formatRecipients(log.to)}</span>
                          <span>•</span>
                          <span>{formatDate(log.sentAt)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-2">
                        <Badge variant="outline" className="text-xs whitespace-nowrap">
                          {EMAIL_TYPE_LABELS[log.type] || log.type}
                        </Badge>
                        {expandedLog === log.id ? (
                          <ChevronUp className="h-4 w-4 text-gray-400" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-gray-400" />
                        )}
                      </div>
                    </div>
                    
                    {expandedLog === log.id && (
                      <div className="mt-3 pt-3 border-t text-sm space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <span className="text-gray-500">Destinatari:</span>
                            <p className="font-medium">
                              {Array.isArray(log.to) ? log.to.join(', ') : log.to}
                            </p>
                          </div>
                          {log.clientName && (
                            <div>
                              <span className="text-gray-500">Cliente:</span>
                              <p className="font-medium">{log.clientName}</p>
                            </div>
                          )}
                          {log.relatedDocType && log.relatedDocId && (
                            <div>
                              <span className="text-gray-500">Riferimento:</span>
                              <p className="font-medium">{log.relatedDocType}: {log.relatedDocId.substring(0, 8)}...</p>
                            </div>
                          )}
                          <div>
                            <span className="text-gray-500">Stato:</span>
                            <p className={`font-medium ${log.status === 'sent' ? 'text-green-600' : 'text-red-600'}`}>
                              {log.status === 'sent' ? 'Inviata' : 'Fallita'}
                            </p>
                          </div>
                        </div>
                        {log.errorMessage && (
                          <div className="bg-red-50 text-red-700 p-2 rounded text-xs">
                            <strong>Errore:</strong> {log.errorMessage}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Info about email tracking */}
      <div className="text-xs text-gray-400 text-center">
        <p>Le email vengono tracciate automaticamente dal sistema.</p>
        <p>Il tracciamento della lettura non è disponibile per motivi di privacy.</p>
      </div>
    </div>
  );
}
