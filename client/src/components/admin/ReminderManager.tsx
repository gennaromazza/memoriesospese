import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Bell, Send, RefreshCw, CheckCircle, Clock, AlertCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface ReminderStatus {
  success: boolean;
  timestamp: string;
  bookings: {
    total: number;
    withReminder: number;
    pending: number;
    list: Array<{
      id: string;
      cliente: string;
      email: string;
      data: string;
      reminderSent: boolean;
      reminderSentAt?: string;
    }>;
  };
  consultations: {
    total: number;
    withReminder: number;
    pending: number;
    list: Array<{
      id: string;
      cliente: string;
      email: string;
      jobType: string;
      data: string;
      reminderSent: boolean;
      reminderSentAt?: string;
    }>;
  };
}

interface SendRemindersResult {
  success: boolean;
  message: string;
  timestamp: string;
  results: {
    bookings: { checked: number; sent: number; skipped: number; errors: string[] };
    consultations: { checked: number; sent: number; skipped: number; errors: string[] };
  };
}

export default function ReminderManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [lastSendResult, setLastSendResult] = useState<SendRemindersResult | null>(null);

  const { data: status, isLoading, refetch, isFetching } = useQuery<ReminderStatus>({
    queryKey: ['/api/reminders/status'],
    refetchInterval: 60000,
  });

  const sendRemindersMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('/api/reminders/send-all', {
        method: 'POST',
      });
      return response as SendRemindersResult;
    },
    onSuccess: (data) => {
      setLastSendResult(data);
      queryClient.invalidateQueries({ queryKey: ['/api/reminders/status'] });
      
      const totalSent = data.results.bookings.sent + data.results.consultations.sent;
      const totalErrors = data.results.bookings.errors.length + data.results.consultations.errors.length;
      
      if (totalSent > 0 && totalErrors === 0) {
        toast({
          title: "✅ Reminder inviati!",
          description: `${totalSent} reminder inviati con successo.`,
        });
      } else if (totalSent > 0 && totalErrors > 0) {
        toast({
          title: "⚠️ Reminder inviati con errori",
          description: `${totalSent} inviati, ${totalErrors} errori.`,
          variant: "destructive",
        });
      } else if (totalSent === 0 && totalErrors === 0) {
        toast({
          title: "ℹ️ Nessun reminder da inviare",
          description: "Nessun appuntamento richiede reminder in questo momento.",
        });
      } else {
        toast({
          title: "❌ Errore invio reminder",
          description: `${totalErrors} errori durante l'invio.`,
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "❌ Errore",
        description: error.message || "Errore durante l'invio dei reminder",
        variant: "destructive",
      });
    },
  });

  const formatDate = (dateString: string) => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    return date.toLocaleString("it-IT", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const totalPending = (status?.bookings.pending || 0) + (status?.consultations.pending || 0);
  const totalWithReminder = (status?.bookings.withReminder || 0) + (status?.consultations.withReminder || 0);

  return (
    <Card className="border-sage/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-sage" />
            <CardTitle className="text-lg">Reminder Appuntamenti</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <CardDescription>
          Invia email promemoria 24h prima di shooting e consulenze
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="text-center py-4 text-gray-500">
            Caricamento stato reminder...
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-4 h-4 text-blue-600" />
                  <span className="font-medium text-blue-800 text-sm">Prossime 48h</span>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-blue-700">Shooting:</span>
                    <span className="font-semibold text-blue-900">{status?.bookings.total || 0}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-blue-700">Consulenze:</span>
                    <span className="font-semibold text-blue-900">{status?.consultations.total || 0}</span>
                  </div>
                </div>
              </div>
              
              <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  <span className="font-medium text-amber-800 text-sm">Da inviare</span>
                </div>
                <div className="text-2xl font-bold text-amber-900">
                  {totalPending}
                </div>
                <p className="text-xs text-amber-700">
                  reminder in attesa
                </p>
              </div>
            </div>

            {totalWithReminder > 0 && (
              <div className="flex items-center gap-2 text-sm text-sage">
                <CheckCircle className="w-4 h-4" />
                <span>{totalWithReminder} reminder già inviati</span>
              </div>
            )}

            <Button
              onClick={() => sendRemindersMutation.mutate()}
              disabled={sendRemindersMutation.isPending}
              className="w-full bg-sage hover:bg-sage/90"
            >
              {sendRemindersMutation.isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Invio in corso...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Invia Reminder Ora
                </>
              )}
            </Button>

            {lastSendResult && (
              <div className="bg-gray-50 rounded-lg p-3 border text-sm space-y-2">
                <div className="font-medium text-gray-700">Ultimo invio:</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-gray-500">Shooting:</span>{" "}
                    <Badge variant="outline" className="ml-1">
                      {lastSendResult.results.bookings.sent} inviati
                    </Badge>
                  </div>
                  <div>
                    <span className="text-gray-500">Consulenze:</span>{" "}
                    <Badge variant="outline" className="ml-1">
                      {lastSendResult.results.consultations.sent} inviati
                    </Badge>
                  </div>
                </div>
                {(lastSendResult.results.bookings.errors.length > 0 || 
                  lastSendResult.results.consultations.errors.length > 0) && (
                  <div className="text-red-600 text-xs mt-2">
                    ⚠️ {lastSendResult.results.bookings.errors.length + 
                        lastSendResult.results.consultations.errors.length} errori
                  </div>
                )}
              </div>
            )}

            {(status?.bookings.list?.length || 0) > 0 && (
              <div className="mt-4">
                <h4 className="font-medium text-sm text-gray-700 mb-2">
                  📸 Shooting prossimi:
                </h4>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {status?.bookings.list.map((b) => (
                    <div 
                      key={b.id} 
                      className="flex items-center justify-between text-xs bg-white p-2 rounded border"
                    >
                      <div>
                        <span className="font-medium">{b.cliente}</span>
                        <span className="text-gray-500 ml-2">{formatDate(b.data)}</span>
                      </div>
                      {b.reminderSent ? (
                        <Badge variant="outline" className="bg-green-50 text-green-700 text-[10px]">
                          ✓ Inviato
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 text-[10px]">
                          In attesa
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(status?.consultations.list?.length || 0) > 0 && (
              <div className="mt-4">
                <h4 className="font-medium text-sm text-gray-700 mb-2">
                  🗓️ Consulenze prossime:
                </h4>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {status?.consultations.list.map((c) => (
                    <div 
                      key={c.id} 
                      className="flex items-center justify-between text-xs bg-white p-2 rounded border"
                    >
                      <div>
                        <span className="font-medium">{c.cliente}</span>
                        <span className="text-gray-500 ml-2">{c.jobType}</span>
                        <span className="text-gray-400 ml-2">{formatDate(c.data)}</span>
                      </div>
                      {c.reminderSent ? (
                        <Badge variant="outline" className="bg-green-50 text-green-700 text-[10px]">
                          ✓ Inviato
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 text-[10px]">
                          In attesa
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
