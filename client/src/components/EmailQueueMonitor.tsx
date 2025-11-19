
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

interface QueueStats {
  pending: number;
  processing: number;
  sent: number;
  failed: number;
  todayCount: number;
  lastHourCount: number;
}

export function EmailQueueMonitor() {
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    try {
      const baseUrl = import.meta.env.VITE_FIREBASE_FUNCTIONS_URL || 
        'https://us-central1-wedding-gallery-397b6.cloudfunctions.net';
      
      const response = await fetch(`${baseUrl}/getEmailQueueStats`);
      const data = await response.json();
      
      if (data.success) {
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Error fetching queue stats:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000); // Refresh ogni 30s
    return () => clearInterval(interval);
  }, []);

  if (loading || !stats) return null;

  const dailyUsagePercent = (stats.todayCount / 1800) * 100;
  const hourlyUsagePercent = (stats.lastHourCount / 90) * 100;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          📧 Email Queue Monitor
          <Badge variant={stats.failed > 10 ? 'destructive' : 'default'}>
            {stats.pending} in queue
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Limiti Giornalieri */}
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span>Limite Giornaliero</span>
            <span className="font-medium">{stats.todayCount} / 1800</span>
          </div>
          <Progress value={dailyUsagePercent} className="h-2" />
        </div>

        {/* Limiti Orari */}
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span>Limite Orario</span>
            <span className="font-medium">{stats.lastHourCount} / 90</span>
          </div>
          <Progress value={hourlyUsagePercent} className="h-2" />
        </div>

        {/* Statistiche */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-muted-foreground">In Attesa</div>
            <div className="text-2xl font-bold">{stats.pending}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Inviate Oggi</div>
            <div className="text-2xl font-bold text-green-600">{stats.todayCount}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Processing</div>
            <div className="text-2xl font-bold text-blue-600">{stats.processing}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Fallite</div>
            <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
          </div>
        </div>

        {/* Warning se vicini al limite */}
        {dailyUsagePercent > 80 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm">
            ⚠️ Vicini al limite giornaliero ({Math.round(dailyUsagePercent)}%)
          </div>
        )}
      </CardContent>
    </Card>
  );
}
