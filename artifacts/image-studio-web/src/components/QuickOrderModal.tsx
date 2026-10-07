/**
 * Quick Order Modal - Ordine Rapido Walk-in
 * Per clienti che si presentano in studio senza prenotazione
 */

import { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFirebaseAuth } from '@/context/FirebaseAuthContext';
import { getActiveProducts } from '@/lib/products';
import { getAllClienti } from '@/lib/clienti';
import { apiRequest } from '@/lib/queryClient';
import type { Product, OrderItem } from '@shared/booking-types';
import type { Cliente } from '@shared/clienti-types';
import { ProductFilters, useProductFilter } from '@/components/ProductFilters';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { QuantityInput } from '@/components/ui/quantity-input';
import { Loader2, User, Plus, Trash2, Package, ShoppingBag, CreditCard, MessageCircle, Search, UserPlus, X } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatPhoneForWhatsApp } from '@shared/phone-utils';

interface QuickOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface CustomProduct {
  id: string;
  nome: string;
  prezzo: number;
  numeroFoto: number;
  quantita: number;
}

export default function QuickOrderModal({ isOpen, onClose, onSuccess }: QuickOrderModalProps) {
  const { toast } = useToast();
  const { user } = useFirebaseAuth();
  const queryClient = useQueryClient();
  
  // Form fields - Cliente
  const [nome, setNome] = useState('');
  const [cognome, setCognome] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  
  // Form fields - Prodotti
  const [selectedProducts, setSelectedProducts] = useState<Array<{
    prodottoId: string;
    quantita: number;
  }>>([]);
  const [customProducts, setCustomProducts] = useState<CustomProduct[]>([]);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customNome, setCustomNome] = useState('');
  const [customPrezzo, setCustomPrezzo] = useState<number>(0);
  const [customNumeroFoto, setCustomNumeroFoto] = useState<number>(0);
  
  // Form fields - Pagamento
  const [acconto, setAcconto] = useState<number>(0);
  const [metodoPagamento, setMetodoPagamento] = useState<'contante' | 'carta' | 'bonifico' | 'paypal' | 'altro'>('contante');
  const [isPaidAndDelivered, setIsPaidAndDelivered] = useState(false);
  const [sendEmail, setSendEmail] = useState(true);
  
  // Note
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Ricerca clienti esistenti
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClienteId, setSelectedClienteId] = useState<string | null>(null);
  const [isNewCliente, setIsNewCliente] = useState(false);
  const [showClientSearch, setShowClientSearch] = useState(true);

  // Query prodotti attivi
  const { data: allProducts = [] } = useQuery<Product[]>({
    queryKey: ['products', 'active'],
    queryFn: getActiveProducts,
  });
  
  // Filtri prodotti
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [productCategoryFilter, setProductCategoryFilter] = useState('all');
  
  // Applica filtri ai prodotti
  const products = useProductFilter(allProducts, productSearchQuery, productCategoryFilter);
  
  // Query clienti esistenti
  const { data: clienti = [], isLoading: isLoadingClienti } = useQuery<Cliente[]>({
    queryKey: ['clienti'],
    queryFn: getAllClienti,
    enabled: isOpen,
  });
  
  // Filtra clienti in base alla ricerca
  const filteredClienti = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase().trim();
    return clienti.filter(c => {
      const fullName = `${c.nome} ${c.cognome}`.toLowerCase();
      const email = (c.email || '').toLowerCase();
      const phone = c.cellulare1 || c.whatsapp || '';
      return fullName.includes(query) || email.includes(query) || phone.includes(query);
    }).slice(0, 8); // Limita a 8 risultati
  }, [clienti, searchQuery]);
  
  // Seleziona cliente esistente
  const selectCliente = (cliente: Cliente) => {
    setSelectedClienteId(cliente.id);
    setNome(cliente.nome);
    setCognome(cliente.cognome);
    setEmail(cliente.email || '');
    setWhatsapp(cliente.whatsapp || cliente.cellulare1 || '');
    setSearchQuery('');
    setShowClientSearch(false);
    setIsNewCliente(false);
    toast({
      title: 'Cliente selezionato',
      description: `${cliente.nome} ${cliente.cognome}`,
    });
  };
  
  // Passa a nuovo cliente
  const switchToNewCliente = () => {
    setSelectedClienteId(null);
    setIsNewCliente(true);
    setShowClientSearch(false);
  };
  
  // Reset e torna alla ricerca
  const resetClienteSelection = () => {
    setSelectedClienteId(null);
    setIsNewCliente(false);
    setShowClientSearch(true);
    setNome('');
    setCognome('');
    setEmail('');
    setWhatsapp('');
    setSearchQuery('');
  };

  // Helper: Aggiungi prodotto vuoto
  const addProduct = () => {
    setSelectedProducts([...selectedProducts, { prodottoId: '', quantita: 1 }]);
  };

  // Helper: Rimuovi prodotto
  const removeProduct = (index: number) => {
    setSelectedProducts(selectedProducts.filter((_, i) => i !== index));
  };

  // Helper: Aggiorna prodotto
  const updateProduct = (index: number, field: 'prodottoId' | 'quantita', value: string | number) => {
    const updated = [...selectedProducts];
    updated[index] = { ...updated[index], [field]: value };
    setSelectedProducts(updated);
  };

  // Helper: Calcola subtotale per prodotto
  const getProductSubtotal = (prodottoId: string, quantita: number): number => {
    const product = allProducts.find(p => p.id === prodottoId);
    if (!product) return 0;
    return product.prezzoFinale * quantita;
  };

  // Helper: Calcola totale ordine (catalogo + custom)
  const calculateTotale = (): number => {
    const catalogoTotale = selectedProducts.reduce((sum, item) => {
      return sum + getProductSubtotal(item.prodottoId, item.quantita);
    }, 0);
    const customTotale = customProducts.reduce((sum, item) => {
      return sum + item.prezzo * item.quantita;
    }, 0);
    return catalogoTotale + customTotale;
  };

  // Calcola saldo
  const totale = calculateTotale();
  const saldo = totale - acconto;

  // Helper: Aggiungi prodotto personalizzato
  const addCustomProduct = () => {
    if (!customNome.trim()) return;
    if (typeof customPrezzo !== 'number' || isNaN(customPrezzo) || customPrezzo <= 0) return;
    
    const validNumeroFoto = typeof customNumeroFoto === 'number' && !isNaN(customNumeroFoto) && customNumeroFoto >= 0
      ? customNumeroFoto
      : 0;
    
    const newCustom: CustomProduct = {
      id: `custom_${Date.now()}`,
      nome: customNome.trim(),
      prezzo: customPrezzo,
      numeroFoto: validNumeroFoto,
      quantita: 1,
    };
    setCustomProducts([...customProducts, newCustom]);
    setCustomNome('');
    setCustomPrezzo(0);
    setCustomNumeroFoto(0);
    setShowCustomForm(false);
  };

  // Helper: Rimuovi prodotto personalizzato
  const removeCustomProduct = (id: string) => {
    setCustomProducts(customProducts.filter((p) => p.id !== id));
  };

  // Helper: Aggiorna campo prodotto personalizzato
  const updateCustomProduct = (id: string, field: keyof CustomProduct, value: string | number) => {
    setCustomProducts(
      customProducts.map((p) => {
        if (p.id !== id) return p;
        if (field === 'quantita') return { ...p, quantita: Math.max(1, value as number) };
        if (field === 'prezzo') return { ...p, prezzo: Math.max(0, value as number) };
        if (field === 'numeroFoto') return { ...p, numeroFoto: Math.max(0, value as number) };
        if (field === 'nome') return { ...p, nome: value as string };
        return p;
      })
    );
  };

  // Reset form quando modal si apre
  useEffect(() => {
    if (isOpen) {
      setNome('');
      setCognome('');
      setEmail('');
      setWhatsapp('');
      setSelectedProducts([]);
      setCustomProducts([]);
      setShowCustomForm(false);
      setCustomNome('');
      setCustomPrezzo(0);
      setCustomNumeroFoto(0);
      setAcconto(0);
      setMetodoPagamento('contante');
      setIsPaidAndDelivered(false);
      setSendEmail(true);
      setNote('');
      // Reset ricerca clienti
      setSearchQuery('');
      setSelectedClienteId(null);
      setIsNewCliente(false);
      setShowClientSearch(true);
    }
  }, [isOpen]);

  // Quando isPaidAndDelivered è true, imposta acconto = totale
  useEffect(() => {
    if (isPaidAndDelivered) {
      setAcconto(totale);
    }
  }, [isPaidAndDelivered, totale]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validazione: deve selezionare un cliente esistente o crearne uno nuovo
    if (!selectedClienteId && !isNewCliente) {
      toast({
        title: 'Cliente richiesto',
        description: 'Cerca e seleziona un cliente esistente oppure clicca "Nuovo Cliente"',
        variant: 'destructive',
      });
      return;
    }
    
    if (!nome.trim() || !cognome.trim()) {
      toast({
        title: 'Campi obbligatori',
        description: 'Nome e cognome sono obbligatori',
        variant: 'destructive',
      });
      return;
    }

    if (selectedProducts.length === 0 && customProducts.length === 0) {
      toast({
        title: 'Nessun prodotto',
        description: 'Aggiungi almeno un prodotto all\'ordine',
        variant: 'destructive',
      });
      return;
    }

    // Validazione prodotti catalogo
    if (selectedProducts.length > 0) {
      if (selectedProducts.some(p => !p.prodottoId || p.quantita <= 0)) {
        toast({
          title: 'Prodotti incompleti',
          description: 'Completa tutti i prodotti con quantità valida o rimuovili',
          variant: 'destructive',
        });
        return;
      }
    }

    // Validazione prodotti custom
    if (customProducts.length > 0) {
      const invalidCustom = customProducts.filter(p => !p.nome?.trim() || p.prezzo <= 0 || p.quantita <= 0);
      if (invalidCustom.length > 0) {
        toast({
          title: 'Prodotti personalizzati non validi',
          description: 'Tutti i prodotti personalizzati devono avere nome, prezzo positivo e quantità valida',
          variant: 'destructive',
        });
        return;
      }
    }

    try {
      setIsSubmitting(true);

      // Costruisci array prodotti
      const catalogoOrderItems: OrderItem[] = selectedProducts.map(item => {
        const product = allProducts.find(p => p.id === item.prodottoId)!;
        // Per bundle: calcola totale foto da bundleItems
        const totalPhotos = product.isBundle && product.bundleItems && product.bundleItems.length > 0
          ? product.bundleItems.reduce((sum, bi) => sum + (bi.numeroFoto || 0) * (bi.quantita || 1), 0)
          : product.numeroFoto;
        return {
          prodottoId: product.id,
          prodottoNome: product.nome,
          prodottoPrezzo: product.prezzoFinale,
          prodottoNumeroFoto: totalPhotos,
          quantita: item.quantita,
          // Salva bundleItems se è un bundle per espansione in gallery
          ...(product.isBundle && product.bundleItems ? { isBundle: true, bundleItems: product.bundleItems } : {}),
        };
      });
      
      const customOrderItems: OrderItem[] = customProducts.map(item => ({
        prodottoId: item.id,
        prodottoNome: item.nome,
        prodottoPrezzo: item.prezzo,
        prodottoNumeroFoto: item.numeroFoto,
        quantita: item.quantita,
        isCustom: true,
      }));
      
      const prodottiOrderItems = [...catalogoOrderItems, ...customOrderItems];

      // Crea descrizione prodotti per WhatsApp
      const prodottiDescrizione = prodottiOrderItems
        .map(p => `${p.prodottoNome} x${p.quantita}`)
        .join(', ');

      // Chiama API backend per creare ordine
      const bodyData = {
        nomeCliente: `${nome.trim()} ${cognome.trim()}`,
        emailCliente: email.trim() || null,
        telefonoCliente: whatsapp.trim() || null,
        prodotti: prodottiOrderItems,
        totale,
        acconto,
        metodoPagamento,
        note: note.trim() || null,
        sendEmail: sendEmail && !!email.trim(),
        clienteId: selectedClienteId || null,
        createNewCliente: isNewCliente,
        clienteNome: nome.trim(),
        clienteCognome: cognome.trim(),
      };

      const response = await apiRequest('POST', '/api/orders/create-walkin', bodyData);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Errore durante la creazione dell\'ordine');
      }

      const result = await response.json();
      console.log('✅ Ordine walk-in creato:', result.orderId);

      // Invalida queries
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['cash-movements'] });
      queryClient.invalidateQueries({ queryKey: ['financial-summary'] });
      if (isNewCliente) {
        queryClient.invalidateQueries({ queryKey: ['clienti'] });
      }

      toast({
        title: 'Ordine creato',
        description: `Ordine per ${nome} ${cognome} creato con successo`,
      });

      // Mostra opzione WhatsApp se c'è numero
      if (whatsapp.trim()) {
        const formattedPhone = formatPhoneForWhatsApp(whatsapp.trim());
        const message = `Ciao ${nome}! Grazie per il tuo ordine presso Image Studio Fotografico.\n\nRiepilogo:\n${prodottiDescrizione}\n\nTotale: €${totale.toFixed(2)}\n${acconto > 0 ? `Acconto: €${acconto.toFixed(2)}\nSaldo: €${saldo.toFixed(2)}` : ''}\n\nTi contatteremo quando l'ordine sarà pronto!`;
        const whatsappUrl = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`;
        window.open(whatsappUrl, '_blank');
      }

      onSuccess();
      onClose();
    } catch (error) {
      console.error('❌ Errore creazione ordine walk-in:', error);
      toast({
        title: 'Errore',
        description: error instanceof Error ? error.message : 'Impossibile creare l\'ordine',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent 
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5" />
            Nuovo Ordine Rapido
          </DialogTitle>
          <DialogDescription>
            Crea un ordine per un cliente walk-in (stampe, poster, prodotti)
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Dati Cliente */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold flex items-center gap-2">
                <User className="w-4 h-4" />
                Dati Cliente
              </Label>
              {(selectedClienteId || isNewCliente) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={resetClienteSelection}
                  className="text-gray-500 hover:text-gray-700"
                  data-testid="button-reset-cliente"
                >
                  <X className="w-4 h-4 mr-1" />
                  Cambia
                </Button>
              )}
            </div>
            
            {/* Ricerca Cliente Esistente */}
            {showClientSearch && (
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cerca cliente per nome, email o telefono..."
                    className="pl-10"
                    data-testid="input-search-cliente"
                  />
                  {isLoadingClienti && (
                    <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />
                  )}
                </div>
                
                {/* Risultati ricerca */}
                {filteredClienti.length > 0 && (
                  <ScrollArea className="h-48 border rounded-lg">
                    <div className="p-2 space-y-1">
                      {filteredClienti.map((cliente) => (
                        <button
                          key={cliente.id}
                          type="button"
                          onClick={() => selectCliente(cliente)}
                          className="w-full text-left p-3 rounded-lg hover:bg-sage-50 transition-colors border border-transparent hover:border-sage-200"
                          data-testid={`cliente-result-${cliente.id}`}
                        >
                          <div className="font-medium text-gray-900">
                            {cliente.nome} {cliente.cognome}
                          </div>
                          <div className="text-sm text-gray-500 flex items-center gap-3">
                            {cliente.email && <span>{cliente.email}</span>}
                            {(cliente.whatsapp || cliente.cellulare1) && (
                              <span>{cliente.whatsapp || cliente.cellulare1}</span>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                )}
                
                {/* Pulsante Nuovo Cliente */}
                <Button
                  type="button"
                  variant="outline"
                  onClick={switchToNewCliente}
                  className="w-full border-dashed border-sage-400 text-sage-700 hover:bg-sage-50"
                  data-testid="button-new-cliente"
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  Nuovo Cliente
                </Button>
                
                <p className="text-xs text-gray-500 text-center">
                  Cerca un cliente esistente o creane uno nuovo
                </p>
              </div>
            )}
            
            {/* Form Dati Cliente (visibile quando cliente selezionato o nuovo) */}
            {(selectedClienteId || isNewCliente) && (
              <>
                {selectedClienteId && (
                  <div className="bg-sage-50 border border-sage-200 rounded-lg p-3 flex items-center gap-2">
                    <User className="w-4 h-4 text-sage-600" />
                    <span className="text-sm font-medium text-sage-700">
                      Cliente esistente: {nome} {cognome}
                    </span>
                  </div>
                )}
                
                {isNewCliente && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-2">
                    <UserPlus className="w-4 h-4 text-amber-600" />
                    <span className="text-sm font-medium text-amber-700">
                      Nuovo cliente - verrà aggiunto al database
                    </span>
                  </div>
                )}
            
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="nome">Nome *</Label>
                    <Input
                      id="nome"
                      data-testid="input-nome"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      placeholder="Mario"
                      required
                      disabled={!!selectedClienteId}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cognome">Cognome *</Label>
                    <Input
                      id="cognome"
                      data-testid="input-cognome"
                      value={cognome}
                      onChange={(e) => setCognome(e.target.value)}
                      placeholder="Rossi"
                      required
                      disabled={!!selectedClienteId}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email (per conferma ordine)</Label>
                  <Input
                    id="email"
                    data-testid="input-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="mario.rossi@example.com"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="whatsapp">WhatsApp (per notifica)</Label>
                  <Input
                    id="whatsapp"
                    data-testid="input-whatsapp"
                    type="tel"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    placeholder="+39 333 123 4567"
                  />
                </div>
              </>
            )}
          </div>

          {/* Prodotti */}
          <div className="space-y-4 border-t pt-4">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold flex items-center gap-2">
                <Package className="w-4 h-4" />
                Prodotti *
              </Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={addProduct}
                className="border-sage text-sage hover:bg-sage hover:text-white"
                data-testid="button-add-product"
              >
                <Plus className="w-4 h-4 mr-1" />
                Da Catalogo
              </Button>
            </div>
            
            {/* Filtri prodotti */}
            {allProducts.length > 0 && (
              <ProductFilters
                products={allProducts}
                searchQuery={productSearchQuery}
                onSearchChange={setProductSearchQuery}
                categoryFilter={productCategoryFilter}
                onCategoryChange={setProductCategoryFilter}
                compact
              />
            )}

            {selectedProducts.length === 0 && customProducts.length === 0 ? (
              <div className="text-center py-6 text-gray-500 bg-gray-50 rounded-lg border border-dashed">
                <Package className="w-10 h-10 mx-auto mb-2 text-gray-400" />
                <p className="text-sm">Nessun prodotto aggiunto</p>
                <p className="text-xs mt-1">Aggiungi prodotti dal catalogo o personalizzati</p>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  {selectedProducts.map((item, index) => {
                    const product = allProducts.find(p => p.id === item.prodottoId);
                    const subtotale = getProductSubtotal(item.prodottoId, item.quantita);

                    return (
                      <div key={index} className="flex items-center gap-3 p-3 border rounded-lg bg-white">
                        <div className="flex-1">
                          <Select
                            value={item.prodottoId}
                            onValueChange={(value) => updateProduct(index, 'prodottoId', value)}
                          >
                            <SelectTrigger data-testid={`select-product-${index}`}>
                              <SelectValue placeholder="Seleziona prodotto" />
                            </SelectTrigger>
                            <SelectContent>
                              {products.map(p => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.nome} - €{p.prezzoFinale.toFixed(2)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <QuantityInput
                          value={item.quantita}
                          onChange={(val) => updateProduct(index, 'quantita', val)}
                          min={1}
                          max={99}
                          size="sm"
                          data-testid={`input-quantity-${index}`}
                        />

                        <div className="w-24 text-right font-medium">
                          €{subtotale.toFixed(2)}
                        </div>

                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => removeProduct(index)}
                          data-testid={`button-remove-product-${index}`}
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* Prodotti Personalizzati */}
            <div className="space-y-4 mt-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Prodotti Personalizzati</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setShowCustomForm(true)}
                  className="border-amber-500 text-amber-600 hover:bg-amber-500 hover:text-white"
                  data-testid="button-add-custom-product"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Aggiungi Personalizzato
                </Button>
              </div>

              {/* Form nuovo prodotto personalizzato */}
              {showCustomForm && (
                <div className="p-4 border-2 border-dashed border-amber-300 rounded-lg bg-amber-50 space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-3 sm:col-span-1">
                      <Label className="text-xs mb-1 block">Nome Prodotto *</Label>
                      <Input
                        value={customNome}
                        onChange={(e) => setCustomNome(e.target.value)}
                        placeholder="es. Poster 50x70"
                        data-testid="input-custom-nome"
                      />
                    </div>
                    <div>
                      <Label className="text-xs mb-1 block">Prezzo (€) *</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={customPrezzo || ''}
                        onChange={(e) => setCustomPrezzo(parseFloat(e.target.value) || 0)}
                        placeholder="0.00"
                        data-testid="input-custom-prezzo"
                      />
                    </div>
                    <div>
                      <Label className="text-xs mb-1 block">N. Foto</Label>
                      <Input
                        type="number"
                        min="0"
                        value={customNumeroFoto || ''}
                        onChange={(e) => setCustomNumeroFoto(parseInt(e.target.value) || 0)}
                        placeholder="0"
                        data-testid="input-custom-foto"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setShowCustomForm(false);
                        setCustomNome('');
                        setCustomPrezzo(0);
                        setCustomNumeroFoto(0);
                      }}
                    >
                      Annulla
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={addCustomProduct}
                      disabled={!customNome.trim() || customPrezzo <= 0}
                      className="bg-amber-500 hover:bg-amber-600 text-white"
                      data-testid="button-confirm-custom"
                    >
                      Conferma
                    </Button>
                  </div>
                </div>
              )}

              {/* Lista prodotti personalizzati */}
              {customProducts.length > 0 && (
                <div className="space-y-3">
                  {customProducts.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 border border-amber-200 rounded-lg bg-amber-50 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs bg-amber-200 text-amber-800 px-2 py-0.5 rounded">
                          Personalizzato
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => removeCustomProduct(item.id)}
                          data-testid={`button-remove-custom-${item.id}`}
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        <div className="col-span-2">
                          <Label className="text-xs mb-1 block">Nome</Label>
                          <Input
                            value={item.nome}
                            onChange={(e) => updateCustomProduct(item.id, 'nome', e.target.value)}
                            placeholder="Nome prodotto"
                            data-testid={`input-custom-name-${item.id}`}
                          />
                        </div>
                        <div>
                          <Label className="text-xs mb-1 block">Prezzo (€)</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.prezzo || ''}
                            onChange={(e) =>
                              updateCustomProduct(item.id, 'prezzo', parseFloat(e.target.value) || 0)
                            }
                            data-testid={`input-custom-price-${item.id}`}
                          />
                        </div>
                        <div>
                          <Label className="text-xs mb-1 block">N. Foto</Label>
                          <Input
                            type="number"
                            min="0"
                            value={item.numeroFoto || ''}
                            onChange={(e) =>
                              updateCustomProduct(item.id, 'numeroFoto', parseInt(e.target.value) || 0)
                            }
                            data-testid={`input-custom-photos-${item.id}`}
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-amber-200">
                        <div className="flex items-center gap-2">
                          <Label className="text-xs">Quantità:</Label>
                          <QuantityInput
                            value={item.quantita}
                            onChange={(val) => updateCustomProduct(item.id, 'quantita', val)}
                            min={1}
                            max={99}
                            size="sm"
                            data-testid={`input-custom-qty-${item.id}`}
                          />
                        </div>
                        <div className="text-right font-medium">
                          Subtotale: €{(item.prezzo * item.quantita).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Riepilogo Totale */}
            {(selectedProducts.length > 0 || customProducts.length > 0) && (
              <div className="bg-sage/10 p-4 rounded-lg border border-sage/20 mt-4 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-medium">Totale:</span>
                  <span className="text-lg font-bold">€{totale.toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Pagamento */}
          {(selectedProducts.length > 0 || customProducts.length > 0) && (
            <div className="space-y-4 border-t pt-4">
              <Label className="text-base font-semibold flex items-center gap-2">
                <CreditCard className="w-4 h-4" />
                Pagamento
              </Label>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="paid-delivered"
                  checked={isPaidAndDelivered}
                  onCheckedChange={(checked) => setIsPaidAndDelivered(checked === true)}
                />
                <Label htmlFor="paid-delivered" className="text-sm font-normal cursor-pointer">
                  Pagato e consegnato subito (completa ordine)
                </Label>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="acconto">
                    {isPaidAndDelivered ? 'Importo pagato' : 'Acconto (€)'}
                  </Label>
                  <Input
                    id="acconto"
                    type="number"
                    min="0"
                    max={totale}
                    step="0.01"
                    value={acconto || ''}
                    onChange={(e) => setAcconto(parseFloat(e.target.value) || 0)}
                    disabled={isPaidAndDelivered}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="metodo">Metodo Pagamento</Label>
                  <Select value={metodoPagamento} onValueChange={(v: any) => setMetodoPagamento(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contante">Contante</SelectItem>
                      <SelectItem value="carta">Carta</SelectItem>
                      <SelectItem value="bonifico">Bonifico</SelectItem>
                      <SelectItem value="paypal">PayPal</SelectItem>
                      <SelectItem value="altro">Altro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {!isPaidAndDelivered && acconto > 0 && saldo > 0 && (
                <div className="bg-amber-50 p-3 rounded-lg border border-amber-200">
                  <p className="text-sm text-amber-800">
                    <strong>Saldo rimanente:</strong> €{saldo.toFixed(2)}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Notifiche */}
          {email.trim() && (
            <div className="flex items-center space-x-2">
              <Checkbox
                id="send-email"
                checked={sendEmail}
                onCheckedChange={(checked) => setSendEmail(checked === true)}
              />
              <Label htmlFor="send-email" className="text-sm font-normal cursor-pointer">
                Invia email di conferma al cliente
              </Label>
            </div>
          )}

          {whatsapp.trim() && (
            <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg border border-green-200">
              <MessageCircle className="w-4 h-4 text-green-600" />
              <span className="text-sm text-green-800">
                Dopo la creazione si aprirà WhatsApp per inviare la conferma
              </span>
            </div>
          )}

          {/* Note */}
          <div className="space-y-2">
            <Label htmlFor="note">Note</Label>
            <Textarea
              id="note"
              data-testid="input-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note aggiuntive sull'ordine..."
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
              data-testid="button-cancel"
            >
              Annulla
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || (selectedProducts.length === 0 && customProducts.length === 0)}
              className="bg-sage hover:bg-sage/90"
              data-testid="button-submit"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creazione...
                </>
              ) : (
                'Crea Ordine'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
