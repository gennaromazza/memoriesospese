import { useState, useEffect, useRef } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, setDoc, query, orderBy, where, Timestamp, deleteField, writeBatch } from 'firebase/firestore';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

import { db, storage } from '@/lib/firebase';
import { ref, uploadString, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Edit, Trash2, FileText, Loader2, Eye, Calendar, Trash, Upload, ImagePlus, Code, FileJson } from 'lucide-react';
import { BlogPost, BlogPostStatus, insertBlogPostSchema } from '@shared/schema';
import WordPressImporter from './WordPressImporter';
import { compressImage } from '@/lib/imageCompression';

const FALLBACK_AUTHOR = 'Gennaro Mazzacane';
const SEO_CONTENT_LIMIT = 50000;

// Conserva nel documento una versione testuale leggera dell'articolo. In questo
// modo crawler e anteprime non devono scaricare HTML con immagini Base64 da vari MB.
const buildSeoContent = (html: string): string => {
  if (!html) return '';
  const container = document.createElement('div');
  container.innerHTML = html;
  container.querySelectorAll('script, style, noscript, template').forEach(node => node.remove());
  return (container.textContent || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, SEO_CONTENT_LIMIT);
};

// Stima tempo di lettura su testo pulito (HTML strippato)
const estimateReadTime = (content: string): number => {
  if (!content) return 0;
  const plainText = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const words = plainText.split(' ').filter(Boolean).length;
  return Math.ceil(words / 200);
};

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-yellow-500',
  published: 'bg-green-500',
  archived: 'bg-gray-500'
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Bozza',
  published: 'Pubblicato',
  archived: 'Archiviato'
};

export default function BlogManager() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<BlogPost | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [postToDelete, setPostToDelete] = useState<string | null>(null);
  const [selectedPosts, setSelectedPosts] = useState<Set<string>>(new Set());
  const [bulkActionDialogOpen, setBulkActionDialogOpen] = useState(false);
  const [bulkAction, setBulkAction] = useState<'publish' | 'delete' | null>(null);
  const [spamKeywords] = useState([
    'scommesse', 'bonus', 'casino', 'casinò', 'bet', 'poker', 'slot', 
    'bookmaker', 'quote', 'jackpot', 'giocodigitale', 'planetwin', 
    'eurobet', 'snai', 'betway', 'betn1', 'stake', 'merkur', 'novibet',
    'fantasyteam', 'betika', 'dobet', 'tipsport', 'betclic', 'fastbet',
    'zonagioco', 'gazzabet', '888', 'gioco d\'azzardo', 'roulette'
  ]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [showHtmlSource, setShowHtmlSource] = useState(false);
  // Counter per gestire race condition in openDialog (fetch asincrono da Storage)
  const openDialogCallRef = useRef(0);
  // Ref input file nascosto per import JSON
  const jsonImportInputRef = useRef<HTMLInputElement>(null);
  // Dialog "Incolla JSON"
  const [pasteJsonOpen, setPasteJsonOpen] = useState(false);
  const [pasteJsonText, setPasteJsonText] = useState('');
  const { toast } = useToast();

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    excerpt: '',
    content: '',
    coverImage: '',
    status: BlogPostStatus.DRAFT,
    category: '',
    tags: '',
    author: 'Gennaro Mazzacane',
    metaTitle: '',
    metaDescription: ''
  });

  useEffect(() => {
    loadPosts();
  }, []);

  const isSpam = (post: BlogPost): boolean => {
    const textToCheck = `${post.title} ${post.slug} ${post.excerpt} ${post.content}`.toLowerCase();
    return spamKeywords.some(keyword => textToCheck.includes(keyword.toLowerCase()));
  };

  const loadPosts = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'blogPosts'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      })) as BlogPost[];
      setPosts(data);
    } catch (error) {
      console.error('Errore caricamento blog:', error);
      toast({
        title: "Errore",
        description: "Impossibile caricare i post del blog",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      slug: '',
      excerpt: '',
      content: '',
      coverImage: '',
      status: BlogPostStatus.DRAFT,
      category: '',
      tags: '',
      author: 'Gennaro Mazzacane',
      metaTitle: '',
      metaDescription: ''
    });
    setEditingPost(null);
  };

  // Parsa testo JSON, valida e popola il form aprendo la dialog. Ritorna true se OK.
  const importArticleFromJsonText = (text: string, sourceLabel: string): boolean => {
    if (!text || !text.trim()) {
      toast({
        title: "Nessun contenuto",
        description: "Incolla o carica del testo JSON prima di importare.",
        variant: "destructive"
      });
      return false;
    }

    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      toast({
        title: "JSON non valido",
        description: "Il testo non contiene JSON valido. Controlla la sintassi.",
        variant: "destructive"
      });
      return false;
    }

    // Se è un array, prendi il primo elemento (consente sia oggetto singolo che array con 1 articolo)
    const data = Array.isArray(parsed) ? parsed[0] : parsed;
    if (!data || typeof data !== 'object') {
      toast({
        title: "Struttura non valida",
        description: "Il JSON deve essere un oggetto o un array di oggetti.",
        variant: "destructive"
      });
      return false;
    }

    // Validazione campi obbligatori
    const missing: string[] = [];
    if (!data.title || typeof data.title !== 'string' || !data.title.trim()) missing.push('title');
    if (!data.excerpt || typeof data.excerpt !== 'string' || !data.excerpt.trim()) missing.push('excerpt');
    if (!data.content || typeof data.content !== 'string' || !data.content.trim()) missing.push('content');
    if (missing.length > 0) {
      toast({
        title: "Campi obbligatori mancanti",
        description: `Manca: ${missing.join(', ')}. I campi obbligatori sono: title, excerpt, content.`,
        variant: "destructive"
      });
      return false;
    }

    // Normalizza tags (accetta array di stringhe o stringa CSV)
    let tagsString = '';
    if (Array.isArray(data.tags)) {
      tagsString = data.tags.filter((t: any) => typeof t === 'string').join(', ');
    } else if (typeof data.tags === 'string') {
      tagsString = data.tags;
    }

    // Normalizza status (default: draft)
    const allowedStatus = ['draft', 'published', 'archived'];
    const status = allowedStatus.includes(data.status)
      ? (data.status as BlogPostStatus)
      : BlogPostStatus.DRAFT;

    // Normalizza slug (genera dal titolo se mancante)
    const rawSlug = typeof data.slug === 'string' && data.slug.trim()
      ? data.slug
      : generateSlug(data.title);

    setEditingPost(null);
    setShowHtmlSource(false);
    setFormData({
      title: data.title.trim(),
      slug: normalizeSlug(rawSlug),
      excerpt: data.excerpt.trim(),
      content: data.content,
      coverImage: typeof data.coverImage === 'string' ? data.coverImage.trim() : '',
      status,
      category: typeof data.category === 'string' ? data.category.trim() : '',
      tags: tagsString,
      author: typeof data.author === 'string' && data.author.trim() ? data.author.trim() : 'Gennaro Mazzacane',
      metaTitle: typeof data.metaTitle === 'string' ? data.metaTitle.trim().slice(0, 60) : '',
      metaDescription: typeof data.metaDescription === 'string' ? data.metaDescription.trim().slice(0, 160) : ''
    });
    setDialogOpen(true);

    toast({
      title: "✅ Articolo caricato",
      description: `Campi compilati da ${sourceLabel}. Controlla e salva.`
    });
    return true;
  };

  // Importa un articolo da file JSON
  const handleJsonImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset input così lo stesso file può essere ricaricato dopo
    if (e.target) e.target.value = '';
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.json') && file.type !== 'application/json') {
      toast({
        title: "Formato non valido",
        description: "Seleziona un file con estensione .json",
        variant: "destructive"
      });
      return;
    }

    try {
      const text = await file.text();
      importArticleFromJsonText(text, `"${file.name}"`);
    } catch (err) {
      console.error('Errore lettura file JSON:', err);
      toast({
        title: "Errore lettura file",
        description: err instanceof Error ? err.message : 'Errore sconosciuto',
        variant: "destructive"
      });
    }
  };

  // Importa un articolo dal testo incollato nel dialog
  const handleJsonPasteImport = () => {
    const ok = importArticleFromJsonText(pasteJsonText, 'JSON incollato');
    if (ok) {
      setPasteJsonOpen(false);
      setPasteJsonText('');
    }
  };

  const openDialog = async (post?: BlogPost) => {
    // Incrementa il contatore ad ogni chiamata per invalidare fetch precedenti (race condition)
    const callId = ++openDialogCallRef.current;
    setShowHtmlSource(false); // Reset vista HTML ad ogni apertura del dialog

    if (post) {
      setEditingPost(post);
      let content = post.content || '';

      // Se il contenuto è su Storage, scaricalo prima di aprire l'editor
      if (post.contentUrl && !content) {
        try {
          const res = await fetch(post.contentUrl);
          const text = await res.text();
          // Scarta il risultato se nel frattempo è stata aperta un'altra dialog
          if (callId !== openDialogCallRef.current) return;
          content = text;
        } catch (e) {
          console.error('Errore caricamento contenuto da Storage:', e);
          if (callId !== openDialogCallRef.current) return;
        }
      }

      setFormData({
        title: post.title || '',
        slug: post.slug || '',
        excerpt: post.excerpt || '',
        content,
        coverImage: post.coverImage || '',
        status: post.status,
        category: post.category || '',
        tags: post.tags?.join(', ') || '',
        author: post.author || FALLBACK_AUTHOR,
        metaTitle: post.metaTitle || '',
        metaDescription: post.metaDescription || ''
      });
    } else {
      resetForm();
    }
    setDialogOpen(true);
  };

  const normalizeSlug = (slug: string) => {
    return slug
      .trim()
      .toLowerCase()
      .replace(/[àáâãäå]/g, 'a')
      .replace(/[èéêë]/g, 'e')
      .replace(/[ìíîï]/g, 'i')
      .replace(/[òóôõö]/g, 'o')
      .replace(/[ùúûü]/g, 'u')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  };

  const generateSlug = (title: string) => {
    return normalizeSlug(title);
  };

  const handleCoverImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;

    const file = e.target.files[0];
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Tipo di file non supportato",
        description: "Carica solo immagini (JPEG, PNG, ecc.)",
        variant: "destructive"
      });
      return;
    }

    try {
      setUploadingCover(true);
      
      // Comprimi l'immagine
      const compressedFile = await compressImage(file);
      
      // Upload su Firebase Storage
      const timestamp = Date.now();
      const sanitizedSlug = formData.slug || 'draft';
      const storagePath = `blog-covers/${sanitizedSlug}-${timestamp}.jpg`;
      const storageRef = ref(storage, storagePath);
      
      await uploadBytesResumable(storageRef, compressedFile);
      const downloadUrl = await getDownloadURL(storageRef);
      
      // Aggiorna form data
      setFormData(prev => ({ ...prev, coverImage: downloadUrl }));
      
      toast({
        title: "Immagine caricata",
        description: "Immagine di copertina caricata con successo"
      });
    } catch (error) {
      console.error('Errore caricamento immagine:', error);
      toast({
        title: "Errore",
        description: "Impossibile caricare l'immagine",
        variant: "destructive"
      });
    } finally {
      setUploadingCover(false);
    }
  };

  const handleTitleChange = (title: string) => {
    setFormData(prev => ({
      ...prev,
      title,
      slug: prev.slug || generateSlug(title)
    }));
  };

  const checkSlugUnique = async (slug: string, excludePostId?: string): Promise<boolean> => {
    const normalizedSlug = normalizeSlug(slug);
    const q = query(collection(db, 'blogPosts'), where('slug', '==', normalizedSlug));
    const snapshot = await getDocs(q);

    if (snapshot.empty) return true;

    // If editing, allow same slug for current post
    if (excludePostId) {
      return snapshot.docs.every(doc => doc.id === excludePostId);
    }

    return false;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Prepare data for validation
      const tagsArray = formData.tags
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);

      const dataToValidate: any = {
        title: formData.title,
        slug: normalizeSlug(formData.slug),
        excerpt: formData.excerpt,
        content: formData.content,
        status: formData.status,
        author: formData.author
      };

      // Aggiungi solo campi opzionali se hanno valori
      if (formData.coverImage?.trim()) {
        dataToValidate.coverImage = formData.coverImage;
      }
      if (formData.category?.trim()) {
        dataToValidate.category = formData.category;
      }
      if (tagsArray.length > 0) {
        dataToValidate.tags = tagsArray;
      }
      if (formData.metaTitle?.trim()) {
        dataToValidate.metaTitle = formData.metaTitle;
      }
      if (formData.metaDescription?.trim()) {
        dataToValidate.metaDescription = formData.metaDescription;
      }

      // Validate with Zod schema
      const validationResult = insertBlogPostSchema.safeParse(dataToValidate);

      if (!validationResult.success) {
        const firstError = validationResult.error.errors[0];
        toast({
          title: "Errore di Validazione",
          description: firstError.message,
          variant: "destructive"
        });
        setSaving(false);
        return;
      }

      // Check slug uniqueness
      const isUnique = await checkSlugUnique(validationResult.data.slug, editingPost?.id);
      if (!isUnique) {
        toast({
          title: "Errore",
          description: "Questo slug è già in uso. Scegline uno diverso.",
          variant: "destructive"
        });
        setSaving(false);
        return;
      }

      // Build Firestore payload with validated data
      const postData: any = {
        ...validationResult.data,
        seoContent: buildSeoContent(formData.content),
        updatedAt: Timestamp.now()
      };

      // Se il contenuto supera 800KB, salvalo su Firebase Storage
      const CONTENT_SIZE_LIMIT = 800000;
      const contentBytes = new Blob([formData.content]).size;
      if (contentBytes > CONTENT_SIZE_LIMIT) {
        // Per i nuovi post pre-genera l'ID Firestore così il path Storage coincide
        const targetId = editingPost?.id || doc(collection(db, 'blogPosts')).id;
        const storageRef = ref(storage, `blog-content/${targetId}.html`);
        await uploadString(storageRef, formData.content, 'raw', { contentType: 'text/html; charset=utf-8' });
        const downloadUrl = await getDownloadURL(storageRef);
        postData.contentUrl = downloadUrl;
        postData.content = '';
        // Salva con l'ID pre-generato se è un nuovo post
        if (!editingPost) {
          postData.createdAt = Timestamp.now();
          if (formData.status === BlogPostStatus.PUBLISHED) {
            postData.publishedAt = Timestamp.now();
          }
          await setDoc(doc(db, 'blogPosts', targetId), postData);
          toast({ title: "Successo", description: "Post creato con successo" });
          setDialogOpen(false);
          resetForm();
          loadPosts();
          return;
        }
      } else {
        // Se esisteva un contentUrl (post precedentemente grande ora ridotto), rimuovi il file da Storage
        if (editingPost && (editingPost as any).contentUrl) {
          postData.contentUrl = deleteField();
          // Prova a cancellare il file se il path è quello standard (ID-based)
          try {
            await deleteObject(ref(storage, `blog-content/${editingPost.id}.html`));
          } catch {
            // Il file potrebbe non esistere o avere un nome legacy — non blocca il salvataggio
          }
        }
      }

      if (editingPost) {
        // Imposta publishedAt solo alla prima pubblicazione
        if (formData.status === BlogPostStatus.PUBLISHED && editingPost.status !== BlogPostStatus.PUBLISHED) {
          postData.publishedAt = Timestamp.now();
        }
        // Rimuovi publishedAt se si torna a bozza o si archivia
        if ((formData.status === BlogPostStatus.DRAFT || formData.status === BlogPostStatus.ARCHIVED) && (editingPost as any).publishedAt) {
          postData.publishedAt = deleteField();
        }
        await updateDoc(doc(db, 'blogPosts', editingPost.id), postData);
        toast({ title: "Successo", description: "Post aggiornato con successo" });
      } else {
        postData.createdAt = Timestamp.now();
        if (formData.status === BlogPostStatus.PUBLISHED) {
          postData.publishedAt = Timestamp.now();
        }
        await addDoc(collection(db, 'blogPosts'), postData);
        toast({ title: "Successo", description: "Post creato con successo" });
      }

      setDialogOpen(false);
      resetForm();
      loadPosts();
    } catch (error) {
      console.error('Errore salvataggio post:', error);
      toast({
        title: "Errore",
        description: "Impossibile salvare il post",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const openDeleteDialog = (postId: string) => {
    setPostToDelete(postId);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!postToDelete) return;

    try {
      // Cancella il file HTML da Storage (path standard: blog-content/{id}.html)
      try {
        await deleteObject(ref(storage, `blog-content/${postToDelete}.html`));
      } catch {
        // Il file potrebbe non esistere (post piccoli o path legacy)
      }

      await deleteDoc(doc(db, 'blogPosts', postToDelete));

      // Reset dello stato
      setDeleteDialogOpen(false);
      setPostToDelete(null);

      // Ricarica immediatamente i post
      await loadPosts();

      // Mostra il toast dopo il refresh
      toast({
        title: "Eliminato",
        description: "Post eliminato con successo"
      });
    } catch (error) {
      console.error('Errore eliminazione post:', error);
      toast({
        title: "Errore",
        description: "Impossibile eliminare il post",
        variant: "destructive"
      });
    }
  };

  const togglePostSelection = (postId: string) => {
    setSelectedPosts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(postId)) {
        newSet.delete(postId);
      } else {
        newSet.add(postId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedPosts.size === filteredPosts.length) {
      setSelectedPosts(new Set());
    } else {
      setSelectedPosts(new Set(filteredPosts.map(p => p.id)));
    }
  };

  const handleBulkPublish = () => {
    setBulkAction('publish');
    setBulkActionDialogOpen(true);
  };

  const handleBulkDelete = () => {
    setBulkAction('delete');
    setBulkActionDialogOpen(true);
  };

  const detectAndSelectSpam = () => {
    const spamPosts = filteredPosts.filter(post => isSpam(post));
    setSelectedPosts(new Set(spamPosts.map(p => p.id)));
    toast({
      title: "SPAM Rilevato",
      description: `${spamPosts.length} post sospetti selezionati automaticamente`,
    });
  };

  const executeBulkAction = async () => {
    if (!bulkAction || selectedPosts.size === 0) return;

    try {
      const postIds = Array.from(selectedPosts);
      const CHUNK_SIZE = 400; // Limite sicuro per evitare "Transaction too big"
      let successCount = 0;

      // Dividi in chunks per evitare limite Firebase
      for (let i = 0; i < postIds.length; i += CHUNK_SIZE) {
        const chunk = postIds.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);

        if (bulkAction === 'publish') {
          chunk.forEach(postId => {
            const postRef = doc(db, 'blogPosts', postId);
            const existingPost = posts.find(p => p.id === postId);
            // Imposta publishedAt solo se il post non era già pubblicato (preserva data originale)
            const alreadyPublished = existingPost?.status === BlogPostStatus.PUBLISHED;
            batch.update(postRef, {
              status: BlogPostStatus.PUBLISHED,
              ...(alreadyPublished ? {} : { publishedAt: Timestamp.now() }),
              updatedAt: Timestamp.now()
            });
          });
        } else if (bulkAction === 'delete') {
          chunk.forEach(postId => {
            const postRef = doc(db, 'blogPosts', postId);
            batch.delete(postRef);
          });
        }

        await batch.commit();
        successCount += chunk.length;
      }

      // Reset dello stato prima di mostrare il toast
      setSelectedPosts(new Set());
      setBulkActionDialogOpen(false);
      setBulkAction(null);

      // Ricarica immediatamente i post
      await loadPosts();

      // Mostra il toast dopo il refresh
      toast({
        title: "Successo",
        description: bulkAction === 'publish' 
          ? `${successCount} post pubblicati con successo`
          : `${successCount} post eliminati con successo`
      });
    } catch (error) {
      console.error('Errore bulk action:', error);
      toast({
        title: "Errore",
        description: "Impossibile completare l'operazione",
        variant: "destructive"
      });
    }
  };

  const filteredPosts = filterStatus === 'all' 
    ? posts 
    : posts.filter(p => p.status === filterStatus);

  // Paginazione
  const totalPages = Math.ceil(filteredPosts.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedPosts = filteredPosts.slice(startIndex, endIndex);

  // Reset pagina quando cambia il filtro
  useEffect(() => {
    setCurrentPage(1);
  }, [filterStatus]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Blog</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Gestisci gli articoli del blog - {posts.length} post totali
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <WordPressImporter onImportComplete={loadPosts} />

          <input
            ref={jsonImportInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleJsonImport}
            className="hidden"
            data-testid="input-import-json"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => jsonImportInputRef.current?.click()}
            data-testid="button-import-json"
          >
            <FileJson className="h-4 w-4 mr-2" />
            Carica JSON
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={() => setPasteJsonOpen(true)}
            data-testid="button-paste-json"
          >
            <Code className="h-4 w-4 mr-2" />
            Incolla JSON
          </Button>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => openDialog()} data-testid="button-create-post">
                <Plus className="h-4 w-4 mr-2" />
                Nuovo Post
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingPost ? 'Modifica Post' : 'Nuovo Post'}
              </DialogTitle>
              <DialogDescription>
                Compila i campi per creare o modificare un post del blog
              </DialogDescription>
            </DialogHeader>

            <Tabs defaultValue="content" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="content">Contenuto</TabsTrigger>
                <TabsTrigger value="seo">SEO</TabsTrigger>
                <TabsTrigger value="preview">Anteprima</TabsTrigger>
              </TabsList>

              <TabsContent value="content" className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Label>Titolo *</Label>
                    <Input
                      value={formData.title}
                      onChange={(e) => handleTitleChange(e.target.value)}
                      placeholder="Titolo del post"
                      data-testid="input-title"
                    />
                  </div>

                  <div className="col-span-2">
                    <Label>Slug URL *</Label>
                    <Input
                      value={formData.slug}
                      onChange={(e) => setFormData(prev => ({ ...prev, slug: e.target.value }))}
                      placeholder="slug-url-friendly"
                      data-testid="input-slug"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      URL: /blog/{formData.slug || 'slug'}
                    </p>
                  </div>

                  <div className="col-span-2">
                    <Label>Riassunto *</Label>
                    <Textarea
                      value={formData.excerpt}
                      onChange={(e) => setFormData(prev => ({ ...prev, excerpt: e.target.value }))}
                      placeholder="Breve descrizione del post (max 200 caratteri)"
                      rows={3}
                      maxLength={200}
                      data-testid="input-excerpt"
                    />
                  </div>

                  <div className="col-span-2">
                    <div className="flex items-center justify-between mb-1">
                      <Label>Contenuto *</Label>
                      <button
                        type="button"
                        onClick={() => setShowHtmlSource(v => !v)}
                        className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border transition-colors ${showHtmlSource ? 'bg-sage-700 text-white border-sage-700' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
                        title={showHtmlSource ? 'Torna alla vista visuale' : 'Modifica sorgente HTML'}
                      >
                        <Code className="h-3.5 w-3.5" />
                        {showHtmlSource ? 'Vista Visuale' : 'Sorgente HTML'}
                      </button>
                    </div>

                    {showHtmlSource ? (
                      <textarea
                        className="w-full font-mono text-xs border rounded-md p-3 bg-gray-950 text-green-400 resize-y focus:outline-none focus:ring-2 focus:ring-sage-500"
                        style={{ minHeight: '360px' }}
                        value={formData.content}
                        onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                        placeholder="Incolla qui il tuo HTML..."
                        spellCheck={false}
                      />
                    ) : (
                      <div className="border rounded-md">
                        <ReactQuill
                          theme="snow"
                          value={formData.content}
                          onChange={(value) => {
                            setFormData(prev => ({ ...prev, content: value }));
                          }}
                          modules={{
                            toolbar: [
                              [{ 'header': [1, 2, 3, false] }],
                              ['bold', 'italic', 'underline', 'strike'],
                              ['link', 'image', 'video'],
                              [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                              ['blockquote', 'code-block'],
                              [{ 'align': [] }],
                              [{ 'color': [] }, { 'background': [] }],
                              ['clean']
                            ]
                          }}
                          formats={[
                            'header',
                            'bold', 'italic', 'underline', 'strike',
                            'link', 'image', 'video',
                            'list',
                            'blockquote', 'code-block',
                            'align',
                            'color', 'background'
                          ]}
                          style={{ minHeight: '300px' }}
                        />
                      </div>
                    )}
                  </div>

                  <div>
                    <Label>Stato</Label>
                    <Select value={formData.status} onValueChange={(v) => setFormData(prev => ({ ...prev, status: v as BlogPostStatus }))}>
                      <SelectTrigger data-testid="select-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={BlogPostStatus.DRAFT}>Bozza</SelectItem>
                        <SelectItem value={BlogPostStatus.PUBLISHED}>Pubblicato</SelectItem>
                        <SelectItem value={BlogPostStatus.ARCHIVED}>Archiviato</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Autore</Label>
                    <Input
                      value={formData.author}
                      onChange={(e) => setFormData(prev => ({ ...prev, author: e.target.value }))}
                      data-testid="input-author"
                    />
                  </div>

                  <div>
                    <Label>Categoria</Label>
                    <Input
                      value={formData.category}
                      onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                      placeholder="es. Matrimoni, Consigli"
                      data-testid="input-category"
                    />
                  </div>

                  <div>
                    <Label>Tags (separati da virgola)</Label>
                    <Input
                      value={formData.tags}
                      onChange={(e) => setFormData(prev => ({ ...prev, tags: e.target.value }))}
                      placeholder="tag1, tag2, tag3"
                      data-testid="input-tags"
                    />
                  </div>

                  <div className="col-span-2">
                    <Label>Immagine Copertina</Label>
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => document.getElementById('cover-upload')?.click()}
                          disabled={uploadingCover}
                        >
                          {uploadingCover ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Caricamento...
                            </>
                          ) : (
                            <>
                              <ImagePlus className="h-4 w-4 mr-2" />
                              Sfoglia
                            </>
                          )}
                        </Button>
                        <Input
                          id="cover-upload"
                          type="file"
                          accept="image/*"
                          onChange={handleCoverImageUpload}
                          className="hidden"
                        />
                        <Input
                          value={formData.coverImage}
                          onChange={(e) => setFormData(prev => ({ ...prev, coverImage: e.target.value }))}
                          placeholder="oppure incolla URL"
                          data-testid="input-cover-image"
                          className="flex-1"
                        />
                      </div>
                      {formData.coverImage && (
                        <div className="relative">
                          <img 
                            src={formData.coverImage} 
                            alt="Anteprima" 
                            className="w-full h-40 object-cover rounded border"
                            onLoad={(e) => {
                              const img = e.target as HTMLImageElement;
                              const width = img.naturalWidth;
                              const height = img.naturalHeight;
                              const ratio = (width / height).toFixed(2);
                              const tooltip = document.getElementById('cover-image-tooltip');
                              if (tooltip) {
                                tooltip.textContent = `${width}×${height}px (${ratio}:1)`;
                              }
                            }}
                          />
                          <div className="absolute top-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                            <span id="cover-image-tooltip">Caricamento...</span>
                          </div>
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground">
                        💡 Dimensioni consigliate: 1200×630px (rapporto 1.91:1) per social media
                      </p>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="seo" className="space-y-4 py-4">
                <div className="space-y-4">
                  <div>
                    <Label>Meta Title SEO</Label>
                    <Input
                      value={formData.metaTitle}
                      onChange={(e) => setFormData(prev => ({ ...prev, metaTitle: e.target.value }))}
                      placeholder="Se vuoto, usa il titolo del post"
                      maxLength={60}
                      data-testid="input-meta-title"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {formData.metaTitle.length}/60 caratteri
                    </p>
                  </div>

                  <div>
                    <Label>Meta Description SEO</Label>
                    <Textarea
                      value={formData.metaDescription}
                      onChange={(e) => setFormData(prev => ({ ...prev, metaDescription: e.target.value }))}
                      placeholder="Se vuoto, usa il riassunto"
                      rows={3}
                      maxLength={160}
                      data-testid="input-meta-description"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {formData.metaDescription.length}/160 caratteri
                    </p>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="preview" className="space-y-4 py-4">
                <div className="border rounded-lg p-6 bg-white max-h-[500px] overflow-y-auto">
                  <div className="prose prose-lg max-w-none">
                    {formData.coverImage && (
                      <img 
                        src={formData.coverImage} 
                        alt="Copertina"
                        className="w-full h-64 object-cover rounded-lg mb-6"
                      />
                    )}

                    <h1 className="text-4xl font-playfair mb-4">{formData.title || 'Titolo del post'}</h1>

                    <div className="flex items-center gap-4 text-sm text-gray-600 mb-6">
                      <span>👤 {formData.author}</span>
                      {formData.category && <span>📁 {formData.category}</span>}
                      <span>⏱️ {estimateReadTime(formData.content)} min</span>
                    </div>

                    {formData.excerpt && (
                      <p className="text-xl italic text-gray-600 border-l-4 border-sage pl-4 mb-6">
                        {formData.excerpt}
                      </p>
                    )}

                    <div 
                      dangerouslySetInnerHTML={{ __html: formData.content || '<p class="text-gray-400">Il contenuto apparirà qui...</p>' }}
                      className="blog-content"
                    />

                    {formData.tags && (
                      <div className="flex gap-2 mt-8 pt-6 border-t">
                        {formData.tags.split(',').map(tag => tag.trim()).filter(Boolean).map(tag => (
                          <Badge key={tag} variant="secondary">{tag}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Annulla
              </Button>
              <Button onClick={handleSave} disabled={saving} data-testid="button-save-post">
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Salvataggio...
                  </>
                ) : (
                  editingPost ? 'Aggiorna Post' : 'Crea Post'
                )}
              </Button>
            </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

      <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center">
        <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center w-full lg:w-auto">
          <Label className="whitespace-nowrap">Filtra per stato:</Label>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-full sm:w-48" data-testid="filter-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti ({posts.length})</SelectItem>
              <SelectItem value="draft">Bozze ({posts.filter(p => p.status === 'draft').length})</SelectItem>
              <SelectItem value="published">Pubblicati ({posts.filter(p => p.status === 'published').length})</SelectItem>
              <SelectItem value="archived">Archiviati ({posts.filter(p => p.status === 'archived').length})</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {filteredPosts.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto flex-wrap">
            <div className="flex items-center gap-2">
              <Checkbox
                id="select-all"
                checked={selectedPosts.size === filteredPosts.length && filteredPosts.length > 0}
                onCheckedChange={toggleSelectAll}
              />
              <Label htmlFor="select-all" className="cursor-pointer text-sm">
                {selectedPosts.size === filteredPosts.length && filteredPosts.length > 0
                  ? `Deseleziona tutti (${selectedPosts.size})`
                  : `Seleziona tutti i ${filteredPosts.length} post filtrati`}
              </Label>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={detectAndSelectSpam}
              className="border-red-500 text-red-600 hover:bg-red-50 w-full sm:w-auto"
            >
              🚫 Rileva SPAM
            </Button>

            {selectedPosts.size > 0 && (
              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleBulkPublish}
                  className="bg-green-600 hover:bg-green-700 w-full sm:w-auto"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Pubblica Selezionati
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleBulkDelete}
                  className="w-full sm:w-auto"
                >
                  <Trash className="h-4 w-4 mr-2" />
                  Elimina Selezionati
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {filteredPosts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {filterStatus === 'all' 
                ? 'Nessun post nel blog. Clicca "Nuovo Post" per iniziare.' 
                : 'Nessun post con questo stato.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4">
            {paginatedPosts.map(post => (
              <Card key={post.id} className={selectedPosts.has(post.id) ? 'border-sage border-2' : ''}>
                <CardHeader>
                  <div className="flex flex-col gap-3">
                    <div className="flex justify-between items-start gap-3">
                      <div className="flex gap-3 flex-1 min-w-0">
                        <Checkbox
                          checked={selectedPosts.has(post.id)}
                          onCheckedChange={() => togglePostSelection(post.id)}
                          className="mt-1 flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <CardTitle className="text-lg md:text-xl break-words">{post.title}</CardTitle>
                            <Badge className={STATUS_COLORS[post.status]}>
                              {STATUS_LABELS[post.status]}
                            </Badge>
                            {isSpam(post) && (
                              <Badge variant="destructive" className="bg-red-600">
                                SPAM
                              </Badge>
                            )}
                          </div>
                          <CardDescription className="flex flex-wrap items-center gap-2 md:gap-4 text-sm">
                            <span className="break-all">/{post.slug}</span>
                            {post.category && <span className="hidden sm:inline">·</span>}
                            {post.category && <span>{post.category}</span>}
                            {post.publishedAt && (
                              <>
                                <span className="hidden sm:inline">·</span>
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {new Date(post.publishedAt.seconds * 1000).toLocaleDateString('it-IT')}
                                </span>
                              </>
                            )}
                          </CardDescription>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
                      {post.status === 'published' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(`/blog/${post.slug}`, '_blank')}
                          data-testid={`button-view-${post.id}`}
                          className="w-full sm:w-auto"
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          Visualizza
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openDialog(post)}
                        data-testid={`button-edit-${post.id}`}
                        className="w-full sm:w-auto"
                      >
                        <Edit className="h-4 w-4 mr-2" />
                        Modifica
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => openDeleteDialog(post.id)}
                        data-testid={`button-delete-${post.id}`}
                        className="w-full sm:w-auto"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Elimina
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground line-clamp-2">{post.excerpt}</p>
                  {post.tags && post.tags.length > 0 && (
                    <div className="flex gap-2 mt-3">
                      {post.tags.map(tag => (
                        <Badge key={tag} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row justify-center items-center gap-3 mt-6">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  ← Prec
                </Button>

                <div className="flex gap-1 overflow-x-auto max-w-[200px] sm:max-w-none">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                    <Button
                      key={page}
                      variant={currentPage === page ? "default" : "outline"}
                      size="sm"
                      onClick={() => setCurrentPage(page)}
                      className="w-10 flex-shrink-0"
                    >
                      {page}
                    </Button>
                  ))}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Succ →
                </Button>
              </div>

              <span className="text-sm text-muted-foreground text-center">
                Pagina {currentPage} di {totalPages} ({filteredPosts.length} post)
              </span>
            </div>
          )}
        </>
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma Eliminazione</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare questo post? Questa azione non può essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkActionDialogOpen} onOpenChange={setBulkActionDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {bulkAction === 'publish' ? 'Conferma Pubblicazione Multipla' : 'Conferma Eliminazione Multipla'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {bulkAction === 'publish' 
                ? `Sei sicuro di voler pubblicare ${selectedPosts.size} post selezionati?`
                : `Sei sicuro di voler eliminare ${selectedPosts.size} post selezionati? Questa azione non può essere annullata.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction 
              onClick={executeBulkAction}
              className={bulkAction === 'delete' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
            >
              {bulkAction === 'publish' ? 'Pubblica' : 'Elimina'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={pasteJsonOpen} onOpenChange={(open) => {
        setPasteJsonOpen(open);
        if (!open) setPasteJsonText('');
      }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Incolla JSON Articolo</DialogTitle>
            <DialogDescription>
              Incolla il contenuto del file JSON generato dal tuo script Python. I campi obbligatori sono <code>title</code>, <code>excerpt</code> e <code>content</code>.
            </DialogDescription>
          </DialogHeader>
          <textarea
            value={pasteJsonText}
            onChange={(e) => setPasteJsonText(e.target.value)}
            placeholder='{\n  "title": "...",\n  "excerpt": "...",\n  "content": "<p>...</p>",\n  "tags": ["tag1", "tag2"],\n  "status": "draft"\n}'
            className="w-full font-mono text-xs border rounded-md p-3 bg-gray-950 text-green-400 resize-y focus:outline-none focus:ring-2 focus:ring-sage-500"
            style={{ minHeight: '320px' }}
            spellCheck={false}
            data-testid="textarea-paste-json"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPasteJsonOpen(false); setPasteJsonText(''); }}>
              Annulla
            </Button>
            <Button onClick={handleJsonPasteImport} data-testid="button-confirm-paste-json">
              <FileJson className="h-4 w-4 mr-2" />
              Importa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
