/**
 * REVIEW EMAIL MANAGER
 * Gestione campagna email recensioni Google:
 * - Invio bulk a tutti i job consegnati
 * - Log di tutte le email inviate in modale
 * - Tracking click (indica recensione probabilmente lasciata)
 * - Dedup: no reinvio se cliccato o < 30 giorni
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { auth } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Send,
  Star,
  MousePointerClick,
  Clock,
  RefreshCw,
  CheckCircle2,
  XCircle,
  SkipForward,
  List,
} from "lucide-react";
import { format, formatDistanceToNow, differenceInDays } from "date-fns";
import { it } from "date-fns/locale";

interface ReviewLog {
  id: string;
  recipientEmail: string;
  clienteName: string;
  firstSentAt: string | null;
  lastSentAt: string | null;
  sentCount: number;
  clicked: boolean;
  clickedAt: string | null;
  source: "auto" | "bulk" | "manual";
}

interface BulkResult {
  sent: number;
  skipped_clicked: number;
  skipped_recent: number;
  skipped_no_email: number;
  errors: number;
}

const RESEND_DAYS = 30;

function getStatusBadge(log: ReviewLog) {
  if (log.clicked) {
    return (
      <Badge className="bg-green-100 text-green-700 border-green-300 gap-1">
        <MousePointerClick className="h-3 w-3" />
        Link cliccato
      </Badge>
    );
  }

  const lastSent = log.lastSentAt ? new Date(log.lastSentAt) : null;
  if (!lastSent) return null;

  const daysSince = differenceInDays(new Date(), lastSent);
  const daysLeft = RESEND_DAYS - daysSince;

  if (daysLeft > 0) {
    return (
      <Badge className="bg-amber-100 text-amber-700 border-amber-300 gap-1">
        <Clock className="h-3 w-3" />
        Reinvio tra {daysLeft}gg
      </Badge>
    );
  }

  return (
    <Badge className="bg-blue-100 text-blue-700 border-blue-300 gap-1">
      <RefreshCw className="h-3 w-3" />
      Pronta per reinvio
    </Badge>
  );
}

export default function ReviewEmailManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [lastBulkResult, setLastBulkResult] = useState<BulkResult | null>(null);
  const [logModalOpen, setLogModalOpen] = useState(false);

  const { data: logData, isLoading: logLoading } = useQuery<{ logs: ReviewLog[] }>({
    queryKey: ["/api/email/review-request-log"],
    queryFn: async () => {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/email/review-request-log", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Errore caricamento log");
      return res.json();
    },
    staleTime: 30_000,
  });

  const logs = logData?.logs ?? [];

  const handleBulkSend = async () => {
    setConfirmOpen(false);
    setBulkLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/email/review-request-bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Errore invio");

      setLastBulkResult(data.results);
      queryClient.invalidateQueries({ queryKey: ["/api/email/review-request-log"] });

      toast({
        title: "Campagna recensioni completata",
        description: `${data.results.sent} inviate, ${data.results.skipped_clicked} gia' recensito, ${data.results.skipped_recent} inviate di recente`,
      });
    } catch (err: any) {
      toast({
        title: "Errore",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setBulkLoading(false);
    }
  };

  const pendingCount = logs.filter(
    (l) => !l.clicked && l.lastSentAt && differenceInDays(new Date(), new Date(l.lastSentAt)) >= RESEND_DAYS
  ).length;
  const clickedCount = logs.filter((l) => l.clicked).length;
  const recentCount = logs.filter(
    (l) => !l.clicked && l.lastSentAt && differenceInDays(new Date(), new Date(l.lastSentAt)) < RESEND_DAYS
  ).length;

  return (
    <div className="space-y-5 mt-6 pt-5 border-t border-gray-200">
      {/* Header + CTA */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Star className="h-4 w-4 text-amber-500" />
            <span className="font-semibold text-sm text-gray-800">Campagna Recensioni Google</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Invia l'email a tutti i clienti con lavori consegnati. Il sistema evita duplicati e traccia i click.
          </p>
        </div>
        <Button
          onClick={() => setConfirmOpen(true)}
          disabled={bulkLoading}
          className="bg-[#c4724a] hover:bg-[#b06040] text-white gap-2 shrink-0"
          size="sm"
        >
          {bulkLoading ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          {bulkLoading ? "Invio in corso..." : "Invia a tutti i Consegnati"}
        </Button>
      </div>

      {/* Stats chips + bottone storico */}
      <div className="flex flex-wrap items-center gap-2">
        {logs.length > 0 && (
          <>
            <span className="inline-flex items-center gap-1.5 text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">
              <Send className="h-3 w-3" />
              {logs.length} email totali
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs bg-green-100 text-green-700 px-2.5 py-1 rounded-full">
              <MousePointerClick className="h-3 w-3" />
              {clickedCount} link cliccati
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full">
              <Clock className="h-3 w-3" />
              {recentCount} inviate di recente
            </span>
            {pendingCount > 0 && (
              <span className="inline-flex items-center gap-1.5 text-xs bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full">
                <RefreshCw className="h-3 w-3" />
                {pendingCount} pronte per reinvio
              </span>
            )}
          </>
        )}
        <button
          onClick={() => setLogModalOpen(true)}
          className="inline-flex items-center gap-1.5 text-xs text-[#6b7f6b] hover:text-[#4a5e4a] font-medium underline underline-offset-2 transition-colors ml-auto"
        >
          <List className="h-3.5 w-3.5" />
          Storico email inviate ({logs.length})
        </button>
      </div>

      {/* Ultimo risultato bulk */}
      {lastBulkResult && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
          <p className="font-medium text-gray-700 mb-2">Risultato ultimo invio massivo:</p>
          <div className="flex flex-wrap gap-3">
            <span className="flex items-center gap-1 text-green-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {lastBulkResult.sent} inviate
            </span>
            <span className="flex items-center gap-1 text-gray-500">
              <MousePointerClick className="h-3.5 w-3.5" />
              {lastBulkResult.skipped_clicked} gia' recensito
            </span>
            <span className="flex items-center gap-1 text-amber-600">
              <Clock className="h-3.5 w-3.5" />
              {lastBulkResult.skipped_recent} inviate di recente
            </span>
            {lastBulkResult.skipped_no_email > 0 && (
              <span className="flex items-center gap-1 text-gray-400">
                <SkipForward className="h-3.5 w-3.5" />
                {lastBulkResult.skipped_no_email} senza email
              </span>
            )}
            {lastBulkResult.errors > 0 && (
              <span className="flex items-center gap-1 text-red-500">
                <XCircle className="h-3.5 w-3.5" />
                {lastBulkResult.errors} errori
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Modale storico ── */}
      <Dialog open={logModalOpen} onOpenChange={setLogModalOpen}>
        <DialogContent className="max-w-3xl w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Star className="h-4 w-4 text-amber-500" />
              Storico email recensioni ({logs.length})
            </DialogTitle>
          </DialogHeader>

          {/* Stats riepilogo dentro il modale */}
          {logs.length > 0 && (
            <div className="flex flex-wrap gap-2 pb-2 border-b border-gray-100">
              <span className="inline-flex items-center gap-1.5 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                <MousePointerClick className="h-3 w-3" />
                {clickedCount} cliccati
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                <Clock className="h-3 w-3" />
                {recentCount} recenti
              </span>
              {pendingCount > 0 && (
                <span className="inline-flex items-center gap-1.5 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                  <RefreshCw className="h-3 w-3" />
                  {pendingCount} da reinviare
                </span>
              )}
            </div>
          )}

          <div className="overflow-y-auto max-h-[60vh]">
            {logLoading ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />
                Caricamento...
              </div>
            ) : logs.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                Nessuna email di recensione inviata ancora.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="px-3 py-2.5 text-left font-medium text-gray-500">Cliente</th>
                      <th className="px-3 py-2.5 text-left font-medium text-gray-500">Email</th>
                      <th className="px-3 py-2.5 text-left font-medium text-gray-500">Primo invio</th>
                      <th className="px-3 py-2.5 text-left font-medium text-gray-500">Ultimo invio</th>
                      <th className="px-3 py-2.5 text-center font-medium text-gray-500">N.</th>
                      <th className="px-3 py-2.5 text-left font-medium text-gray-500">Stato</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log, idx) => (
                      <tr
                        key={log.id}
                        className={`border-b border-gray-100 last:border-0 ${
                          log.clicked
                            ? "bg-green-50/40"
                            : idx % 2 === 0
                            ? "bg-white"
                            : "bg-gray-50/50"
                        }`}
                      >
                        <td className="px-3 py-2.5 font-medium text-gray-700">
                          {log.clienteName || "—"}
                        </td>
                        <td className="px-3 py-2.5 text-gray-500">{log.recipientEmail}</td>
                        <td className="px-3 py-2.5 text-gray-500">
                          {log.firstSentAt
                            ? format(new Date(log.firstSentAt), "dd/MM/yyyy", { locale: it })
                            : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-gray-500">
                          {log.lastSentAt
                            ? `${format(new Date(log.lastSentAt), "dd/MM/yyyy", { locale: it })} (${formatDistanceToNow(new Date(log.lastSentAt), { locale: it, addSuffix: true })})`
                            : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-gray-200 text-gray-600 font-semibold text-xs">
                            {log.sentCount}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">{getStatusBadge(log)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Inviare email recensione a tutti i clienti?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                Il sistema inviera' l'email di richiesta recensione Google a tutti i clienti con lavori consegnati.
              </span>
              <span className="block text-sm font-medium text-gray-700 mt-2">
                Regole automatiche:
              </span>
              <ul className="text-sm space-y-1 list-none">
                <li className="flex items-center gap-2">
                  <MousePointerClick className="h-3.5 w-3.5 text-green-600 shrink-0" />
                  Saltati i clienti che hanno gia' cliccato il link (recensione lasciata)
                </li>
                <li className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                  Saltati i clienti che hanno ricevuto l'email negli ultimi 30 giorni
                </li>
                <li className="flex items-center gap-2">
                  <RefreshCw className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                  Reinviata ai clienti che non hanno risposto dopo 30 giorni
                </li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkSend}
              className="bg-[#c4724a] hover:bg-[#b06040]"
            >
              Invia
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
