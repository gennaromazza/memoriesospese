import React, { useState, useEffect } from 'react';
import { collection, query, where, orderBy, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useFirebaseAuth } from '@/context/FirebaseAuthContext';
import { 
  Mic2, 
  Volume2, 
  Lock, 
  Unlock, 
  Calendar, 
  RefreshCw,
  Heart,
  Clock,
  AlertCircle,
  User
} from 'lucide-react';
import { VoiceMemo } from '@shared/schema';
import VoiceMemoPlayer from './VoiceMemoPlayer';
import UserAvatar from './UserAvatar';

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
  const { user, userProfile, isAuthenticated } = useFirebaseAuth();

  const fetchVoiceMemos = async () => {
    try {
      setError(null);
      setIsLoading(true);
      
      // Automatic unlock check for admin users
      if (isAdmin) {
        try {
          const nowISO = new Date().toISOString();
          const memosToUnlock = query(
            collection(db, 'voiceMemos'),
            where('galleryId', '==', galleryId),
            where('isUnlocked', '==', false),
            where('unlockDate', '<=', nowISO)
          );
          
          const unlockSnapshot = await getDocs(memosToUnlock);
          const unlockPromises = unlockSnapshot.docs.map(doc => 
            updateDoc(doc.ref, { isUnlocked: true })
          );
          
          if (unlockPromises.length > 0) {
            await Promise.all(unlockPromises);
            console.log(`Sbloccati automaticamente ${unlockPromises.length} voice memos`);
          }
        } catch (unlockError) {
          console.warn('Errore nel controllo sblocchi automatici:', unlockError);
        }
      }
      
      // Fetch voice memos from Firebase
      let memosQuery;
      if (isAdmin) {
        // Admin can see all voice memos
        memosQuery = query(
          collection(db, 'voiceMemos'),
          where('galleryId', '==', galleryId),
          orderBy('createdAt', 'desc')
        );
      } else {
        // Non-admin can only see unlocked voice memos
        memosQuery = query(
          collection(db, 'voiceMemos'),
          where('galleryId', '==', galleryId),
          where('isUnlocked', '==', true),
          orderBy('createdAt', 'desc')
        );
      }
      
      const memosSnapshot = await getDocs(memosQuery);
      const memos: VoiceMemo[] = memosSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as VoiceMemo));
      
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
      console.error('Errore recupero voice memos galleria:', error);
      setError(error instanceof Error ? error.message : 'Errore sconosciuto');
      setVoiceMemos([]);
      setStats({ total: 0, unlocked: 0, locked: 0, upcomingUnlocks: 0 });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchVoiceMemos();
  }, [galleryId, refreshTrigger]);

  useEffect(() => {
    // Controllo periodico ogni 5 minuti per gli sblocchi automatici (solo refresh UI)
    const interval = setInterval(() => {
      // Per i non-admin, controlla solo se ci sono memo in attesa di sblocco
      const hasPendingUnlocks = voiceMemos.some(memo => 
        !memo.isUnlocked && memo.unlockDate && new Date(memo.unlockDate) <= new Date()
      );
      if (hasPendingUnlocks) {
        fetchVoiceMemos();
      }
    }, 5 * 60 * 1000); // 5 minuti

    return () => clearInterval(interval);
  }, [voiceMemos]);

  const handleUnlockMemo = async (memoId: string) => {
    try {
      const memoRef = doc(db, 'voiceMemos', memoId);
      await updateDoc(memoRef, {
        isUnlocked: true
      });
      
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
      const memoRef = doc(db, 'voiceMemos', memoId);
      await deleteDoc(memoRef);
      
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
      <Card className="overflow-hidden">
        <CardHeader className="pb-2 px-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Mic2 className="h-5 w-5 text-purple-600" />
            Vocali Segreti
            <Badge variant="outline" className="ml-auto text-[12px]">
              {stats.total} {stats.total === 1 ? 'messaggio' : 'messaggi'}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 px-4 pb-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            <div className="bg-green-50 rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-green-600">{stats.unlocked}</div>
              <div className="text-[11px] text-green-700 flex items-center justify-center gap-1 mt-0.5">
                <Volume2 className="h-3 w-3" />
                Disponibili
              </div>
            </div>
            {isAdmin && (
              <div className="bg-orange-50 rounded-xl p-3 text-center">
                <div className="text-2xl font-bold text-orange-600">{stats.locked}</div>
                <div className="text-[11px] text-orange-700 flex items-center justify-center gap-1 mt-0.5">
                  <Lock className="h-3 w-3" />
                  Bloccati
                </div>
              </div>
            )}
            <div className="bg-blue-50 rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-blue-600">{stats.upcomingUnlocks}</div>
              <div className="text-[11px] text-blue-700 flex items-center justify-center gap-1 mt-0.5">
                <Clock className="h-3 w-3" />
                In arrivo
              </div>
            </div>
            <div className="bg-purple-50 rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-purple-600">{stats.total}</div>
              <div className="text-[11px] text-purple-700 flex items-center justify-center gap-1 mt-0.5">
                <Heart className="h-3 w-3" />
                Totali
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {stats.upcomingUnlocks > 0 && (
        <Card className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 overflow-hidden">
          <CardHeader className="pb-2 px-4">
            <CardTitle className="flex items-center gap-2 text-sm text-blue-900">
              <Calendar className="h-4 w-4" />
              Prossimi sblocchi
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 px-4 pb-4">
            <div className="space-y-2">
              {getUpcomingUnlocks().map((memo) => (
                <div key={memo.id} className="flex items-center gap-3 bg-white p-3 rounded-xl border border-blue-100">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <Mic2 className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-[13px] truncate">{memo.guestName}</p>
                    <p className="text-[12px] text-gray-500">
                      Sblocco il {formatDate(memo.unlockDate!)}
                    </p>
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => handleUnlockMemo(memo.id)}
                      className="h-9 px-3 flex items-center gap-1.5 rounded-full text-green-600 border border-green-300 hover:bg-green-50 active:bg-green-100 text-[12px] font-medium touch-manipulation transition-colors flex-shrink-0"
                    >
                      <Unlock className="h-3.5 w-3.5" />
                      Sblocca
                    </button>
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

      <div className="flex flex-col sm:flex-row gap-2 sm:justify-center">
        <Button 
          onClick={fetchVoiceMemos} 
          variant="outline"
          className="h-11 text-sage-600 border-sage-300 hover:bg-sage-50 active:bg-sage-100 rounded-xl touch-manipulation w-full sm:w-auto"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Aggiorna elenco
        </Button>
        {isAdmin && (
          <Button 
            onClick={async () => {
              try {
                const { VoiceMemoService } = await import('@/lib/voiceMemos');
                const unlockedCount = await VoiceMemoService.checkAndUnlockMemos();
                
                toast({
                  title: "Controllo sblocchi completato",
                  description: `${unlockedCount} voice memo${unlockedCount !== 1 ? 's' : ''} sbloccati`,
                });
                fetchVoiceMemos();
              } catch (error) {
                console.error('Errore nel controllo sblocchi automatici:', error);
                toast({
                  title: "Errore",
                  description: "Errore nel controllo degli sblocchi",
                  variant: "destructive",
                });
              }
            }} 
            variant="outline"
            className="h-11 text-blue-600 border-blue-300 hover:bg-blue-50 active:bg-blue-100 rounded-xl touch-manipulation w-full sm:w-auto"
          >
            <Unlock className="h-4 w-4 mr-2" />
            Controlla sblocchi
          </Button>
        )}
      </div>
    </div>
  );
}