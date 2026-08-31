/**
 * ProductsManager - Gestione Catalogo Prodotti Fotografici
 */

import { useState, useEffect, useRef } from 'react';
import { Plus, Edit, Trash2, Package, Euro, Image, Upload, X, FolderOpen, GripVertical, Layers, Search, RefreshCw, LockKeyhole, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import imageCompression from 'browser-image-compression';
import { storage, auth } from '@/lib/firebase';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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
  useReorderProducts,
} from '@/lib/products';
import { apiRequest } from '@/lib/queryClient';
import type { Product, InsertProduct, ProductCategory, BundleItem } from '@shared/booking-types';
import { isPrintShopManagedProduct } from '@/features/print-shop/product-channel-guard';

const isPrintShopProduct = (product: Product): boolean =>
  isPrintShopManagedProduct(product as Product & { salesChannels?: unknown });

interface SortableProductCardProps {
  product: Product;
  categories: ProductCategory[];
  onEdit: () => void;
  onDelete: () => void;
}

function SortableProductCard({ product, categories, onEdit, onDelete }: SortableProductCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: product.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <Card 
      ref={setNodeRef} 
      style={style}
      className={`${!product.attivo ? 'opacity-60' : ''} ${isDragging ? 'z-50 shadow-lg' : ''}`}
    >
      <CardHeader>
        <div className="flex justify-between items-start">
          <div 
            {...attributes} 
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-1 -ml-1 mr-2 hover:bg-muted rounded"
            title="Trascina per riordinare"
          >
            <GripVertical className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="flex-1">
            <CardTitle className="flex items-center gap-2 flex-wrap">
              {product.nome}
              {product.isBundle && (
                <Badge variant="default" className="text-xs bg-blue-600">
                  <Layers className="h-3 w-3 mr-1" />
                  Bundle
                </Badge>
              )}
              {!product.attivo && (
                <Badge variant="secondary" className="text-xs">
                  Disattivo
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="mt-1">
              {categories.find((c) => c.value === product.categoria)?.nome || product.categoria}
              {product.isBundle && product.bundleItems && product.bundleItems.length > 0 && (
                <span className="text-xs ml-2">
                  ({product.bundleItems.length} prodotti inclusi)
                </span>
              )}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
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
            onClick={onEdit}
            data-testid={`button-edit-product-${product.id}`}
          >
            <Edit className="h-4 w-4 mr-1" />
            Modifica
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={onDelete}
            data-testid={`button-delete-product-${product.id}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

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
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [isSyncingBundles, setIsSyncingBundles] = useState(false);
  
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
    isBundle: false,
    bundleItems: [],
  });
  
  // Bundle product search state
  const [bundleSearchTerm, setBundleSearchTerm] = useState('');
  const [bundleCategoryFilter, setBundleCategoryFilter] = useState<string | null>(null);

  // Upload immagini
  const [uploadingImages, setUploadingImages] = useState(false);
  const [productImages, setProductImages] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { toast } = useToast();
  
  // Drag and drop reorder
  const reorderMutation = useReorderProducts();
  
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    
    if (!over || active.id === over.id) return;
    
    // Get the visible products (filtered or all)
    const visibleProducts = categoryFilter !== null ? filteredProducts : genericProducts;
    
    // Find positions in visible list
    const oldIndex = visibleProducts.findIndex(p => p.id === active.id);
    const newIndex = visibleProducts.findIndex(p => p.id === over.id);
    
    if (oldIndex === -1 || newIndex === -1) return;
    
    // Reorder visible products
    const reorderedVisible = arrayMove(visibleProducts, oldIndex, newIndex);
    
    let reorderedProducts: Product[];
    
    if (categoryFilter !== null) {
      // When filter is active: merge reordered filtered items with hidden items
      // Hidden items maintain their relative positions
      const visibleIds = new Set(visibleProducts.map(p => p.id));
      reorderedProducts = [];
      let visibleIndex = 0;
      
      for (const product of genericProducts) {
        if (visibleIds.has(product.id)) {
          // Insert next reordered visible item
          reorderedProducts.push(reorderedVisible[visibleIndex]);
          visibleIndex++;
        } else {
          // Keep hidden item in its relative position
          reorderedProducts.push(product);
        }
      }
    } else {
      // No filter: use reordered list directly
      reorderedProducts = reorderedVisible;
    }

    // I documenti print_shop sono protetti e conservano il proprio displayOrder,
    // amministrato esclusivamente dall'editor Listino stampe.
    reorderedProducts = [
      ...reorderedProducts,
      ...products.filter(isPrintShopProduct),
    ];
    
    // Optimistic UI update
    setProducts(reorderedProducts);
    
    // Persist to Firestore
    const reorderedIds = reorderedProducts.filter((product) => !isPrintShopProduct(product)).map(p => p.id);
    reorderMutation.mutate(reorderedIds, {
      onSuccess: () => {
        toast({
          title: 'Ordine aggiornato',
          description: 'L\'ordine dei prodotti è stato salvato',
        });
      },
      onError: (error) => {
        console.error('Errore riordino prodotti:', error);
        // Rollback on error
        loadProducts();
        toast({
          title: 'Errore',
          description: 'Impossibile salvare l\'ordine dei prodotti',
          variant: 'destructive',
        });
      }
    });
  }

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
      categoria: activeCategories[0]?.value || '',
      attivo: true,
      immagini: [],
      isBundle: false,
      bundleItems: [],
    });
    setProductImages([]);
    setBundleSearchTerm('');
    setBundleCategoryFilter(null);
    setIsDialogOpen(true);
  }

  function openEditDialog(product: Product) {
    setEditingProduct(product);

    let syncedBundleItems = product.bundleItems || [];
    if (product.isBundle && syncedBundleItems.length > 0) {
      let synced = false;
      syncedBundleItems = syncedBundleItems.map(item => {
        const catalogProduct = products.find(p => p.id === item.prodottoId);
        if (catalogProduct && catalogProduct.numeroFoto !== item.numeroFoto) {
          synced = true;
          return { ...item, numeroFoto: catalogProduct.numeroFoto, prodottoNome: catalogProduct.nome };
        }
        return item;
      });
      if (synced) {
        toast({
          title: 'Foto aggiornate dal catalogo',
          description: 'Il numero di foto dei prodotti nel bundle è stato aggiornato automaticamente con i valori attuali dal catalogo.',
        });
      }
    }

    setFormData({
      nome: product.nome,
      descrizione: product.descrizione,
      prezzo: product.prezzo,
      sconto: product.sconto,
      numeroFoto: product.numeroFoto,
      categoria: product.categoria,
      attivo: product.attivo,
      immagini: product.immagini || [],
      isBundle: product.isBundle || false,
      bundleItems: syncedBundleItems,
    });
    setProductImages(product.immagini || []);
    setBundleSearchTerm('');
    setBundleCategoryFilter(null);
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

  // Bundle management functions
  function addProductToBundle(product: Product) {
    // Prevent adding the same product or current editing product
    if (editingProduct && product.id === editingProduct.id) {
      toast({
        title: 'Non consentito',
        description: 'Non puoi aggiungere un bundle a se stesso',
        variant: 'destructive',
      });
      return;
    }
    
    // Prevent adding bundles to bundles (no nesting)
    if (product.isBundle) {
      toast({
        title: 'Non consentito',
        description: 'Non puoi aggiungere un bundle dentro un altro bundle',
        variant: 'destructive',
      });
      return;
    }
    
    // Check if already in bundle
    if (formData.bundleItems?.some(item => item.prodottoId === product.id)) {
      toast({
        title: 'Prodotto già presente',
        description: 'Questo prodotto è già nel bundle',
        variant: 'destructive',
      });
      return;
    }
    
    const newBundleItem: BundleItem = {
      prodottoId: product.id,
      prodottoNome: product.nome,
      prodottoCategoria: product.categoria,
      quantita: 1,
      numeroFoto: product.numeroFoto,
    };
    
    setFormData({
      ...formData,
      bundleItems: [...(formData.bundleItems || []), newBundleItem],
    });
    setBundleSearchTerm('');
  }
  
  function removeProductFromBundle(prodottoId: string) {
    setFormData({
      ...formData,
      bundleItems: formData.bundleItems?.filter(item => item.prodottoId !== prodottoId) || [],
    });
  }
  
  function updateBundleItem(prodottoId: string, updates: Partial<BundleItem>) {
    setFormData({
      ...formData,
      bundleItems: formData.bundleItems?.map(item => 
        item.prodottoId === prodottoId ? { ...item, ...updates } : item
      ) || [],
    });
  }
  
  // Filter products for bundle selection (exclude bundles and current product)
  const availableProductsForBundle = products.filter(p => {
    // I formati dello shop hanno prezzi/scaglioni autonomi e non devono essere
    // incorporati nei bundle del catalogo prenotazioni.
    if (isPrintShopProduct(p)) return false;
    // Exclude bundles
    if (p.isBundle) return false;
    // Exclude current editing product
    if (editingProduct && p.id === editingProduct.id) return false;
    // Exclude already added products
    if (formData.bundleItems?.some(item => item.prodottoId === p.id)) return false;
    // Apply search filter
    if (bundleSearchTerm && !p.nome.toLowerCase().includes(bundleSearchTerm.toLowerCase())) return false;
    // Apply category filter
    if (bundleCategoryFilter && p.categoria !== bundleCategoryFilter) return false;
    return true;
  });
  
  // Calculate total photos in bundle
  const totalBundlePhotos = formData.bundleItems?.reduce((sum, item) => sum + (item.numeroFoto * item.quantita), 0) || 0;

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

    // Bundle validation
    if (formData.isBundle) {
      if (!formData.bundleItems || formData.bundleItems.length === 0) {
        toast({
          title: 'Errore',
          description: 'Un bundle deve contenere almeno un prodotto',
          variant: 'destructive',
        });
        return;
      }
      
      // Validate each bundle item
      for (const item of formData.bundleItems) {
        if (!item.quantita || item.quantita <= 0) {
          toast({
            title: 'Errore',
            description: `Quantità non valida per "${item.prodottoNome}". Deve essere maggiore di 0.`,
            variant: 'destructive',
          });
          return;
        }
        if (item.numeroFoto !== undefined && item.numeroFoto < 0) {
          toast({
            title: 'Errore',
            description: `Numero foto non valido per "${item.prodottoNome}". Non può essere negativo.`,
            variant: 'destructive',
          });
          return;
        }
      }
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

  // Sincronizza dati bundle negli ordini esistenti
  async function handleSyncBundles() {
    // Verifica che l'utente sia loggato
    if (!auth.currentUser) {
      toast({
        title: 'Errore',
        description: 'Devi essere autenticato per sincronizzare i dati',
        variant: 'destructive',
      });
      return;
    }

    setIsSyncingBundles(true);
    try {
      const response = await apiRequest('POST', '/api/orders/sync-bundle-data');
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Errore sincronizzazione');
      }
      
      toast({
        title: 'Sincronizzazione completata',
        description: `${data.ordersUpdated} ordini aggiornati, ${data.productsUpdated} prodotti sincronizzati`,
      });
    } catch (error: any) {
      console.error('Errore sincronizzazione bundle:', error);
      toast({
        title: 'Errore',
        description: error.message || 'Impossibile sincronizzare i dati bundle',
        variant: 'destructive',
      });
    } finally {
      setIsSyncingBundles(false);
    }
  }

  // Filtra prodotti per categoria
  const printShopProductCount = products.filter(isPrintShopProduct).length;
  const genericProducts = products.filter((product) => !isPrintShopProduct(product));
  const filteredProducts = genericProducts.filter(p =>
    categoryFilter === null || p.categoria === categoryFilter
  );

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
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={handleSyncBundles} 
            disabled={isSyncingBundles}
            title="Sincronizza i dati bundle negli ordini esistenti"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isSyncingBundles ? 'animate-spin' : ''}`} />
            {isSyncingBundles ? 'Sincronizzando...' : 'Sincronizza Bundle'}
          </Button>
          <Button onClick={openCreateDialog} data-testid="button-create-product">
            <Plus className="h-4 w-4 mr-2" />
            Nuovo Prodotto
          </Button>
        </div>
      </div>

      {printShopProductCount > 0 && (
        <Card className="border-sky-200 bg-sky-50/70">
          <CardContent className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <LockKeyhole className="mt-0.5 h-5 w-5 flex-none text-sky-700" aria-hidden="true" />
              <div>
                <p className="font-semibold text-sky-950">{printShopProductCount} formati dello shop protetti</p>
                <p className="mt-1 text-sm text-sky-900/70">Non compaiono in questo catalogo per evitare prezzi o eliminazioni incoerenti. Gestisci scaglioni, pacchetto Polaroid e disponibilità da Stampe online.</p>
              </div>
            </div>
            <Button asChild variant="outline" className="flex-none border-sky-300 bg-white text-sky-900 hover:bg-sky-100">
              <a href="?tab=print-shop-orders" onClick={() => {
                sessionStorage.setItem('activeTab', 'print-shop-orders');
                sessionStorage.setItem('printShopAdminSection', 'catalog');
              }}>
                Apri Listino stampe <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </a>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Prodotti Totali</CardDescription>
            <CardTitle className="text-3xl">{filteredProducts.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Attivi</CardDescription>
            <CardTitle className="text-3xl text-green-600">
              {filteredProducts.filter(p => p.attivo).length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Disattivati</CardDescription>
            <CardTitle className="text-3xl text-gray-400">
              {filteredProducts.filter(p => !p.attivo).length}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Filtro Categoria */}
      {!categoriesLoading && activeCategories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant={categoryFilter === null ? 'default' : 'outline'}
            size="sm"
            onClick={() => setCategoryFilter(null)}
            data-testid="button-filter-all"
          >
            <FolderOpen className="h-4 w-4 mr-2" />
            Mostra tutti
          </Button>
          {activeCategories.map(category => (
            <Button
              key={category.id}
              variant={categoryFilter === category.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setCategoryFilter(category.value)}
              data-testid={`button-filter-${category.value}`}
            >
              <FolderOpen className="h-4 w-4 mr-2" />
              {category.nome}
            </Button>
          ))}
        </div>
      )}

      {/* Lista Prodotti */}
      {genericProducts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nessun prodotto</h3>
            <p className="text-muted-foreground mb-4">
              Inizia creando il tuo primo prodotto fotografico
            </p>
            <Button onClick={openCreateDialog} data-testid="button-create-product-empty">
              <Plus className="h-4 w-4 mr-2" />
              Crea Prodotto
            </Button>
          </CardContent>
        </Card>
      ) : filteredProducts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">
              Nessun prodotto in categoria {allCategories.find(c => c.value === categoryFilter)?.nome || categoryFilter}
            </h3>
            <p className="text-muted-foreground mb-4">
              Non ci sono prodotti disponibili per la categoria selezionata
            </p>
            <Button onClick={() => setCategoryFilter(null)} variant="outline" data-testid="button-show-all-empty">
              <FolderOpen className="h-4 w-4 mr-2" />
              Mostra tutti i prodotti
            </Button>
          </CardContent>
        </Card>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={filteredProducts.map(p => p.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredProducts.map(product => (
                <SortableProductCard
                  key={product.id}
                  product={product}
                  categories={allCategories}
                  onEdit={() => openEditDialog(product)}
                  onDelete={() => setDeleteConfirmId(product.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
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

            {/* Bundle Toggle */}
            <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
              <div>
                <Label htmlFor="isBundle" className="text-sm font-medium flex items-center gap-2">
                  <Layers className="h-4 w-4 text-blue-600" />
                  È un Bundle
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Attiva per creare un pacchetto che contiene più prodotti
                </p>
              </div>
              <Switch
                id="isBundle"
                checked={formData.isBundle || false}
                onCheckedChange={checked => {
                  setFormData({ 
                    ...formData, 
                    isBundle: checked,
                    bundleItems: checked ? formData.bundleItems : [],
                  });
                }}
                data-testid="switch-is-bundle"
              />
            </div>

            {/* Bundle Products Section */}
            {formData.isBundle && (
              <div className="space-y-4 pt-4 border-t border-blue-200 dark:border-blue-800">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <Package className="h-4 w-4" />
                    Prodotti nel Bundle
                  </Label>
                  <Badge variant="secondary">
                    {formData.bundleItems?.length || 0} prodotti - {totalBundlePhotos} foto totali
                  </Badge>
                </div>

                {/* Current bundle items */}
                {formData.bundleItems && formData.bundleItems.length > 0 && (
                  <div className="space-y-2">
                    {formData.bundleItems.map((item) => (
                      <div 
                        key={item.prodottoId} 
                        className="flex items-center gap-3 p-3 bg-muted rounded-lg"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{item.prodottoNome}</p>
                          <p className="text-xs text-muted-foreground">
                            {allCategories.find(c => c.value === item.prodottoCategoria)?.nome || item.prodottoCategoria}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1">
                            <Label className="text-xs">Qtà:</Label>
                            <Input
                              type="number"
                              min="1"
                              value={item.quantita}
                              onChange={(e) => updateBundleItem(item.prodottoId, { 
                                quantita: parseInt(e.target.value) || 1 
                              })}
                              className="w-16 h-8 text-center"
                            />
                          </div>
                          <div className="flex items-center gap-1">
                            <Label className="text-xs">Foto:</Label>
                            <Input
                              type="number"
                              min="0"
                              value={item.numeroFoto}
                              onChange={(e) => updateBundleItem(item.prodottoId, { 
                                numeroFoto: parseInt(e.target.value) || 0 
                              })}
                              className="w-16 h-8 text-center"
                            />
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeProductFromBundle(item.prodottoId)}
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Search and add products */}
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Cerca prodotto..."
                        value={bundleSearchTerm}
                        onChange={(e) => setBundleSearchTerm(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                    <Select
                      value={bundleCategoryFilter || 'all'}
                      onValueChange={(value) => setBundleCategoryFilter(value === 'all' ? null : value)}
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue placeholder="Categoria" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tutte</SelectItem>
                        {activeCategories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.value}>
                            {cat.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Available products list */}
                  {(bundleSearchTerm || bundleCategoryFilter) && availableProductsForBundle.length > 0 && (
                    <div className="max-h-40 overflow-y-auto border rounded-lg">
                      {availableProductsForBundle.slice(0, 10).map((product) => (
                        <button
                          key={product.id}
                          type="button"
                          onClick={() => addProductToBundle(product)}
                          className="w-full flex items-center justify-between p-2 hover:bg-muted text-left border-b last:border-b-0"
                        >
                          <div>
                            <p className="text-sm font-medium">{product.nome}</p>
                            <p className="text-xs text-muted-foreground">
                              {allCategories.find(c => c.value === product.categoria)?.nome} - {product.numeroFoto} foto
                            </p>
                          </div>
                          <Plus className="h-4 w-4 text-primary" />
                        </button>
                      ))}
                    </div>
                  )}

                  {(bundleSearchTerm || bundleCategoryFilter) && availableProductsForBundle.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-2">
                      Nessun prodotto trovato
                    </p>
                  )}

                  {!bundleSearchTerm && !bundleCategoryFilter && (
                    <p className="text-xs text-muted-foreground text-center">
                      Usa la ricerca o seleziona una categoria per trovare i prodotti da aggiungere
                    </p>
                  )}
                </div>
              </div>
            )}
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
