import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { 
  Code, 
  Eye, 
  Save, 
  RefreshCw, 
  Info,
  FileText,
  Mail
} from 'lucide-react';
import { apiRequest, getQueryFn } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { EmailTemplate } from '@shared/schema';

interface EmailTemplateEditorProps {
  isOpen: boolean;
  onClose: () => void;
  galleryId: string;
  galleryName: string;
  template?: EmailTemplate | null;
  templateType?: string;
  onSuccess: () => void;
}

const formSchema = z.object({
  templateType: z.enum(['welcome', 'invitation', 'password_request', 'new_photos']),
  subject: z.string().min(1, "Subject is required").max(200, "Subject too long"),
  htmlContent: z.string().min(1, "HTML content is required"),
  textContent: z.string().min(1, "Text content is required"),
  isActive: z.boolean(),
  variables: z.array(z.string()),
});

type FormData = z.infer<typeof formSchema>;

const templateTypeOptions = [
  { value: 'welcome', label: 'Benvenuto' },
  { value: 'invitation', label: 'Invito' },
  { value: 'password_request', label: 'Richiesta Password' },
  { value: 'new_photos', label: 'Nuove Foto' },
];

const getDefaultVariables = (templateType: string): string[] => {
  const variableMap: Record<string, string[]> = {
    welcome: ['galleryName', 'userName', 'userEmail', 'galleryUrl'],
    invitation: ['galleryName', 'eventDate', 'eventLocation', 'galleryUrl'],
    password_request: ['galleryName', 'firstName', 'lastName', 'password', 'galleryUrl'],
    new_photos: ['galleryName', 'newPhotosCount', 'uploaderName', 'galleryUrl']
  };
  return variableMap[templateType] || [];
};

export default function EmailTemplateEditor({
  isOpen,
  onClose,
  galleryId,
  galleryName,
  template,
  templateType = 'welcome',
  onSuccess
}: EmailTemplateEditorProps) {
  const [previewHtml, setPreviewHtml] = useState('');
  const [activeTab, setActiveTab] = useState('content');
  
  const { toast } = useToast();

  // Fetch default template for the type
  const { data: defaultTemplate } = useQuery({
    queryKey: [`/api/email-templates/defaults/${templateType}`],
    queryFn: getQueryFn(),
    enabled: !template && isOpen,
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      templateType: templateType as any,
      subject: '',
      htmlContent: '',
      textContent: '',
      isActive: true,
      variables: getDefaultVariables(templateType),
    },
  });

  // Reset form when template or default template changes
  useEffect(() => {
    if (template) {
      form.reset({
        templateType: template.templateType,
        subject: template.subject,
        htmlContent: template.htmlContent,
        textContent: template.textContent,
        isActive: template.isActive,
        variables: template.variables,
      });
    } else if (defaultTemplate) {
      form.reset({
        templateType: templateType as any,
        subject: defaultTemplate.subject || '',
        htmlContent: defaultTemplate.htmlContent || '',
        textContent: defaultTemplate.textContent || '',
        isActive: true,
        variables: defaultTemplate.variables || getDefaultVariables(templateType),
      });
    }
  }, [template, defaultTemplate, templateType, form]);

  // Update preview when HTML content changes
  useEffect(() => {
    const htmlContent = form.watch('htmlContent');
    if (htmlContent) {
      // Replace variables with sample data for preview
      let preview = htmlContent;
      const sampleData: Record<string, string> = {
        galleryName: galleryName,
        userName: 'Mario Rossi',
        userEmail: 'mario.rossi@email.com',
        galleryUrl: `${window.location.origin}/gallery/${galleryId}`,
        eventDate: '15 Giugno 2024',
        eventLocation: 'Villa dei Fiori, Roma',
        firstName: 'Mario',
        lastName: 'Rossi',
        password: 'esempio123',
        newPhotosCount: '25',
        uploaderName: 'Fotografo Studio'
      };

      Object.entries(sampleData).forEach(([key, value]) => {
        preview = preview.replace(new RegExp(`{{${key}}}`, 'g'), value);
      });

      setPreviewHtml(preview);
    }
  }, [form.watch('htmlContent'), galleryName, galleryId]);

  // Save template mutation
  const saveTemplateMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const url = template 
        ? `/api/galleries/${galleryId}/email-templates/${template.id}`
        : `/api/galleries/${galleryId}/email-templates`;
      
      const method = template ? 'PUT' : 'POST';
      await apiRequest(method, url, data);
    },
    onSuccess: () => {
      toast({
        title: template ? "Template aggiornato" : "Template creato",
        description: template 
          ? "Il template è stato aggiornato con successo." 
          : "Il template è stato creato con successo.",
      });
      onSuccess();
    },
    onError: () => {
      toast({
        title: "Errore",
        description: "Errore durante il salvataggio del template.",
        variant: "destructive",
      });
    }
  });

  const handleSubmit = (data: FormData) => {
    saveTemplateMutation.mutate(data);
  };

  const loadDefaultTemplate = () => {
    if (defaultTemplate) {
      form.setValue('subject', defaultTemplate.subject);
      form.setValue('htmlContent', defaultTemplate.htmlContent);
      form.setValue('textContent', defaultTemplate.textContent);
      form.setValue('variables', defaultTemplate.variables);
    }
  };

  const insertVariable = (variable: string) => {
    const currentHtml = form.getValues('htmlContent');
    const currentText = form.getValues('textContent');
    
    form.setValue('htmlContent', currentHtml + `{{${variable}}}`);
    form.setValue('textContent', currentText + `{{${variable}}}`);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            {template ? 'Modifica Template' : 'Nuovo Template'}
          </DialogTitle>
          <DialogDescription>
            {template ? 'Modifica il template email esistente' : `Crea un nuovo template per ${templateTypeOptions.find(t => t.value === templateType)?.label}`}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="subject"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Oggetto Email</FormLabel>
                    <FormControl>
                      <Input placeholder="Inserisci l'oggetto dell'email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Template Attivo</FormLabel>
                      <FormDescription>
                        Usa questo template per le email
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            {/* Variables Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-medium">Variabili Disponibili</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={loadDefaultTemplate}
                  disabled={!defaultTemplate}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Carica Template Default
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {form.watch('variables').map((variable) => (
                  <Badge
                    key={variable}
                    variant="secondary"
                    className="cursor-pointer hover:bg-sage-100"
                    onClick={() => insertVariable(variable)}
                  >
                    {`{{${variable}}}`}
                  </Badge>
                ))}
              </div>
              <p className="text-sm text-gray-600 flex items-center gap-2">
                <Info className="h-4 w-4" />
                Clicca su una variabile per inserirla nel contenuto
              </p>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="content">
                  <FileText className="h-4 w-4 mr-2" />
                  Contenuto
                </TabsTrigger>
                <TabsTrigger value="html">
                  <Code className="h-4 w-4 mr-2" />
                  HTML
                </TabsTrigger>
                <TabsTrigger value="preview">
                  <Eye className="h-4 w-4 mr-2" />
                  Anteprima
                </TabsTrigger>
              </TabsList>

              <TabsContent value="content" className="space-y-4">
                <FormField
                  control={form.control}
                  name="textContent"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contenuto Testo</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Contenuto dell'email in formato testo..."
                          className="min-h-[200px]"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Versione testo dell'email (fallback per client che non supportano HTML)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </TabsContent>

              <TabsContent value="html" className="space-y-4">
                <FormField
                  control={form.control}
                  name="htmlContent"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contenuto HTML</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Contenuto dell'email in formato HTML..."
                          className="min-h-[300px] font-mono text-sm"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Contenuto HTML dell'email con stili inline per compatibilità
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </TabsContent>

              <TabsContent value="preview" className="space-y-4">
                <div className="border rounded-lg p-4 bg-white">
                  <div className="border-b pb-2 mb-4">
                    <p className="text-sm text-gray-600">
                      <strong>Oggetto:</strong> {form.watch('subject')}
                    </p>
                  </div>
                  <div 
                    className="prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: previewHtml }}
                  />
                </div>
              </TabsContent>
            </Tabs>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button type="button" variant="outline" onClick={onClose}>
                Annulla
              </Button>
              <Button 
                type="submit" 
                disabled={saveTemplateMutation.isPending}
                className="bg-sage-600 hover:bg-sage-700"
              >
                {saveTemplateMutation.isPending ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                {template ? 'Aggiorna Template' : 'Salva Template'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}