import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface ModuloInfo {
  id: string;
  galleryId: string;
  galleryTitle: string;
  status: 'pending' | 'completed';
  dataSent?: Date;
  dataCompleted?: Date;
}

interface ModuliPrenotazioneSectionProps {
  moduli?: ModuloInfo[];
}

export default function ModuliPrenotazioneSection({ moduli = [] }: ModuliPrenotazioneSectionProps) {
  if (moduli.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>Nessun questionario collegato</p>
        <p className="text-sm mt-1">I questionari verranno mostrati quando associati alle gallerie del lavoro</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {moduli.map(modulo => (
        <Card key={modulo.id} data-testid={`card-modulo-${modulo.id}`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{modulo.galleryTitle}</span>
                  <Badge 
                    variant={modulo.status === 'completed' ? 'default' : 'secondary'}
                    data-testid={`badge-status-${modulo.id}`}
                  >
                    {modulo.status === 'completed' ? 'Completato' : 'In attesa'}
                  </Badge>
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  {modulo.dataSent && `Inviato: ${modulo.dataSent.toLocaleDateString('it-IT')}`}
                  {modulo.dataCompleted && ` • Completato: ${modulo.dataCompleted.toLocaleDateString('it-IT')}`}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => window.open(`/admin/galleries/${modulo.galleryId}/questionnaire`, '_blank')}
                data-testid={`button-view-${modulo.id}`}
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
