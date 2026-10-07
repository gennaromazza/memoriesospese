import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
  Heart, 
  MessageCircle, 
  Users, 
  Camera, 
  Mic2,
  TrendingUp,
  BarChart3
} from 'lucide-react';

interface InteractionStats {
  totalLikes: number;
  totalComments: number;
  photoLikes: number;
  voiceMemoLikes: number;
  photoComments: number;
  voiceMemoComments: number;
  uniqueLikeUsers: number;
  uniqueCommentUsers: number;
  engagement: {
    photos: number;
    voiceMemos: number;
  };
}

interface InteractionStatsPanelProps {
  galleryId: string;
}

export default function InteractionStatsPanel({ galleryId }: InteractionStatsPanelProps) {
  const [stats, setStats] = useState<InteractionStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { toast } = useToast();

  const fetchStats = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`/api/galleries/${galleryId}/admin/interaction-stats`);
      
      if (!response.ok) {
        throw new Error('Errore nel caricamento delle statistiche');
      }

      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Errore nel caricamento statistiche:', error);
      setError('Impossibile caricare le statistiche delle interazioni');
      toast({
        title: "Errore",
        description: "Impossibile caricare le statistiche delle interazioni",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [galleryId]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Statistiche Interazioni
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !stats) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Statistiche Interazioni
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <p className="text-gray-500 mb-4">{error || 'Nessun dato disponibile'}</p>
            <button 
              onClick={fetchStats}
              className="px-4 py-2 bg-sage-600 text-white rounded-md hover:bg-sage-700 transition-colors"
            >
              Ricarica
            </button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const totalInteractions = stats.totalLikes + stats.totalComments;
  const totalUniqueUsers = Math.max(stats.uniqueLikeUsers, stats.uniqueCommentUsers);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Statistiche Interazioni
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Overview Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-red-50 p-4 rounded-lg border border-red-200">
            <div className="flex items-center gap-2 mb-2">
              <Heart className="h-4 w-4 text-red-600" />
              <span className="text-sm font-medium text-red-900">Like Totali</span>
            </div>
            <p className="text-2xl font-bold text-red-600">{stats.totalLikes}</p>
          </div>

          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <div className="flex items-center gap-2 mb-2">
              <MessageCircle className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-900">Commenti</span>
            </div>
            <p className="text-2xl font-bold text-blue-600">{stats.totalComments}</p>
          </div>

          <div className="bg-green-50 p-4 rounded-lg border border-green-200">
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium text-green-900">Utenti Attivi</span>
            </div>
            <p className="text-2xl font-bold text-green-600">{totalUniqueUsers}</p>
          </div>

          <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-purple-600" />
              <span className="text-sm font-medium text-purple-900">Engagement</span>
            </div>
            <p className="text-2xl font-bold text-purple-600">{totalInteractions}</p>
          </div>
        </div>

        {/* Breakdown by Content Type */}
        <div className="space-y-4">
          <h3 className="font-semibold text-gray-900">Interazioni per Contenuto</h3>
          
          {/* Photos */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="flex items-center gap-2 mb-3">
              <Camera className="h-5 w-5 text-gray-700" />
              <span className="font-medium text-gray-900">Foto</span>
              <Badge variant="outline" className="ml-auto">
                {stats.engagement.photos} interazioni totali
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Like</span>
                <div className="flex items-center gap-2">
                  <Heart className="h-3 w-3 text-red-500" />
                  <span className="font-medium">{stats.photoLikes}</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Commenti</span>
                <div className="flex items-center gap-2">
                  <MessageCircle className="h-3 w-3 text-blue-500" />
                  <span className="font-medium">{stats.photoComments}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Voice Memos */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="flex items-center gap-2 mb-3">
              <Mic2 className="h-5 w-5 text-gray-700" />
              <span className="font-medium text-gray-900">Vocali Segreti</span>
              <Badge variant="outline" className="ml-auto">
                {stats.engagement.voiceMemos} interazioni totali
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Like</span>
                <div className="flex items-center gap-2">
                  <Heart className="h-3 w-3 text-red-500" />
                  <span className="font-medium">{stats.voiceMemoLikes}</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Commenti</span>
                <div className="flex items-center gap-2">
                  <MessageCircle className="h-3 w-3 text-blue-500" />
                  <span className="font-medium">{stats.voiceMemoComments}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* User Engagement */}
        <div className="space-y-3">
          <h3 className="font-semibold text-gray-900">Partecipazione Utenti</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-sm text-gray-600">Utenti che hanno messo like</span>
              <span className="font-medium text-gray-900">{stats.uniqueLikeUsers}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-sm text-gray-600">Utenti che hanno commentato</span>
              <span className="font-medium text-gray-900">{stats.uniqueCommentUsers}</span>
            </div>
          </div>
        </div>

        {/* Engagement Rate */}
        {totalInteractions > 0 && (
          <div className="bg-gradient-to-r from-sage-50 to-blue-gray-50 p-4 rounded-lg border">
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-1">Tasso di Engagement</p>
              <p className="text-2xl font-bold text-sage-700">
                {((totalInteractions / Math.max(totalUniqueUsers, 1)) * 100).toFixed(1)}%
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Media di {(totalInteractions / Math.max(totalUniqueUsers, 1)).toFixed(1)} interazioni per utente
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}