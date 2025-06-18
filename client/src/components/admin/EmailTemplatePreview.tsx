import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
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
  Eye, 
  Code, 
  Mail,
  FileText,
  Copy,
  Check
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { EmailTemplate } from '@shared/schema';

interface EmailTemplatePreviewProps {
  isOpen: boolean;
  onClose: () => void;
  template: EmailTemplate | null;
  galleryName: string;
}

export default function EmailTemplatePreview({
  isOpen,
  onClose,
  template,
  galleryName
}: EmailTemplatePreviewProps) {
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewText, setPreviewText] = useState('');
  const [previewSubject, setPreviewSubject] = useState('');
  const [copied, setCopied] = useState(false);
  
  const { toast } = useToast();

  // Generate preview with sample data
  useEffect(() => {
    if (!template) return;

    const sampleData: Record<string, string> = {
      galleryName: galleryName,
      userName: 'Mario Rossi',
      userEmail: 'mario.rossi@email.com',
      galleryUrl: `${window.location.origin}/gallery/sample-id`,
      eventDate: '15 Giugno 2024',
      eventLocation: 'Villa dei Fiori, Roma',
      firstName: 'Mario',
      lastName: 'Rossi',
      password: 'esempio123',
      newPhotosCount: '25',
      uploaderName: 'Fotografo Studio'
    };

    let htmlPreview = template.htmlContent;
    let textPreview = template.textContent;
    let subjectPreview = template.subject;

    Object.entries(sampleData).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      htmlPreview = htmlPreview.replace(regex, value);
      textPreview = textPreview.replace(regex, value);
      subjectPreview = subjectPreview.replace(regex, value);
    });

    setPreviewHtml(htmlPreview);
    setPreviewText(textPreview);
    setPreviewSubject(subjectPreview);
  }, [template, galleryName]);

  const copyToClipboard = async (content: string, type: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: "Copiato!",
        description: `${type} copiato negli appunti.`,
      });
    } catch (error) {
      toast({
        title: "Errore",
        description: "Impossibile copiare negli appunti.",
        variant: "destructive",
      });
    }
  };

  if (!template) return null;

  const templateTypeLabels = {
    welcome: 'Benvenuto',
    invitation: 'Invito',
    password_request: 'Richiesta Password',
    new_photos: 'Nuove Foto'
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Anteprima Template Email
          </DialogTitle>
          <DialogDescription>
            Anteprima del template "{template.subject}" con dati di esempio
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Template Info */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Badge variant="outline">
                {templateTypeLabels[template.templateType] || template.templateType}
              </Badge>
              <Badge 
                variant={template.isActive ? "default" : "secondary"}
                className={template.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}
              >
                {template.isActive ? 'Attivo' : 'Inattivo'}
              </Badge>
            </div>
            <p className="text-sm text-gray-600">
              Variabili: {template.variables.join(', ')}
            </p>
          </div>

          {/* Email Subject */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">Oggetto Email</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(previewSubject, 'Oggetto')}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg border">
              <p className="font-medium">{previewSubject}</p>
            </div>
          </div>

          {/* Email Content Tabs */}
          <Tabs defaultValue="html" className="space-y-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="html">
                <Mail className="h-4 w-4 mr-2" />
                Anteprima HTML
              </TabsTrigger>
              <TabsTrigger value="text">
                <FileText className="h-4 w-4 mr-2" />
                Testo
              </TabsTrigger>
              <TabsTrigger value="source">
                <Code className="h-4 w-4 mr-2" />
                Codice HTML
              </TabsTrigger>
            </TabsList>

            <TabsContent value="html" className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">Anteprima HTML (come la vedranno i destinatari)</h4>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(previewHtml, 'HTML')}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <div className="border rounded-lg p-6 bg-white max-h-[400px] overflow-y-auto">
                <div 
                  className="prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              </div>
            </TabsContent>

            <TabsContent value="text" className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">Versione Testo (fallback)</h4>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(previewText, 'Testo')}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <div className="border rounded-lg p-4 bg-gray-50 max-h-[400px] overflow-y-auto">
                <pre className="whitespace-pre-wrap text-sm font-mono">
                  {previewText}
                </pre>
              </div>
            </TabsContent>

            <TabsContent value="source" className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">Codice HTML Sorgente</h4>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(template.htmlContent, 'Codice HTML')}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <div className="border rounded-lg p-4 bg-gray-900 text-green-400 max-h-[400px] overflow-y-auto">
                <pre className="text-sm font-mono">
                  {template.htmlContent}
                </pre>
              </div>
            </TabsContent>
          </Tabs>

          {/* Sample Data Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-medium text-blue-900 mb-2">Dati di Esempio Utilizzati</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
              <div><strong>galleryName:</strong> {galleryName}</div>
              <div><strong>userName:</strong> Mario Rossi</div>
              <div><strong>userEmail:</strong> mario.rossi@email.com</div>
              <div><strong>eventDate:</strong> 15 Giugno 2024</div>
              <div><strong>eventLocation:</strong> Villa dei Fiori, Roma</div>
              <div><strong>password:</strong> esempio123</div>
              <div><strong>newPhotosCount:</strong> 25</div>
              <div><strong>uploaderName:</strong> Fotografo Studio</div>
            </div>
            <p className="text-xs text-blue-700 mt-2">
              Questi valori saranno sostituiti con i dati reali quando l'email viene inviata.
            </p>
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t">
          <Button onClick={onClose}>
            Chiudi Anteprima
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}