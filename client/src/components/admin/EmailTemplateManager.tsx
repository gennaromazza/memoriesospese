import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { 
  Mail, 
  Plus, 
  Edit, 
  Trash2, 
  Eye, 
  Copy,
  FileText,
  Users,
  Key,
  Bell,
  Sparkles
} from 'lucide-react';
import { apiRequest, getQueryFn } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import EmailTemplateEditor from './EmailTemplateEditor';
import EmailTemplatePreview from './EmailTemplatePreview';
import type { EmailTemplate } from '@shared/schema';

interface EmailTemplateManagerProps {
  galleryId: string;
  galleryName: string;
}

const templateTypeConfig = {
  welcome: {
    icon: Users,
    title: 'Benvenuto',
    description: 'Email di benvenuto per nuovi utenti registrati',
    color: 'bg-green-100 text-green-800'
  },
  invitation: {
    icon: Mail,
    title: 'Invito',
    description: 'Email di invito alla galleria',
    color: 'bg-blue-100 text-blue-800'
  },
  password_request: {
    icon: Key,
    title: 'Richiesta Password',
    description: 'Email con password per galleria protetta',
    color: 'bg-yellow-100 text-yellow-800'
  },
  new_photos: {
    icon: Bell,
    title: 'Nuove Foto',
    description: 'Notifica per nuove foto caricate',
    color: 'bg-purple-100 text-purple-800'
  }
};

export default function EmailTemplateManager({ galleryId, galleryName }: EmailTemplateManagerProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [activeTemplateType, setActiveTemplateType] = useState<string>('welcome');
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch templates for gallery
  const { data: templates = [], isLoading } = useQuery<EmailTemplate[]>({
    queryKey: [`/api/galleries/${galleryId}/email-templates`],
    queryFn: getQueryFn(),
  });

  // Delete template mutation
  const deleteTemplateMutation = useMutation({
    mutationFn: async (templateId: string) => {
      await apiRequest('DELETE', `/api/galleries/${galleryId}/email-templates/${templateId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/galleries/${galleryId}/email-templates`] });
      toast({
        title: "Template eliminato",
        description: "Il template email è stato eliminato con successo.",
      });
    },
    onError: () => {
      toast({
        title: "Errore",
        description: "Errore durante l'eliminazione del template.",
        variant: "destructive",
      });
    }
  });

  // Copy template mutation
  const copyTemplateMutation = useMutation({
    mutationFn: async (template: EmailTemplate) => {
      const copyData = {
        ...template,
        subject: `${template.subject} (Copia)`,
        isActive: false
      };
      delete (copyData as any).id;
      delete (copyData as any).createdAt;
      delete (copyData as any).updatedAt;
      
      await apiRequest('POST', `/api/galleries/${galleryId}/email-templates`, copyData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/galleries/${galleryId}/email-templates`] });
      toast({
        title: "Template copiato",
        description: "Il template è stato copiato con successo.",
      });
    }
  });

  const handleEdit = (template: EmailTemplate) => {
    setEditingTemplate(template);
    setIsEditorOpen(true);
  };

  const handlePreview = (template: EmailTemplate) => {
    setSelectedTemplate(template);
    setIsPreviewOpen(true);
  };

  const handleCreateNew = (templateType: string) => {
    setEditingTemplate(null);
    setActiveTemplateType(templateType);
    setIsEditorOpen(true);
  };

  const getTemplatesByType = (type: string) => {
    return templates.filter((t: EmailTemplate) => t.templateType === type);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sage-600"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Template Email</h2>
          <p className="text-gray-600">Gestisci i template per le email della galleria {galleryName}</p>
        </div>
        <Badge variant="secondary" className="bg-sage-100 text-sage-700">
          <Sparkles className="h-3 w-3 mr-1" />
          {templates.length} Template
        </Badge>
      </div>

      <Tabs defaultValue="welcome" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          {Object.entries(templateTypeConfig).map(([type, config]) => {
            const Icon = config.icon;
            const count = getTemplatesByType(type).length;
            return (
              <TabsTrigger key={type} value={type} className="flex items-center gap-2">
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{config.title}</span>
                {count > 0 && (
                  <Badge variant="secondary" className="ml-1 px-1.5 py-0.5 text-xs">
                    {count}
                  </Badge>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {Object.entries(templateTypeConfig).map(([type, config]) => (
          <TabsContent key={type} value={type} className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <config.icon className="h-5 w-5 text-gray-600" />
                <div>
                  <h3 className="font-semibold">{config.title}</h3>
                  <p className="text-sm text-gray-600">{config.description}</p>
                </div>
              </div>
              <Button onClick={() => handleCreateNew(type)} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Nuovo Template
              </Button>
            </div>

            <div className="grid gap-4">
              {getTemplatesByType(type).length === 0 ? (
                <Card className="border-dashed border-2 border-gray-300">
                  <CardContent className="p-6 text-center">
                    <FileText className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                    <h3 className="font-medium text-gray-900 mb-2">Nessun template {config.title.toLowerCase()}</h3>
                    <p className="text-sm text-gray-600 mb-4">
                      Crea il tuo primo template {config.title.toLowerCase()} per personalizzare le email.
                    </p>
                    <Button onClick={() => handleCreateNew(type)} variant="outline">
                      <Plus className="h-4 w-4 mr-2" />
                      Crea Template
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                getTemplatesByType(type).map((template: EmailTemplate) => (
                  <Card key={template.id}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <CardTitle className="text-lg">{template.subject}</CardTitle>
                            <Badge 
                              variant={template.isActive ? "default" : "secondary"}
                              className={template.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}
                            >
                              {template.isActive ? 'Attivo' : 'Inattivo'}
                            </Badge>
                          </div>
                          <CardDescription>
                            Variabili disponibili: {template.variables.join(', ')}
                          </CardDescription>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handlePreview(template)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyTemplateMutation.mutate(template)}
                            disabled={copyTemplateMutation.isPending}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(template)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteTemplateMutation.mutate(template.id)}
                            disabled={deleteTemplateMutation.isPending}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>
        ))}
      </Tabs>

      {/* Template Editor Dialog */}
      <EmailTemplateEditor
        isOpen={isEditorOpen}
        onClose={() => {
          setIsEditorOpen(false);
          setEditingTemplate(null);
        }}
        galleryId={galleryId}
        galleryName={galleryName}
        template={editingTemplate}
        templateType={activeTemplateType}
        onSuccess={() => {
          setIsEditorOpen(false);
          setEditingTemplate(null);
          queryClient.invalidateQueries({ queryKey: [`/api/galleries/${galleryId}/email-templates`] });
        }}
      />

      {/* Template Preview Dialog */}
      <EmailTemplatePreview
        isOpen={isPreviewOpen}
        onClose={() => {
          setIsPreviewOpen(false);
          setSelectedTemplate(null);
        }}
        template={selectedTemplate}
        galleryName={galleryName}
      />
    </div>
  );
}