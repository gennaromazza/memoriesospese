import type { Cliente } from '@shared/clienti-types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import {
  Edit,
  Mail,
  MessageCircle,
  History,
  Archive,
  Trash2,
  MoreVertical,
  UserCog,
} from 'lucide-react';

interface ClienteQuickActionsProps {
  cliente: Cliente;
  onAction: (action: 'edit' | 'email' | 'whatsapp' | 'storico' | 'change-status' | 'archive' | 'delete') => void;
}

export default function ClienteQuickActions({ cliente, onAction }: ClienteQuickActionsProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm"
          data-testid={`button-actions-${cliente.id}`}
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem
          onClick={() => onAction('edit')}
          className="cursor-pointer"
          data-testid={`action-edit-${cliente.id}`}
        >
          <Edit className="h-4 w-4 mr-2 text-[hsl(var(--blue-gray))]" />
          <span>Modifica</span>
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => onAction('email')}
          disabled={!cliente.email}
          className="cursor-pointer"
          data-testid={`action-email-${cliente.id}`}
        >
          <Mail className="h-4 w-4 mr-2 text-[hsl(var(--sage))]" />
          <span>Invia Email</span>
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => onAction('whatsapp')}
          disabled={!cliente.whatsapp && !cliente.cellulare1}
          className="cursor-pointer"
          data-testid={`action-whatsapp-${cliente.id}`}
        >
          <MessageCircle className="h-4 w-4 mr-2 text-[hsl(var(--terracotta))]" />
          <span>Invia WhatsApp</span>
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => onAction('storico')}
          className="cursor-pointer"
          data-testid={`action-storico-${cliente.id}`}
        >
          <History className="h-4 w-4 mr-2 text-[hsl(var(--blue-gray))]" />
          <span>Visualizza Storico</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={() => onAction('change-status')}
          className="cursor-pointer"
          data-testid={`action-change-status-${cliente.id}`}
        >
          <UserCog className="h-4 w-4 mr-2 text-[hsl(var(--sage))]" />
          <span>Cambia Status</span>
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => onAction('archive')}
          disabled={cliente.lifecycle.status === 'archiviato'}
          className="cursor-pointer"
          data-testid={`action-archive-${cliente.id}`}
        >
          <Archive className="h-4 w-4 mr-2 text-[hsl(var(--terracotta))]" />
          <span>Archivia</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={() => onAction('delete')}
          className="cursor-pointer text-destructive focus:text-destructive"
          data-testid={`action-delete-${cliente.id}`}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          <span>Elimina</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
