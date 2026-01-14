import { Cliente } from '@shared/clienti-types';
import { Card, CardContent } from '@/components/ui/card';
import { Mail, Phone, MessageCircle, Edit, Clock, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AppuntamentoCliente } from '@shared/jobs-types';
import { formatPhoneForWhatsApp } from '@shared/phone-utils';

interface ClienteJobCardProps {
  cliente: Cliente;
  appuntamento?: AppuntamentoCliente;
  onViewDetails?: () => void;
  onEdit?: () => void;
}

export default function ClienteJobCard({ cliente, appuntamento, onViewDetails, onEdit }: ClienteJobCardProps) {
  const handleEmail = () => {
    if (cliente.email) {
      window.location.href = `mailto:${cliente.email}`;
    }
  };

  const handleWhatsApp = () => {
    const number = cliente.whatsapp || cliente.cellulare1;
    if (number) {
      const cleanNumber = formatPhoneForWhatsApp(number);
      if (cleanNumber) {
        window.open(`https://wa.me/${cleanNumber}`, '_blank');
      }
    }
  };

  const handlePhone = () => {
    if (cliente.cellulare1) {
      window.location.href = `tel:${cliente.cellulare1}`;
    }
  };

  return (
    <Card data-testid={`card-cliente-${cliente.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-lg truncate">
              {cliente.nome} {cliente.cognome}
            </h3>
            <div className="space-y-1 mt-2">
              {cliente.email && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Mail className="h-3.5 w-3.5 flex-shrink-0" />
                  <a 
                    href={`mailto:${cliente.email}`}
                    className="truncate hover:text-foreground hover:underline transition-colors"
                  >
                    {cliente.email}
                  </a>
                </div>
              )}
              {cliente.cellulare1 && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Phone className="h-3.5 w-3.5 flex-shrink-0" />
                  <a 
                    href={`tel:${cliente.cellulare1}`}
                    className="hover:text-foreground hover:underline transition-colors"
                  >
                    {cliente.cellulare1}
                  </a>
                </div>
              )}
              {(cliente.whatsapp || cliente.cellulare1) && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MessageCircle className="h-3.5 w-3.5 flex-shrink-0" />
                  <a 
                    href={`https://wa.me/${formatPhoneForWhatsApp(cliente.whatsapp || cliente.cellulare1 || '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-green-600 hover:underline transition-colors"
                  >
                    {cliente.whatsapp || cliente.cellulare1}
                  </a>
                </div>
              )}
            </div>
            
            {/* Appuntamento */}
            {appuntamento?.orarioAppuntamento && (
              <div className="mt-3 pt-3 border-t">
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-3.5 w-3.5 text-sage flex-shrink-0" />
                  <span className="font-medium text-sage">
                    Appuntamento: {appuntamento.orarioAppuntamento}
                  </span>
                </div>
                {appuntamento.noteAppuntamento && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                    <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                    <span>{appuntamento.noteAppuntamento}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="flex flex-col gap-2">
            {onEdit && (
              <Button
                variant="outline"
                size="default"
                onClick={onEdit}
                data-testid={`button-edit-${cliente.id}`}
              >
                <Edit className="h-4 w-4 mr-2" />
                Modifica
              </Button>
            )}
            {cliente.email && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleEmail}
                data-testid={`button-email-${cliente.id}`}
              >
                <Mail className="h-4 w-4" />
              </Button>
            )}
            {(cliente.whatsapp || cliente.cellulare1) && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleWhatsApp}
                data-testid={`button-whatsapp-${cliente.id}`}
              >
                <MessageCircle className="h-4 w-4" />
              </Button>
            )}
            {cliente.cellulare1 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handlePhone}
                data-testid={`button-phone-${cliente.id}`}
              >
                <Phone className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {onViewDetails && (
          <Button
            variant="link"
            size="sm"
            onClick={onViewDetails}
            className="mt-3 px-0 h-auto"
            data-testid={`button-view-details-${cliente.id}`}
          >
            Vedi storico completo →
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
