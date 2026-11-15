import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

const QUERY_KEY = ['client-area-pending-welcome'];

/**
 * Invito di gruppo all'area cliente per i clienti che hanno già lavori ma non
 * hanno ancora ricevuto il benvenuto. Invia a blocchi da 20 e mostra l'avanzamento.
 */
export default function InviteAllClientsButton() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ sent: 0, failed: 0, total: 0 });

  const pending = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => (await (await apiRequest('GET', '/api/client-area/admin/welcome/pending')).json()) as { pending: number },
    enabled: open,
  });

  const start = async () => {
    const total = pending.data?.pending ?? 0;
    setRunning(true);
    setProgress({ sent: 0, failed: 0, total });
    let sent = 0;
    let failed = 0;
    try {
      // Ogni chiamata invita il blocco successivo; ci si ferma quando non resta nessuno
      // o quando un blocco non riesce a inviare nulla (es. casella email non disponibile).
      for (let round = 0; round < 100; round++) {
        const res = await apiRequest('POST', '/api/client-area/admin/welcome/pending');
        const data = await res.json() as { sent: number; failed: number; remaining: number };
        sent += data.sent;
        failed = data.failed;
        setProgress({ sent, failed, total });
        if (data.remaining === 0 || data.sent === 0) break;
      }
      toast({
        title: 'Inviti inviati',
        description: failed > 0
          ? `${sent} inviti partiti, ${failed} non riusciti: riprova più tardi.`
          : `${sent} clienti hanno ricevuto il link alla loro area.`,
      });
    } catch (error) {
      toast({ title: 'Invio interrotto', description: `${sent} inviti partiti prima dell'errore. Puoi riprendere: i clienti già invitati non ricevono doppioni.`, variant: 'destructive' });
    } finally {
      setRunning(false);
      await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      await queryClient.invalidateQueries({ queryKey: ['clienti'] });
    }
  };

  const count = pending.data?.pending;
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} data-testid="button-invite-all-client-area">
        <KeyRound className="mr-2 h-4 w-4" />
        Invita all'area
      </Button>
      <Dialog open={open} onOpenChange={value => { if (!running) setOpen(value); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invita i clienti all'area personale</DialogTitle>
            <DialogDescription>
              L'email con il link all'area va ai clienti che hanno almeno un lavoro, un'email valida e non l'hanno ancora ricevuta.
              Chi è già stato invitato non riceve doppioni.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            {pending.isLoading ? (
              <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Conto i clienti da invitare…</p>
            ) : pending.isError ? (
              <p className="text-destructive">Impossibile contare i clienti da invitare.</p>
            ) : (
              <p><strong>{count}</strong> {count === 1 ? 'cliente da invitare' : 'clienti da invitare'}.</p>
            )}
            {(running || progress.sent > 0) && progress.total > 0 && (
              <div className="space-y-1">
                <Progress value={Math.min(100, Math.round((progress.sent / progress.total) * 100))} />
                <p className="text-xs text-muted-foreground">{progress.sent} di {progress.total} inviati</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={running}>Chiudi</Button>
            <Button onClick={start} disabled={running || !count} className="bg-sage hover:bg-sage/90">
              {running && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {running ? 'Invio in corso…' : `Invia ${count ?? ''} inviti`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
