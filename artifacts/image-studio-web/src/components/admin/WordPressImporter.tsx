import { useState } from 'react';
import { collection, doc, getDocs, Timestamp } from 'firebase/firestore';
import { db, storage } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, FileText, Loader2, CheckCircle, AlertCircle, Download } from 'lucide-react';
import { BlogPostStatus } from '@shared/schema';
import { Progress } from '@/components/ui/progress';
import { deleteObject, ref } from 'firebase/storage';
import { hasEmbeddedDataImages, sanitizeBlogHtml } from '@/lib/blog-html';
import { normalizeBlogSlug, writeBlogPostWithSlugReservation } from '@/lib/blog-slugs';

interface WordPressPost {
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  publishedAt: Date;
  category: string;
  tags: string[];
}

interface RehostedImage {
  url: string;
  storagePath?: string;
}

export default function WordPressImporter({ onImportComplete }: { onImportComplete: () => void }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [importResult, setImportResult] = useState<{ success: number; failed: number } | null>(null);
  const { toast } = useToast();

  const deleteUploadedPaths = async (paths: string[]) => {
    await Promise.allSettled([...new Set(paths)].map(async storagePath => {
      try {
        await deleteObject(ref(storage, storagePath));
      } catch (error) {
        console.warn('Pulizia immagine WordPress non riuscita:', storagePath, error);
      }
    }));
  };

  // Scarica l'immagine e restituisce sia URL sia path, necessario per il cleanup futuro.
  const downloadAndReuploadImage = async (imageUrl: string, storageFolder: string): Promise<RehostedImage> => {
    const requestedStoragePath = `blog-images/${storageFolder}/${doc(collection(db, 'blogAssetIds')).id}.jpg`;
    try {
      // L'API same-origin verifica admin, host pubblico e formato immagine prima dell'upload.
      const { auth } = await import('@/lib/firebase');
      
      console.log(`🔄 Download server-side: ${imageUrl}`);
      
      const user = auth.currentUser;
      if (!user) {
        throw new Error('Utente non autenticato');
      }
      
      const idToken = await user.getIdToken();
      
      const response = await fetch(
        '/api/blog/rehost-image',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
          },
          body: JSON.stringify({
            imageUrl,
            storagePath: requestedStoragePath,
          })
        }
      );
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success && data.url && data.storagePath === requestedStoragePath) {
        console.log(`✅ Immagine migrata: ${imageUrl} → Firebase`);
        return { url: data.url, storagePath: data.storagePath };
      }
      
      throw new Error('Download fallito');
      
    } catch (error: any) {
      console.error('❌ Errore download/upload immagine:', imageUrl, error);
      // Le versioni aggiornate della Function usano il path deciso dal client:
      // se la risposta si perde dopo l'upload, possiamo comunque ripulirlo.
      await deleteUploadedPaths([requestedStoragePath]);
      
      // Fallback: converti almeno a HTTPS
      const httpsUrl = imageUrl.replace('http://', 'https://');
      console.warn(`⚠️ Fallback a URL HTTPS: ${httpsUrl}`);
      return { url: httpsUrl };
    }
  };

  // Estrae URL immagini dal contenuto HTML
  const extractImagesFromContent = (content: string): string[] => {
    const imgRegex = /<img\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1/gi;
    const images: string[] = [];
    let match;
    
    while ((match = imgRegex.exec(content)) !== null) {
      images.push(match[2]);
    }
    
    return [...new Set(images)];
  };

  const reserveUniqueSlug = (value: string, title: string, usedSlugs: Set<string>): string => {
    const base = normalizeBlogSlug(value || title) || 'articolo';
    let candidate = base;
    let suffix = 2;
    while (usedSlugs.has(candidate)) {
      candidate = `${base}-${suffix++}`;
    }
    usedSlugs.add(candidate);
    return candidate;
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
          const existingPosts = await getDocs(collection(db, 'blogPosts'));
          const usedSlugs = new Set(
            existingPosts.docs
              .map(existing => existing.data().slug)
              .filter((slug): slug is string => typeof slug === 'string' && slug.length > 0)
              .map(normalizeBlogSlug)
          );

          for (let i = 0; i < posts.length; i++) {
            const post = posts[i];
            const postRef = doc(collection(db, 'blogPosts'));
            const uploadedPaths: string[] = [];
            const uniqueSlug = reserveUniqueSlug(post.slug, post.title, usedSlugs);
            setProgress(Math.round(((i + 1) / posts.length) * 100));

            try {
              // Estrai immagini dal contenuto
              const images = extractImagesFromContent(post.content);
              let updatedContent = post.content;
              let coverImage = '';
              let coverImagePath = '';
              const contentImagePaths: string[] = [];

              // Scarica e ricarica immagini
              for (const imageUrl of images) {
                // Salta immagini già su Firebase o relative
                if (imageUrl.includes('firebasestorage.googleapis.com') || imageUrl.startsWith('/')) {
                  continue;
                }

                const migratedImage = await downloadAndReuploadImage(imageUrl, postRef.id);
                updatedContent = updatedContent.split(imageUrl).join(migratedImage.url);
                if (migratedImage.storagePath) {
                  uploadedPaths.push(migratedImage.storagePath);
                  contentImagePaths.push(migratedImage.storagePath);
                }
                
                // Usa la prima immagine come copertina se non specificata
                if (!coverImage && migratedImage.url !== imageUrl) {
                  coverImage = migratedImage.url;
                  coverImagePath = migratedImage.storagePath || '';
                }
              }

              const sanitizedContent = sanitizeBlogHtml(updatedContent);
              if (hasEmbeddedDataImages(sanitizedContent)) {
                throw new Error('Il post contiene immagini Base64 non importabili');
              }
              const referencedImagePaths = contentImagePaths.filter(storagePath =>
                sanitizedContent.includes(storagePath) ||
                sanitizedContent.includes(encodeURIComponent(storagePath))
              );
              const retainedPaths = new Set([coverImagePath, ...referencedImagePaths].filter(Boolean));

              const importedPost: Record<string, unknown> = {
                title: post.title,
                slug: uniqueSlug,
                excerpt: post.excerpt,
                content: sanitizedContent,
                contentImagePaths: referencedImagePaths,
                status: BlogPostStatus.DRAFT, // Import as draft for review
                category: post.category,
                tags: post.tags,
                author: 'Gennaro Mazzacane',
                publishedAt: Timestamp.fromDate(post.publishedAt),
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
                metaTitle: post.title,
                metaDescription: post.excerpt
              };
              if (coverImage) importedPost.coverImage = coverImage;
              if (coverImagePath) importedPost.coverImagePath = coverImagePath;

              await writeBlogPostWithSlugReservation({
                postId: postRef.id,
                slug: uniqueSlug,
                data: importedPost,
                mode: 'create',
              });
              await deleteUploadedPaths(uploadedPaths.filter(path => !retainedPaths.has(path)));
              successCount++;
            } catch (error) {
              console.error(`Errore importazione post "${post.title}":`, error);
              await deleteUploadedPaths(uploadedPaths);
              usedSlugs.delete(uniqueSlug);
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
