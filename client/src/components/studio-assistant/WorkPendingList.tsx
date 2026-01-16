/**
 * WorkPendingList - Lista lavori flaggati come "da fare"
 */

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Clock, 
  Calendar, 
  CheckCircle2, 
  ExternalLink,
  Paintbrush,
  Users,
  Printer,
  HelpCircle
} from 'lucide-react';
import type { StudioSuggestion, PendingReason } from '@shared/studio-assistant-types';

interface WorkPendingListProps {
  jobs: StudioSuggestion[];
  onMarkAsDelivered: (jobId: string) => Promise<void>;
  onBookConsultation?: (templateId: string, jobId: string, dates?: { from: string; to: string }) => void;
}

const reasonIcons: Record<PendingReason, React.ReactNode> = {
  editing: <Paintbrush className="h-4 w-4" />,
  client_waiting: <Users className="h-4 w-4" />,
  printing: <Printer className="h-4 w-4" />,
  other: <HelpCircle className="h-4 w-4" />
};

const reasonLabels: Record<PendingReason, string> = {
  editing: 'In lavorazione',
  client_waiting: 'Attesa selezione',
  printing: 'In stampa',
  other: 'Altro'
};

const reasonColors: Record<PendingReason, string> = {
  editing: 'bg-blue-100 text-blue-800',
  client_waiting: 'bg-purple-100 text-purple-800',
  printing: 'bg-orange-100 text-orange-800',
  other: 'bg-gray-100 text-gray-800'
};

export default function WorkPendingList({ 
  jobs, 
  onMarkAsDelivered,
  onBookConsultation 
}: WorkPendingListProps) {
  if (jobs.length === 0) {
    return (
      <div className="py-12 text-center">
        <CheckCircle2 className="h-12 w-12 text-sage mx-auto mb-4" />
        <p className="text-gray-600">Nessun lavoro in sospeso</p>
        <p className="text-sm text-gray-400 mt-1">
          I lavori marcati come "da fare" appariranno qui
        </p>
      </div>
    );
  }
  
  // Raggruppa per motivo
  const groupedByReason = jobs.reduce((acc, job) => {
    const reason = job.pendingReason || 'other';
    if (!acc[reason]) acc[reason] = [];
    acc[reason].push(job);
    return acc;
  }, {} as Record<PendingReason, StudioSuggestion[]>);
  
  return (
    <div className="space-y-6">
      {(Object.entries(groupedByReason) as [PendingReason, StudioSuggestion[]][]).map(([reason, reasonJobs]) => (
        <div key={reason}>
          <div className="flex items-center gap-2 mb-3">
            <Badge variant="outline" className={reasonColors[reason]}>
              {reasonIcons[reason]}
              <span className="ml-1">{reasonLabels[reason]}</span>
            </Badge>
            <span className="text-sm text-gray-500">
              ({reasonJobs.length} {reasonJobs.length === 1 ? 'lavoro' : 'lavori'})
            </span>
          </div>
          
          <div className="space-y-2">
            {reasonJobs.map(job => (
              <Card key={job.id} className="border-l-4 border-l-amber-400">
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 truncate">
                        {job.jobName}
                      </p>
                      {job.clientName && (
                        <p className="text-sm text-gray-600 truncate">
                          {job.clientName}
                        </p>
                      )}
                      
                      {/* Motivazione visualizzazione */}
                      {job.reason && (
                        <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {job.reason}
                        </p>
                      )}
                    </div>
                    
                    <div className="flex gap-2 flex-shrink-0">
                      <Button 
                        size="sm"
                        onClick={() => onMarkAsDelivered(job.jobId!)}
                        className="bg-sage hover:bg-sage/90"
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1" />
                        Consegnato
                      </Button>
                      
                      {job.consultationTemplateId && onBookConsultation && (
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => onBookConsultation(
                            job.consultationTemplateId!,
                            job.jobId!,
                            job.suggestedDates
                          )}
                        >
                          <Calendar className="h-4 w-4 mr-1" />
                          Consulenza
                        </Button>
                      )}
                      
                      <Button 
                        size="sm" 
                        variant="ghost"
                        onClick={() => window.open(`/admin/jobs/${job.jobId}`, '_blank')}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
