import { useState } from 'react';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, FileText, Loader2, CheckCircle, AlertCircle, Download } from 'lucide-react';
import { BlogPostStatus } from '@shared/schema';
import { Progress } from '@/components/ui/progress';
import { storage } from '@/lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { compressImage } from '@/lib/imageCompression';

interface WordPressPost {
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  publishedAt: Date;
  category: string;
  tags: string[];
}

export default function WordPressImporter({ onImportComplete }: { onImportComplete: () => void }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [importResult, setImportResult] = useState<{ success: number; failed: number } | null>(null);
  const { toast } = useToast();

  // Scarica immagine da URL esterno e la ricarica su Firebase
  const downloadAndReuploadImage = async (imageUrl: string, postSlug: string): Promise<string> => {
    try {
      // Download immagine
      const response = await fetch(imageUrl);
      if (!response.ok) throw new Error('Download fallito');
      
      const blob = await response.blob();
      const file = new File([blob], 'image.jpg', { type: blob.type });
      
      // Comprimi se è un'immagine
      const compressedFile = file.type.startsWith('image/') 
        ? await compressImage(file) 
        : file;
      
      // Upload su Firebase Storage
      const timestamp = Date.now();
      const storagePath = `blog-images/${postSlug}/${timestamp}.jpg`;
      const storageRef = ref(storage, storagePath);
      
      await uploadBytes(storageRef, compressedFile);
      const downloadUrl = await getDownloadURL(storageRef);
      
      return downloadUrl;
    } catch (error) {
      console.error('Errore download/upload immagine:', imageUrl, error);
      return imageUrl; // Ritorna URL originale in caso di errore
    }
  };

  // Estrae URL immagini dal contenuto HTML
  const extractImagesFromContent = (content: string): string[] => {
    const imgRegex = /<img[^>]+src="([^">]+)"/g;
    const images: string[] = [];
    let match;
    
    while ((match = imgRegex.exec(content)) !== null) {
      images.push(match[1]);
    }
    
    return images;
  };

  const parseWordPressXML = (xmlContent: string): WordPressPost[] => {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');

    // Check for parsing errors
    const parseError = xmlDoc.querySelector('parsererror');
    if (parseError) {
      throw new Error('File XML non valido');
    }

    const items = xmlDoc.querySelectorAll('item');
    const posts: WordPressPost[] = [];

    items.forEach(item => {
      const postType = item.querySelector('wp\\:post_type, post_type')?.textContent;
      const status = item.querySelector('wp\\:status, status')?.textContent;

      // Only import published posts (not pages/attachments)
      if (postType !== 'post') return;

      const title = item.querySelector('title')?.textContent || 'Senza titolo';
      const slug = item.querySelector('wp\\:post_name, post_name')?.textContent || 
                   title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const content = item.querySelector('content\\:encoded, encoded')?.textContent || '';
      const excerpt = item.querySelector('excerpt\\:encoded')?.textContent || 
                     content.substring(0, 200).replace(/<[^>]*>/g, '') + '...';
      
      const pubDateStr = item.querySelector('wp\\:post_date, post_date')?.textContent ||
                        item.querySelector('pubDate')?.textContent;
      
      // Validate date - WordPress uses 0000-00-00 for drafts/invalid dates
      let publishedAt = new Date();
      if (pubDateStr && pubDateStr !== '0000-00-00 00:00:00' && !pubDateStr.startsWith('0000-')) {
        const parsedDate = new Date(pubDateStr);
        if (!isNaN(parsedDate.getTime())) {
          publishedAt = parsedDate;
        }
      }

      // Extract categories and tags
      const categories = Array.from(item.querySelectorAll('category[domain="category"]'))
        .map(cat => cat.textContent || '')
        .filter(Boolean);
      const tags = Array.from(item.querySelectorAll('category[domain="post_tag"]'))
        .map(tag => tag.textContent || '')
        .filter(Boolean);

      posts.push({
        title,
        slug,
        content,
        excerpt,
        publishedAt,
        category: categories[0] || '',
        tags
      });
    });

    return posts;
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.xml')) {
      toast({
        title: "Errore",
        description: "Seleziona un file XML valido",
        variant: "destructive"
      });
      return;
    }

    setImporting(true);
    setProgress(0);
    setImportResult(null);

    try {
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          const xmlContent = e.target?.result as string;
          const posts = parseWordPressXML(xmlContent);

          if (posts.length === 0) {
            toast({
              title: "Nessun post trovato",
              description: "Il file XML non contiene post da importare",
              variant: "destructive"
            });
            setImporting(false);
            return;
          }

          toast({
            title: "Import in corso",
            description: `Trovati ${posts.length} post. Scaricamento immagini e importazione in corso...`
          });

          let successCount = 0;
          let failedCount = 0;

          for (let i = 0; i < posts.length; i++) {
            const post = posts[i];
            setProgress(Math.round(((i + 1) / posts.length) * 100));

            try {
              // Estrai immagini dal contenuto
              const images = extractImagesFromContent(post.content);
              let updatedContent = post.content;
              let coverImage = '';

              // Scarica e ricarica immagini
              for (const imageUrl of images) {
                // Salta immagini già su Firebase o relative
                if (imageUrl.includes('firebasestorage.googleapis.com') || imageUrl.startsWith('/')) {
                  continue;
                }

                const newUrl = await downloadAndReuploadImage(imageUrl, post.slug);
                updatedContent = updatedContent.replace(imageUrl, newUrl);
                
                // Usa la prima immagine come copertina se non specificata
                if (!coverImage && newUrl !== imageUrl) {
                  coverImage = newUrl;
                }
              }

              await addDoc(collection(db, 'blogPosts'), {
                title: post.title,
                slug: post.slug,
                excerpt: post.excerpt,
                content: updatedContent,
                coverImage: coverImage || undefined,
                status: BlogPostStatus.DRAFT, // Import as draft for review
                category: post.category,
                tags: post.tags,
                author: 'Gennaro Mazzacane',
                publishedAt: Timestamp.fromDate(post.publishedAt),
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
                metaTitle: post.title,
                metaDescription: post.excerpt
              });
              successCount++;
            } catch (error) {
              console.error(`Errore importazione post "${post.title}":`, error);
              failedCount++;
            }
          }

          setImportResult({ success: successCount, failed: failedCount });
          
          toast({
            title: "Import completato!",
            description: `${successCount} post importati con successo${failedCount > 0 ? `, ${failedCount} falliti` : ''}`,
            variant: successCount > 0 ? "default" : "destructive"
          });

          if (successCount > 0) {
            setTimeout(() => {
              setDialogOpen(false);
              onImportComplete();
            }, 2000);
          }

        } catch (error) {
          console.error('Errore parsing XML:', error);
          toast({
            title: "Errore",
            description: error instanceof Error ? error.message : "Impossibile processare il file XML",
            variant: "destructive"
          });
        } finally {
          setImporting(false);
        }
      };

      reader.readAsText(file);

    } catch (error) {
      console.error('Errore lettura file:', error);
      toast({
        title: "Errore",
        description: "Impossibile leggere il file",
        variant: "destructive"
      });
      setImporting(false);
    }
  };

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" data-testid="button-import-wordpress">
          <Upload className="h-4 w-4 mr-2" />
          Importa da WordPress
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Importa Post da WordPress</DialogTitle>
          <DialogDescription>
            Carica il file XML esportato dal tuo WordPress. Le immagini verranno scaricate automaticamente dal tuo vecchio sito e caricate su Firebase.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {!importing && !importResult && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="xml-file">File XML WordPress</Label>
                <Input
                  id="xml-file"
                  type="file"
                  accept=".xml"
                  onChange={handleFileUpload}
                  disabled={importing}
                  className="cursor-pointer"
                />
                <p className="text-sm text-muted-foreground mt-2">
                  Formato supportato: WordPress eXtended RSS (WXR)
                </p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Come esportare da WordPress:
                </h4>
                <ol className="text-sm space-y-1 list-decimal list-inside text-gray-700">
                  <li>Vai su <strong>Strumenti → Esporta</strong></li>
                  <li>Seleziona <strong>Post</strong></li>
                  <li>Clicca <strong>Scarica file di esportazione</strong></li>
                  <li>Carica il file XML qui</li>
                </ol>
              </div>
            </div>
          )}

          {importing && (
            <div className="space-y-4">
              <div className="text-center py-4">
                <Loader2 className="h-12 w-12 animate-spin text-sage mx-auto mb-4" />
                <p className="font-medium">Importazione in corso...</p>
                <p className="text-sm text-muted-foreground">Questo potrebbe richiedere alcuni minuti</p>
              </div>
              <Progress value={progress} className="h-2" />
              <p className="text-center text-sm text-muted-foreground">{progress}%</p>
            </div>
          )}

          {importResult && (
            <div className="space-y-4 py-4">
              <div className="text-center">
                {importResult.success > 0 ? (
                  <>
                    <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
                    <h3 className="font-semibold text-lg mb-2">Import Completato!</h3>
                    <p className="text-muted-foreground">
                      <strong>{importResult.success}</strong> post importati con successo
                    </p>
                    {importResult.failed > 0 && (
                      <p className="text-sm text-orange-600 mt-2">
                        {importResult.failed} post non importati (verifica i log della console)
                      </p>
                    )}
                    <p className="text-sm text-muted-foreground mt-4">
                      I post sono stati importati come <strong>Bozze</strong>. Rivedili prima di pubblicarli.
                    </p>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
                    <h3 className="font-semibold text-lg mb-2">Import Fallito</h3>
                    <p className="text-muted-foreground">
                      Nessun post importato. Verifica il file XML.
                    </p>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {!importing && !importResult && (
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Annulla
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
