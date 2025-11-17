
import { useState, useEffect } from 'react';
import { useParams, useLocation } from 'wouter';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Check, X, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import it from 'date-fns/locale/it';
import { apiRequest } from '@/lib/queryClient';

export default function CollaboratorAssignmentResponse() {
  const { assignmentId, action } = useParams<{ assignmentId: string; action: 'accept' | 'decline' }>();
  const [, navigate] = useLocation();
  const [noteRifiuto, setNoteRifiuto] = useState('');
  const [responseComplete, setResponseComplete] = useState(false);

  const { data: assignment, isLoading } = useQuery({
    queryKey: ['assignment', assignmentId],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/collaboratori/public/assignment/${assignmentId}`);
      return response.json();
    }
  });

  const acceptMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/collaboratori/public/assignment/${assignmentId}/accept`);
      return response.json();
    },
    onSuccess: () => setResponseComplete(true)
  });

  const declineMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/collaboratori/public/assignment/${assignmentId}/decline`, {
        noteRifiuto
      });
      return response.json();
    },
    onSuccess: () => setResponseComplete(true)
  });

  useEffect(() => {
    if (assignment?.status !== 'pending') {
      setResponseComplete(true);
    }
  }, [assignment]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!assignment) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Assegnazione non trovata</CardTitle>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (responseComplete || assignment.status !== 'pending') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-center">
              {assignment.status === 'accepted' ? '✅ Assegnazione Accettata' : '❌ Assegnazione Rifiutata'}
            </CardTitle>
            <CardDescription className="text-center">
              La tua risposta è stata registrata con successo
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground text-center mb-4">
              {assignment.status === 'accepted' 
                ? 'Grazie per aver accettato! Ti contatteremo presto con ulteriori dettagli.'
                : 'Grazie per la risposta. Comprendiamo la tua decisione.'}
            </p>
            {assignment.dataRisposta && (
              <p className="text-xs text-muted-foreground text-center">
                Risposta inviata il {format(new Date(assignment.dataRisposta.toDate()), 'PPP', { locale: it })}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
      <Card className="max-w-2xl w-full">
        <CardHeader>
          <CardTitle>📸 Assegnazione Lavoro Fotografico</CardTitle>
          <CardDescription>
            Conferma o rifiuta l'assegnazione
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Dettagli Lavoro */}
          <div className="bg-muted p-4 rounded-lg space-y-2">
            <h3 className="font-semibold text-lg">{assignment.job?.nomeEvento}</h3>
            {assignment.job?.eventDate && (
              <p className="text-sm">
                📅 {format(new Date(assignment.job.eventDate.toDate()), 'PPP', { locale: it })}
              </p>
            )}
            <p className="text-sm">🎯 Ruolo: {assignment.ruoloInJob}</p>
            <p className="text-sm">💰 Compenso: €{assignment.compenso}</p>
            {assignment.noteAdmin && (
              <div className="mt-3 pt-3 border-t">
                <p className="text-sm font-medium mb-1">Note:</p>
                <p className="text-sm text-muted-foreground">{assignment.noteAdmin}</p>
              </div>
            )}
          </div>

          {action === 'decline' && (
            <div className="space-y-2">
              <Label htmlFor="noteRifiuto">Motivazione (opzionale)</Label>
              <Textarea
                id="noteRifiuto"
                value={noteRifiuto}
                onChange={(e) => setNoteRifiuto(e.target.value)}
                placeholder="Indica brevemente il motivo del rifiuto..."
                rows={3}
              />
            </div>
          )}

          <div className="flex gap-3">
            {action === 'accept' ? (
              <Button
                onClick={() => acceptMutation.mutate()}
                disabled={acceptMutation.isPending}
                className="flex-1 bg-green-600 hover:bg-green-700"
              >
                {acceptMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Check className="h-4 w-4 mr-2" />
                )}
                Conferma Accettazione
              </Button>
            ) : (
              <Button
                onClick={() => declineMutation.mutate()}
                disabled={declineMutation.isPending}
                variant="destructive"
                className="flex-1"
              >
                {declineMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <X className="h-4 w-4 mr-2" />
                )}
                Conferma Rifiuto
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
