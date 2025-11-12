/**
 * ProductsManager - Gestione Catalogo Prodotti Fotografici
 */

import { useState, useEffect, useRef } from 'react';
import { Plus, Edit, Trash2, Package, Euro, Image, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import imageCompression from 'browser-image-compression';
import { storage } from '@/lib/firebase';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  getAllProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  useProductCategories,
} from '@/lib/products';
import type { Product, InsertProduct } from '@shared/booking-types';

export default function ProductsManager() {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Carica TUTTE le categorie prodotti da Firestore (anche quelle disattivate per editing)
  const { data: allCategories = [], isLoading: categoriesLoading } = useProductCategories();
  
  // Filtra solo categorie attive per il dropdown
  const activeCategories = allCategories.filter(cat => cat.attivo);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  
  // Filtro per categoria
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  
  // Form state
  const [formData, setFormData] = useState<InsertProduct>({
    nome: '',
    descrizione: '',
    prezzo: 0,
    sconto: 0,
    numeroFoto: 0,
    categoria: 'album',
    attivo: true,
    immagini: [],
  });

  // Upload immagini
  const [uploadingImages, setUploadingImages] = useState(false);
  const [productImages, setProductImages] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { toast } = useToast();

  // Carica prodotti
  useEffect(() => {
    loadProducts();
  }, []);

  async function loadProducts() {
    try {
      setIsLoading(true);
      const data = await getAllProducts();
      setProducts(data);
    } catch (error) {
      console.error('Errore caricamento prodotti:', error);
      toast({
        title: 'Errore',
        description: 'Impossibile caricare i prodotti',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }

  function openCreateDialog() {
    setEditingProduct(null);
    setFormData({
      nome: '',
      descrizione: '',
      prezzo: 0,
      sconto: 0,
      numeroFoto: 0,
      categoria: activeCategories[0]?.value || '', // Prima categoria attiva disponibile o stringa vuota
      attivo: true,
      immagini: [],
    });
    setProductImages([]);
    setIsDialogOpen(true);
  }

  function openEditDialog(product: Product) {
    setEditingProduct(product);
    setFormData({
      nome: product.nome,
      descrizione: product.descrizione,
      prezzo: product.prezzo,
      sconto: product.sconto,
      numeroFoto: product.numeroFoto,
      categoria: product.categoria,
      attivo: product.attivo,
      immagini: product.immagini || [],
    });
    setProductImages(product.immagini || []);
    setIsDialogOpen(true);
  }

  // Comprimi e carica immagini prodotto
  async function handleImageUpload(files: FileList | null) {
    if (!files || files.length === 0) return;

    // Limite massimo 5 immagini per prodotto
    if (productImages.length + files.length > 5) {
      toast({
        title: 'Limite raggiunto',
        description: 'Puoi caricare massimo 5 immagini per prodotto',
        variant: 'destructive',
      });
      return;
    }

    setUploadingImages(true);

    try {
      const uploadedUrls: string[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // Validazione tipo file
        if (!file.type.startsWith('image/')) {
          toast({
            title: 'File non valido',
            description: `${file.name} non è un'immagine`,
            variant: 'destructive',
          });
          continue;
        }

        // Comprimi immagine
        const options = {
          maxSizeMB: 0.5, // Max 500KB
          maxWidthOrHeight: 1200,
          useWebWorker: true,
        };

        const compressedFile = await imageCompression(file, options);

        // Upload a Firebase Storage
        const timestamp = Date.now();
        const randomId = Math.random().toString(36).substring(7);
        const fileName = `product_${timestamp}_${randomId}.jpg`;
        const storagePath = `products/temp/${fileName}`; // Temp finché prodotto non è salvato
        const storageRef = ref(storage, storagePath);

        await uploadBytes(storageRef, compressedFile);
        const downloadURL = await getDownloadURL(storageRef);

        uploadedUrls.push(downloadURL);
      }

      // Aggiorna stato immagini
      const newImages = [...productImages, ...uploadedUrls];
      setProductImages(newImages);
      setFormData({ ...formData, immagini: newImages });

      toast({
        title: 'Immagini caricate',
        description: `${uploadedUrls.length} ${uploadedUrls.length === 1 ? 'immagine caricata' : 'immagini caricate'} con successo`,
      });
    } catch (error) {
      console.error('Errore upload immagini:', error);
      toast({
        title: 'Errore upload',
        description: 'Impossibile caricare le immagini',
        variant: 'destructive',
      });
    } finally {
      setUploadingImages(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  // Rimuovi immagine
  function handleRemoveImage(imageUrl: string) {
    const newImages = productImages.filter(url => url !== imageUrl);
    setProductImages(newImages);
    setFormData({ ...formData, immagini: newImages });
  }

  async function handleSave() {
    // Validazione
    if (!formData.nome.trim()) {
      toast({
        title: 'Errore',
        description: 'Il nome del prodotto è obbligatorio',
        variant: 'destructive',
      });
      return;
    }

    if (formData.prezzo <= 0) {
      toast({
        title: 'Errore',
        description: 'Il prezzo deve essere maggiore di zero',
        variant: 'destructive',
      });
      return;
    }

    if (formData.sconto < 0 || formData.sconto > 100) {
      toast({
        title: 'Errore',
        description: 'Lo sconto deve essere tra 0% e 100%',
        variant: 'destructive',
      });
      return;
    }

    if (formData.numeroFoto < 0) {
      toast({
        title: 'Errore',
        description: 'Il numero di foto non può essere negativo',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsSaving(true);

      if (editingProduct) {
        // Modifica
        await updateProduct(editingProduct.id, formData);
        toast({
          title: 'Prodotto aggiornato',
          description: `Il prodotto "${formData.nome}" è stato modificato con successo`,
        });
      } else {
        // Creazione
        await createProduct(formData);
        toast({
          title: 'Prodotto creato',
          description: `Il prodotto "${formData.nome}" è stato creato con successo`,
        });
      }

      setIsDialogOpen(false);
      await loadProducts();
    } catch (error) {
      console.error('Errore salvataggio prodotto:', error);
      toast({
        title: 'Errore',
        description: 'Impossibile salvare il prodotto',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteProduct(id);
      toast({
        title: 'Prodotto eliminato',
        description: 'Il prodotto è stato eliminato con successo',
      });
      setDeleteConfirmId(null);
      await loadProducts();
    } catch (error) {
      console.error('Errore eliminazione prodotto:', error);
      toast({
        title: 'Errore',
        description: 'Impossibile eliminare il prodotto',
        variant: 'destructive',
      });
    }
  }

  const prezzoFinale = formData.prezzo - (formData.prezzo * formData.sconto / 100);

  // Filtra prodotti per categoria
  const filteredProducts = products.filter(product => {
    if (categoryFilter === 'all') return true;
    return product.categoria === categoryFilter;
  });

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-48 bg-muted rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Package className="h-6 w-6" />
            Catalogo Prodotti
          </h2>
          <p className="text-muted-foreground mt-1">
            Gestisci i prodotti fotografici disponibili per le prenotazioni
          </p>
        </div>
        <Button onClick={openCreateDialog} data-testid="button-create-product">
          <Plus className="h-4 w-4 mr-2" />
          Nuovo Prodotto
        </Button>
      </div>

      {/* Filtro Categoria */}
      <div className="flex gap-2 items-center">
        <Label htmlFor="category-filter">Filtra per categoria:</Label>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-64" id="category-filter" data-testid="select-category-filter">
            <SelectValue placeholder="Tutte le categorie" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte le categorie</SelectItem>
            {allCategories.map((cat) => (
              <SelectItem key={cat.id} value={cat.value}>
                {cat.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {categoryFilter !== 'all' && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setCategoryFilter('all')}
            data-testid="button-clear-filter"
          >
            Mostra tutti
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Totale Prodotti {categoryFilter !== 'all' ? 'Filtrati' : ''}</CardDescription>
            <CardTitle className="text-3xl">{filteredProducts.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Prodotti Attivi</CardDescription>
            <CardTitle className="text-3xl text-green-600">
              {filteredProducts.filter(p => p.attivo).length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Prodotti Disattivati</CardDescription>
            <CardTitle className="text-3xl text-gray-400">
              {filteredProducts.filter(p => !p.attivo).length}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Lista Prodotti */}
      {filteredProducts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">
              {categoryFilter === 'all' ? 'Nessun prodotto' : 'Nessun prodotto in questa categoria'}
            </h3>
            <p className="text-muted-foreground mb-4">
              {categoryFilter === 'all' 
                ? 'Inizia creando il tuo primo prodotto fotografico'
                : 'Non ci sono prodotti in questa categoria. Prova a cambiare filtro o crea un nuovo prodotto.'}
            </p>
            <div className="flex gap-2 justify-center">
              {categoryFilter !== 'all' && (
                <Button variant="outline" onClick={() => setCategoryFilter('all')}>
                  Mostra tutti i prodotti
                </Button>
              )}
              <Button onClick={openCreateDialog} data-testid="button-create-product-empty">
                <Plus className="h-4 w-4 mr-2" />
                Crea Prodotto
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProducts.map(product => (
            <Card key={product.id} className={!product.attivo ? 'opacity-60' : ''}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <CardTitle className="flex items-center gap-2">
                      {product.nome}
                      {!product.attivo && (
                        <Badge variant="secondary" className="text-xs">
                          Disattivo
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {allCategories.find((c) => c.value === product.categoria)?.nome || product.categoria}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Immagine prodotto */}
                {product.immagini && product.immagini.length > 0 && (
                  <div className="relative aspect-video w-full rounded-lg overflow-hidden bg-muted">
                    <img
                      src={product.immagini[0]}
                      alt={product.nome}
                      className="w-full h-full object-cover"
                    />
                    {product.immagini.length > 1 && (
                      <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                        +{product.immagini.length - 1} foto
                      </div>
                    )}
                  </div>
                )}

                <p className="text-sm text-muted-foreground line-clamp-2">
                  {product.descrizione || 'Nessuna descrizione'}
                </p>
                
                <div className="space-y-2 pt-2 border-t">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Prezzo base:</span>
                    <span className="font-medium">€{product.prezzo.toFixed(2)}</span>
                  </div>
                  
                  {product.sconto > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Sconto:</span>
                      <Badge variant="secondary">{product.sconto}%</Badge>
                    </div>
                  )}
                  
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Prezzo finale:</span>
                    <span className="text-lg font-bold text-primary">
                      €{product.prezzoFinale.toFixed(2)}
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-center pt-2 border-t">
                    <span className="text-sm text-muted-foreground flex items-center gap-1">
                      <Image className="h-4 w-4" />
                      Foto incluse:
                    </span>
                    <span className="font-semibold">{product.numeroFoto}</span>
                  </div>
                </div>

                <div className="flex gap-2 pt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => openEditDialog(product)}
                    data-testid={`button-edit-product-${product.id}`}
                  >
                    <Edit className="h-4 w-4 mr-1" />
                    Modifica
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setDeleteConfirmId(product.id)}
                    data-testid={`button-delete-product-${product.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog Crea/Modifica Prodotto */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingProduct ? 'Modifica Prodotto' : 'Nuovo Prodotto'}
            </DialogTitle>
            <DialogDescription>
              {editingProduct
                ? 'Modifica i dettagli del prodotto esistente'
                : 'Crea un nuovo prodotto fotografico'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Nome */}
            <div className="space-y-2">
              <Label htmlFor="nome">Nome Prodotto *</Label>
              <Input
                id="nome"
                value={formData.nome}
                onChange={e => setFormData({ ...formData, nome: e.target.value })}
                placeholder="es. Album Premium 30x40"
                data-testid="input-product-name"
              />
            </div>

            {/* Categoria */}
            <div className="space-y-2">
              <Label htmlFor="categoria">Categoria *</Label>
              <Select
                value={formData.categoria}
                onValueChange={(value: any) => setFormData({ ...formData, categoria: value })}
                disabled={categoriesLoading || activeCategories.length === 0}
              >
                <SelectTrigger data-testid="select-product-category">
                  <SelectValue placeholder={
                    categoriesLoading 
                      ? 'Caricamento categorie...' 
                      : activeCategories.length === 0 
                        ? 'Nessuna categoria attiva disponibile' 
                        : 'Seleziona categoria'
                  } />
                </SelectTrigger>
                <SelectContent>
                  {activeCategories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.value}>
                      {cat.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!categoriesLoading && activeCategories.length === 0 && (
                <p className="text-sm text-destructive">
                  Nessuna categoria attiva disponibile. Attiva almeno una categoria prima di aggiungere prodotti.
                </p>
              )}
            </div>

            {/* Descrizione */}
            <div className="space-y-2">
              <Label htmlFor="descrizione">Descrizione</Label>
              <Textarea
                id="descrizione"
                value={formData.descrizione}
                onChange={e => setFormData({ ...formData, descrizione: e.target.value })}
                placeholder="Descrizione dettagliata del prodotto..."
                rows={3}
                data-testid="input-product-description"
              />
            </div>

            {/* Prezzo e Sconto */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="prezzo">Prezzo Base (€) *</Label>
                <Input
                  id="prezzo"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.prezzo}
                  onChange={e => setFormData({ ...formData, prezzo: parseFloat(e.target.value) || 0 })}
                  data-testid="input-product-price"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sconto">Sconto (%)</Label>
                <Input
                  id="sconto"
                  type="number"
                  min="0"
                  max="100"
                  value={formData.sconto}
                  onChange={e => setFormData({ ...formData, sconto: parseFloat(e.target.value) || 0 })}
                  data-testid="input-product-discount"
                />
              </div>
            </div>

            {/* Prezzo Finale Calcolato */}
            {formData.prezzo > 0 && (
              <div className="bg-muted p-3 rounded-lg" data-testid="preview-final-price">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Prezzo Finale:</span>
                  <span className="text-xl font-bold text-primary" data-testid="text-final-price">
                    €{prezzoFinale.toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            {/* Numero Foto */}
            <div className="space-y-2">
              <Label htmlFor="numeroFoto">Numero Foto Incluse *</Label>
              <Input
                id="numeroFoto"
                type="number"
                min="0"
                value={formData.numeroFoto}
                onChange={e => setFormData({ ...formData, numeroFoto: parseInt(e.target.value) || 0 })}
                placeholder="es. 20"
                data-testid="input-product-photos"
              />
              <p className="text-xs text-muted-foreground">
                Numero di foto che il cliente può selezionare per questo prodotto
              </p>
            </div>

            {/* Immagini Prodotto */}
            <div className="space-y-3 pt-2 border-t">
              <Label>Immagini Prodotto (max 5)</Label>
              
              {/* Griglia immagini caricate */}
              {productImages.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {productImages.map((imageUrl, index) => (
                    <div key={index} className="relative group aspect-square rounded-lg overflow-hidden border-2 border-muted">
                      <img
                        src={imageUrl}
                        alt={`Prodotto ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveImage(imageUrl)}
                        className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        data-testid={`button-remove-image-${index}`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Pulsante upload */}
              {productImages.length < 5 && (
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => handleImageUpload(e.target.files)}
                    className="hidden"
                    data-testid="input-product-images"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingImages}
                    className="w-full"
                    data-testid="button-upload-images"
                  >
                    {uploadingImages ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary mr-2" />
                        Caricamento...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        Carica Immagini ({productImages.length}/5)
                      </>
                    )}
                  </Button>
                  <p className="text-xs text-muted-foreground mt-2">
                    Immagini compresse automaticamente (max 500KB, 1200px)
                  </p>
                </div>
              )}
            </div>

            {/* Stato Attivo */}
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div>
                <Label htmlFor="attivo" className="text-sm font-medium">
                  Prodotto Attivo
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Disattiva per nascondere il prodotto dalle prenotazioni
                </p>
              </div>
              <Switch
                id="attivo"
                checked={formData.attivo}
                onCheckedChange={checked => setFormData({ ...formData, attivo: checked })}
                data-testid="switch-product-active"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} data-testid="button-cancel-product">
              Annulla
            </Button>
            <Button onClick={handleSave} disabled={isSaving} data-testid="button-save-product">
              {isSaving ? 'Salvataggio...' : editingProduct ? 'Salva Modifiche' : 'Crea Prodotto'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Conferma Eliminazione */}
      <Dialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Conferma Eliminazione</DialogTitle>
            <DialogDescription>
              Sei sicuro di voler eliminare questo prodotto? Questa azione non può essere annullata.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)} data-testid="button-cancel-delete">
              Annulla
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
              data-testid="button-confirm-delete"
            >
              Elimina
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
