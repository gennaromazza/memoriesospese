import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { createUrl } from '@/lib/config';
import { 
  Mic2, 
  Volume2, 
  Lock, 
  Unlock, 
  Calendar, 
  RefreshCw,
  Heart,
  Clock,
  AlertCircle
} from 'lucide-react';
import { VoiceMemo } from '@shared/schema';
import VoiceMemoPlayer from './VoiceMemoPlayer';

interface VoiceMemosListProps {
  galleryId: string;
  isAdmin?: boolean;
  refreshTrigger?: number;
}

export default function VoiceMemosList({ 
  galleryId, 
  isAdmin = false, 
  refreshTrigger = 0 
}: VoiceMemosListProps) {
  const [voiceMemos, setVoiceMemos] = useState<VoiceMemo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({
    total: 0,
    unlocked: 0,
    locked: 0,
    upcomingUnlocks: 0
  });

  const { toast } = useToast();

  const fetchVoiceMemos = async () => {
    try {
      setError(null);
      
      // Se siamo admin, controlla prima gli sblocchi automatici
      if (isAdmin) {
        try {
          const response = await fetch(createUrl(`/api/galleries/${galleryId}/voice-memos/check-unlocks`), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              userEmail: 'gennaro.mazzacane@gmail.com', // Admin email
              userName: 'Admin'
            })
          });
          
          if (response.status === 401) {
            console.warn('Check-unlocks richiede autenticazione admin');
          }
        } catch (unlockError) {
          console.warn('Errore nel controllo sblocchi automatici:', unlockError);
        }
      }
      
      const url = `/api/galleries/${galleryId}/voice-memos${isAdmin ? '?includeAll=true' : ''}`;
      const response = await fetch(createUrl(url));
      
      if (!response.ok) {
        throw new Error('Errore nel caricamento dei voice memos');
      }
      
      const memos = await response.json();
      setVoiceMemos(memos);
      
      // Calculate stats
      const total = memos.length;
      const unlocked = memos.filter((memo: VoiceMemo) => memo.isUnlocked).length;
      const locked = total - unlocked;
      const upcomingUnlocks = memos.filter((memo: VoiceMemo) => 
        !memo.isUnlocked && memo.unlockDate && new Date(memo.unlockDate) > new Date()
      ).length;
      
      setStats({ total, unlocked, locked, upcomingUnlocks });
      
    } catch (error) {
      console.error('Error fetching voice memos:', error);
      setError(error instanceof Error ? error.message : 'Errore sconosciuto');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchVoiceMemos();
  }, [galleryId, refreshTrigger]);

  useEffect(() => {
    // Controllo periodico ogni 5 minuti per gli sblocchi automatici
    const interval = setInterval(() => {
      if (isAdmin) {
        fetchVoiceMemos();
      } else {
        // Per i non-admin, controlla solo se ci sono memo in attesa di sblocco
        const hasPendingUnlocks = voiceMemos.some(memo => 
          !memo.isUnlocked && memo.unlockDate && new Date(memo.unlockDate) <= new Date()
        );
        if (hasPendingUnlocks) {
          fetchVoiceMemos();
        }
      }
    }, 5 * 60 * 1000); // 5 minuti

    return () => clearInterval(interval);
  }, [isAdmin, voiceMemos]);

  const handleUnlockMemo = async (memoId: string) => {
    try {
      const response = await fetch(createUrl(`/api/galleries/${galleryId}/voice-memos/${memoId}/unlock`), {
        method: 'PUT',
      });
      
      if (!response.ok) {
        throw new Error('Errore nello sblocco del voice memo');
      }
      
      toast({
        title: "Voice memo sbloccato",
        description: "Il messaggio è ora disponibile per l'ascolto",
      });
      
      // Refresh the list
      fetchVoiceMemos();
      
    } catch (error) {
      console.error('Error unlocking memo:', error);
      toast({
        title: "Errore",
        description: "Errore nello sblocco del voice memo",
        variant: "destructive",
      });
    }
  };

  const handleDeleteMemo = async (memoId: string) => {
    if (!confirm('Sei sicuro di voler eliminare questo voice memo? L\'azione non può essere annullata.')) {
      return;
    }
    
    try {
      const response = await fetch(createUrl(`/api/galleries/${galleryId}/voice-memos/${memoId}`), {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error('Errore nell\'eliminazione del voice memo');
      }
      
      toast({
        title: "Voice memo eliminato",
        description: "Il messaggio è stato eliminato definitivamente",
      });
      
      // Refresh the list
      fetchVoiceMemos();
      
    } catch (error) {
      console.error('Error deleting memo:', error);
      toast({
        title: "Errore",
        description: "Errore nell'eliminazione del voice memo",
        variant: "destructive",
      });
    }
  };

  const getUpcomingUnlocks = () => {
    return voiceMemos
      .filter(memo => !memo.isUnlocked && memo.unlockDate && new Date(memo.unlockDate) > new Date())
      .sort((a, b) => new Date(a.unlockDate!).getTime() - new Date(b.unlockDate!).getTime())
      .slice(0, 3);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardContent className="p-6">
          <div className="flex items-center justify-center gap-3">
            <div className="w-6 h-6 border-2 border-sage-600 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-gray-600">Caricamento vocali segreti...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="w-full">
        <CardContent className="p-6">
          <div className="text-center space-y-4">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle className="h-6 w-6 text-red-600" />
            </div>
            <div>
              <p className="font-medium text-red-900 mb-2">Errore nel caricamento</p>
              <p className="text-sm text-red-700 mb-4">{error}</p>
              <Button onClick={fetchVoiceMemos} variant="outline" size="sm">
                <RefreshCw className="h-4 w-4 mr-2" />
                Riprova
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (voiceMemos.length === 0) {
    return (
      <Card className="w-full">
        <CardContent className="p-6">
          <div className="text-center space-y-4">
            <div className="w-12 h-12 bg-sage-100 rounded-full flex items-center justify-center mx-auto">
              <Mic2 className="h-6 w-6 text-sage-600" />
            </div>
            <div>
              <p className="font-medium text-gray-900 mb-2">Nessun vocale segreto</p>
              <p className="text-sm text-gray-600">
                {isAdmin 
                  ? 'Non ci sono ancora vocali segreti in questa galleria.'
                  : 'Non ci sono vocali segreti disponibili al momento.'
                }
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Stats overview */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Mic2 className="h-5 w-5 text-purple-600" />
            Vocali Segreti
            <Badge variant="outline" className="ml-auto">
              {stats.total} {stats.total === 1 ? 'messaggio' : 'messaggi'}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <div className="text-center">
              <div className="text-xl sm:text-2xl font-bold text-green-600">{stats.unlocked}</div>
              <div className="text-xs sm:text-sm text-gray-600 flex items-center justify-center gap-1">
                <Volume2 className="h-3 w-3" />
                Disponibili
              </div>
            </div>
            {isAdmin && (
              <div className="text-center">
                <div className="text-xl sm:text-2xl font-bold text-orange-600">{stats.locked}</div>
                <div className="text-xs sm:text-sm text-gray-600 flex items-center justify-center gap-1">
                  <Lock className="h-3 w-3" />
                  Bloccati
                </div>
              </div>
            )}
            <div className="text-center">
              <div className="text-xl sm:text-2xl font-bold text-blue-600">{stats.upcomingUnlocks}</div>
              <div className="text-xs sm:text-sm text-gray-600 flex items-center justify-center gap-1">
                <Clock className="h-3 w-3" />
                In arrivo
              </div>
            </div>
            <div className="text-center">
              <div className="text-xl sm:text-2xl font-bold text-purple-600">{stats.total}</div>
              <div className="text-xs sm:text-sm text-gray-600 flex items-center justify-center gap-1">
                <Heart className="h-3 w-3" />
                Totali
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Upcoming unlocks (if any) */}
      {stats.upcomingUnlocks > 0 && (
        <Card className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-blue-900">
              <Calendar className="h-4 w-4" />
              Prossimi sblocchi
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {getUpcomingUnlocks().map((memo) => (
                <div key={memo.id} className="flex items-center justify-between bg-white p-3 rounded-lg border border-blue-200">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                      <Mic2 className="h-4 w-4 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 text-sm">{memo.guestName}</p>
                      <p className="text-xs text-gray-600">
                        Sblocco il {formatDate(memo.unlockDate!)}
                      </p>
                    </div>
                  </div>
                  {isAdmin && (
                    <Button
                      onClick={() => handleUnlockMemo(memo.id)}
                      size="sm"
                      variant="outline"
                      className="text-green-600 border-green-300 hover:bg-green-50"
                    >
                      <Unlock className="h-3 w-3 mr-1" />
                      Sblocca ora
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Voice memos list */}
      <div className="space-y-3 sm:space-y-4">
        {voiceMemos.map((memo) => (
          <VoiceMemoPlayer
            key={memo.id}
            memo={memo}
            galleryId={galleryId}
            isAdmin={isAdmin}
            onUnlock={handleUnlockMemo}
            onDelete={handleDeleteMemo}
          />
        ))}
      </div>

      {/* Refresh and unlock check buttons */}
      <div className="text-center space-x-2">
        <Button 
          onClick={fetchVoiceMemos} 
          variant="outline"
          className="text-sage-600 border-sage-300 hover:bg-sage-50"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Aggiorna elenco
        </Button>
        {isAdmin && (
          <Button 
            onClick={async () => {
              try {
                const response = await fetch(createUrl(`/api/galleries/${galleryId}/voice-memos/check-unlocks`), {
                  method: 'POST'
                });
                const result = await response.json();
                if (result.success) {
                  toast({
                    title: "Controllo sblocchi completato",
                    description: result.message,
                  });
                  fetchVoiceMemos();
                }
              } catch (error) {
                toast({
                  title: "Errore",
                  description: "Errore nel controllo degli sblocchi",
                  variant: "destructive",
                });
              }
            }} 
            variant="outline"
            className="text-blue-600 border-blue-300 hover:bg-blue-50"
          >
            <Unlock className="h-4 w-4 mr-2" />
            Controlla sblocchi
          </Button>
        )}
      </div>
    </div>
  );
}