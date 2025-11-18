import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy, where, Timestamp, deleteField } from 'firebase/firestore';

import { db } from '@/lib/firebase';
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
import { Plus, Edit, Trash2, FileText, Loader2, Eye, Calendar } from 'lucide-react';
import { BlogPost, BlogPostStatus, insertBlogPostSchema, InsertBlogPost } from '@shared/schema';
import WordPressImporter from './WordPressImporter';

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
  const { toast } = useToast();

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    excerpt: '',
    content: '',
    coverImage: '',
    status: 'draft' as const,
    category: '',
    tags: '',
    author: 'Gennaro Mazzacane',
    metaTitle: '',
    metaDescription: ''
  });

  useEffect(() => {
    loadPosts();
  }, []);

  const loadPosts = async () => {
    try {
      const q = query(collection(db, 'blogPosts'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
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
      status: 'draft',
      category: '',
      tags: '',
      author: 'Gennaro Mazzacane',
      metaTitle: '',
      metaDescription: ''
    });
    setEditingPost(null);
  };

  const openDialog = (post?: BlogPost) => {
    if (post) {
      setEditingPost(post);
      setFormData({
        title: post.title,
        slug: post.slug,
        excerpt: post.excerpt,
        content: post.content,
        coverImage: post.coverImage || '',
        status: post.status,
        category: post.category || '',
        tags: post.tags?.join(', ') || '',
        author: post.author,
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

      const dataToValidate = {
        title: formData.title,
        slug: normalizeSlug(formData.slug),
        excerpt: formData.excerpt,
        content: formData.content,
        coverImage: formData.coverImage || undefined,
        status: formData.status,
        category: formData.category || undefined,
        tags: tagsArray.length > 0 ? tagsArray : undefined,
        author: formData.author,
        metaTitle: formData.metaTitle || undefined,
        metaDescription: formData.metaDescription || undefined
      };

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
        updatedAt: Timestamp.now()
      };

      if (editingPost) {
        // Update existing post
        // Set publishedAt only when publishing for the first time
        if (formData.status === BlogPostStatus.PUBLISHED && editingPost.status !== BlogPostStatus.PUBLISHED) {
          postData.publishedAt = Timestamp.now();
        }
        // Clear publishedAt when reverting to draft or archiving
        if ((formData.status === BlogPostStatus.DRAFT || formData.status === BlogPostStatus.ARCHIVED) && editingPost.publishedAt) {
          postData.publishedAt = deleteField();
        }
        await updateDoc(doc(db, 'blogPosts', editingPost.id), postData);
        toast({
          title: "Successo",
          description: "Post aggiornato con successo"
        });
      } else {
        // Create new post
        postData.createdAt = Timestamp.now();
        if (formData.status === BlogPostStatus.PUBLISHED) {
          postData.publishedAt = Timestamp.now();
        }
        await addDoc(collection(db, 'blogPosts'), postData);
        toast({
          title: "Successo",
          description: "Post creato con successo"
        });
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
      await deleteDoc(doc(db, 'blogPosts', postToDelete));
      toast({
        title: "Eliminato",
        description: "Post eliminato con successo"
      });
      setDeleteDialogOpen(false);
      setPostToDelete(null);
      loadPosts();
    } catch (error) {
      console.error('Errore eliminazione post:', error);
      toast({
        title: "Errore",
        description: "Impossibile eliminare il post",
        variant: "destructive"
      });
    }
  };

  const filteredPosts = filterStatus === 'all' 
    ? posts 
    : posts.filter(p => p.status === filterStatus);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold">Blog</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Gestisci gli articoli del blog - {posts.length} post totali
          </p>
        </div>
        
        <div className="flex gap-2">
          <WordPressImporter onImportComplete={loadPosts} />
          
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
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="content">Contenuto</TabsTrigger>
                <TabsTrigger value="seo">SEO</TabsTrigger>
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
                    <Label>Contenuto HTML *</Label>
                    <Textarea
                      value={formData.content}
                      onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                      placeholder="Contenuto completo del post in HTML"
                      rows={12}
                      className="font-mono text-sm"
                      data-testid="input-content"
                    />
                  </div>

                  <div>
                    <Label>Stato</Label>
                    <Select value={formData.status} onValueChange={(v) => setFormData(prev => ({ ...prev, status: v as any }))}>
                      <SelectTrigger data-testid="select-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">Bozza</SelectItem>
                        <SelectItem value="published">Pubblicato</SelectItem>
                        <SelectItem value="archived">Archiviato</SelectItem>
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
                    <Label>Immagine Copertina URL</Label>
                    <Input
                      value={formData.coverImage}
                      onChange={(e) => setFormData(prev => ({ ...prev, coverImage: e.target.value }))}
                      placeholder="https://..."
                      data-testid="input-cover-image"
                    />
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
        </Dialog>
      </div>

      <div className="flex gap-2 items-center">
        <Label>Filtra per stato:</Label>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-48" data-testid="filter-status">
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
        <div className="grid gap-4">
          {filteredPosts.map(post => (
            <Card key={post.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <CardTitle className="text-xl">{post.title}</CardTitle>
                      <Badge className={STATUS_COLORS[post.status]}>
                        {STATUS_LABELS[post.status]}
                      </Badge>
                    </div>
                    <CardDescription className="flex items-center gap-4 text-sm">
                      <span>/{post.slug}</span>
                      {post.category && <span>· {post.category}</span>}
                      {post.publishedAt && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(post.publishedAt.seconds * 1000).toLocaleDateString('it-IT')}
                        </span>
                      )}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    {post.status === 'published' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(`/blog/${post.slug}`, '_blank')}
                        data-testid={`button-view-${post.id}`}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openDialog(post)}
                      data-testid={`button-edit-${post.id}`}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => openDeleteDialog(post.id)}
                      data-testid={`button-delete-${post.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
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
    </div>
  );
}
