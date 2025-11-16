import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { Cliente, InsertCliente, UpdateCliente } from '@shared/clienti-types';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Save, X } from 'lucide-react';

const clienteSchema = z.object({
  nome: z.string().min(1, 'Nome obbligatorio'),
  cognome: z.string().min(1, 'Cognome obbligatorio'),
  email: z.string().email('Email non valida').min(1, 'Email obbligatoria'),
  cellulare1: z.string().optional(),
  cellulare2: z.string().optional(),
  whatsapp: z.string().optional(),
  via: z.string().optional(),
  citta: z.string().optional(),
  cap: z.string().optional(),
  provincia: z.string().optional(),
  note: z.string().optional(),
  tags: z.array(z.string()).optional(),
  status: z.enum(['lead', 'prospect', 'cliente_attivo', 'archiviato']).optional(),
});

type ClienteFormData = z.infer<typeof clienteSchema>;

interface ClienteFormProps {
  cliente?: Cliente | null;
  onSubmit: (data: InsertCliente | UpdateCliente) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export default function ClienteForm({ 
  cliente, 
  onSubmit, 
  onCancel,
  isSubmitting = false 
}: ClienteFormProps) {
  const isEdit = !!cliente;
  
  const form = useForm<ClienteFormData>({
    resolver: zodResolver(clienteSchema),
    defaultValues: {
      nome: cliente?.nome || '',
      cognome: cliente?.cognome || '',
      email: cliente?.email || '',
      cellulare1: cliente?.cellulare1 || '',
      cellulare2: cliente?.cellulare2 || '',
      whatsapp: cliente?.whatsapp || '',
      via: cliente?.via || '',
      citta: cliente?.citta || '',
      cap: cliente?.cap || '',
      provincia: cliente?.provincia || '',
      note: cliente?.note || '',
      tags: cliente?.tags || [],
      status: cliente?.lifecycle?.status || 'lead',
    },
  });

  const handleSubmit = (data: ClienteFormData) => {
    onSubmit(data);
  };

  return (
    <Form {...form}>
      <form 
        onSubmit={form.handleSubmit(handleSubmit)} 
        className="space-y-6"
        data-testid="form-cliente"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="nome"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nome *</FormLabel>
                <FormControl>
                  <Input 
                    {...field} 
                    placeholder="Mario" 
                    data-testid="input-nome"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="cognome"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Cognome *</FormLabel>
                <FormControl>
                  <Input 
                    {...field} 
                    placeholder="Rossi" 
                    data-testid="input-cognome"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email *</FormLabel>
              <FormControl>
                <Input 
                  {...field} 
                  type="email" 
                  placeholder="mario.rossi@example.com" 
                  data-testid="input-email"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FormField
            control={form.control}
            name="cellulare1"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Cellulare Principale</FormLabel>
                <FormControl>
                  <Input 
                    {...field} 
                    placeholder="+39 123 456 7890" 
                    data-testid="input-cellulare1"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="cellulare2"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Cellulare Secondario</FormLabel>
                <FormControl>
                  <Input 
                    {...field} 
                    placeholder="+39 098 765 4321" 
                    data-testid="input-cellulare2"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="whatsapp"
            render={({ field }) => (
              <FormItem>
                <FormLabel>WhatsApp</FormLabel>
                <FormControl>
                  <Input 
                    {...field} 
                    placeholder="+39 123 456 7890" 
                    data-testid="input-whatsapp"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-2">
            <FormField
              control={form.control}
              name="via"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Via</FormLabel>
                  <FormControl>
                    <Input 
                      {...field} 
                      placeholder="Via Roma, 123" 
                      data-testid="input-via"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="citta"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Città</FormLabel>
                <FormControl>
                  <Input 
                    {...field} 
                    placeholder="Milano" 
                    data-testid="input-citta"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="cap"
            render={({ field }) => (
              <FormItem>
                <FormLabel>CAP</FormLabel>
                <FormControl>
                  <Input 
                    {...field} 
                    placeholder="20100" 
                    data-testid="input-cap"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="provincia"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Provincia</FormLabel>
              <FormControl>
                <Input 
                  {...field} 
                  placeholder="MI" 
                  maxLength={2}
                  data-testid="input-provincia"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Status</FormLabel>
              <Select 
                onValueChange={field.onChange} 
                defaultValue={field.value}
                data-testid="select-status"
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona status" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="lead">Lead</SelectItem>
                  <SelectItem value="prospect">Prospect</SelectItem>
                  <SelectItem value="cliente_attivo">Cliente Attivo</SelectItem>
                  <SelectItem value="archiviato">Archiviato</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="note"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Note</FormLabel>
              <FormControl>
                <RichTextEditor
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="Note interne..."
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex gap-3 justify-end pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting}
            data-testid="button-cancel"
          >
            <X className="h-4 w-4 mr-2" />
            Annulla
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting}
            data-testid="button-submit"
          >
            <Save className="h-4 w-4 mr-2" />
            {isSubmitting ? 'Salvataggio...' : isEdit ? 'Aggiorna Cliente' : 'Crea Cliente'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
