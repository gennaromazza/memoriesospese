/**
 * EditOrderModal - Modal per modificare ordini esistenti con email automatica
 */

import { useState, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { createProduct } from '@/lib/products';
import { getActiveProductCategories } from '@/lib/product-categories';
import type { Order, Product, OrderItem, ProductCategory } from '@shared/booking-types';
import ProductSelector from '@/components/ProductSelector';
import { Button } from '@/components/ui/button';
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
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { QuantityInput } from '@/components/ui/quantity-input';
import { Trash2, Plus, Save, ShoppingCart, Package, Clock, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';

interface EditOrderModalProps {
  order: Order | null;
  products: Product[];
  onClose: () => void;
}

export default function EditOrderModal({ order, products, onClose }: EditOrderModalProps) {
  const { toast } = useToast();
  
  // Query categorie prodotti per filtro
  const { data: categories = [] } = useQuery<ProductCategory[]>({
    queryKey: ['product-categories', 'active'],
    queryFn: getActiveProductCategories,
  });
  
  // Prodotti selezionati nell'ordine
  const [selectedProdotti, setSelectedProdotti] = useState<OrderItem[]>([]);
  
  // Dati ordine
  const [nomeCliente, setNomeCliente] = useState('');
  const [emailCliente, setEmailCliente] = useState('');
  const [whatsappCliente, setWhatsappCliente] = useState('');
  const [note, setNote] = useState('');
  const [stato, setStato] = useState<'bozza' | 'in_lavorazione' | 'completato' | 'annullato'>('bozza');
  const [acconto, setAcconto] = useState(0);
  const [sconto, setSconto] = useState(0);
  
  // Prodotto custom
  const [showCustomProduct, setShowCustomProduct] = useState(false);
  const [customNome, setCustomNome] = useState('');
  const [customPrezzo, setCustomPrezzo] = useState<number>(0);
  const [customNumeroFoto, setCustomNumeroFoto] = useState<number>(0);
  const [customQuantita, setCustomQuantita] = useState<number>(1);
  const [saveToCatalog, setSaveToCatalog] = useState(false);
  
  // Inizializza dati quando l'ordine cambia
  useEffect(() => {
    if (order) {
      setSelectedProdotti(order.prodotti || []);
      setNomeCliente(order.nomeCliente || '');
      setEmailCliente(order.emailCliente || '');
      setWhatsappCliente(order.whatsappCliente || '');
      setNote(''); // Note non salvate nell'ordine, solo nelle transazioni
      setStato(order.stato || 'bozza');
      setAcconto(order.acconto || 0);
      setSconto(order.sconto || 0);
    }
  }, [order]);
  
  // Calcola totali
  const subtotale = selectedProdotti.reduce((sum, item) => {
    return sum + (item.prodottoPrezzo * item.quantita);
  }, 0);
  
  const totale = Math.max(0, subtotale - sconto);
  
  // Calcola totale pagato dalle transactions (unica fonte di verità)
  const totalePagato = (order?.transactions || []).reduce((sum, t) => sum + t.importo, 0);
  
  const saldo = totale - totalePagato;
  
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Mutation per eliminare ordine
  const deleteOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const response = await apiRequest('DELETE', `/api/orders/${orderId}`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: '🗑️ Ordine eliminato',
        description: 'L\'ordine è stato eliminato con successo.',
      });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['galleries'] });
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: '❌ Errore',
        description: error.message || 'Impossibile eliminare l\'ordine',
        variant: 'destructive',
      });
    },
  });

  // Mutation per update ordine
  const updateOrderMutation = useMutation({
    mutationFn: async ({ orderId, data }: { orderId: string; data: any }) => {
      const response = await apiRequest('PATCH', `/api/orders/${orderId}`, data);
      return response.json();
    },
    onSuccess: async (response) => {
      const gallerySync = response?.gallerySync;
      
      if (gallerySync && gallerySync.updated > 0) {
        toast({
          title: '✅ Ordine aggiornato',
          description: gallerySync.selectionsReset > 0
            ? `Modifiche salvate. ${gallerySync.updated} galleria/e aggiornata/e. ⚠️ ${gallerySync.selectionsReset} selezioni cliente resettate per cambio prodotti.`
            : `Modifiche salvate. ${gallerySync.updated} galleria/e aggiornata/e automaticamente.`,
        });
      } else {
        toast({
          title: '✅ Ordine aggiornato',
          description: 'Le modifiche sono state salvate e il cliente ha ricevuto una email di conferma.',
        });
      }
      
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['galleries'] });
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: '❌ Errore',
        description: error.message || 'Impossibile aggiornare l\'ordine',
        variant: 'destructive',
      });
    },
  });
  
  // Aggiungi prodotto dal catalogo
  const handleAddProduct = (productId: string) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    // Verifica se già presente
    const existing = selectedProdotti.find(p => p.prodottoId === product.id);
    if (existing) {
      toast({
        title: 'Prodotto già presente',
        description: 'Questo prodotto è già nell\'ordine. Modifica la quantità se necessario.',
        variant: 'destructive',
      });
      return;
    }
    
    // Per bundle: calcola totale foto da bundleItems
    const totalPhotos = product.isBundle && product.bundleItems && product.bundleItems.length > 0
      ? product.bundleItems.reduce((sum, bi) => sum + (bi.numeroFoto || 0) * (bi.quantita || 1), 0)
      : product.numeroFoto;
    
    const newItem: OrderItem = {
      prodottoId: product.id,
      prodottoNome: product.nome,
      prodottoPrezzo: product.prezzoFinale,
      prodottoNumeroFoto: totalPhotos,
      quantita: 1,
      // Salva bundleItems se è un bundle per espansione in gallery
      ...(product.isBundle && product.bundleItems ? { isBundle: true, bundleItems: product.bundleItems } : {}),
    };
    
    setSelectedProdotti([...selectedProdotti, newItem]);
  };
  
  // Rimuovi prodotto
  const handleRemoveProduct = (index: number) => {
    setSelectedProdotti(selectedProdotti.filter((_, i) => i !== index));
  };
  
  // Aggiorna quantità prodotto
  const handleUpdateQuantity = (index: number, quantita: number) => {
    if (quantita < 1) return;
    const updated = [...selectedProdotti];
    updated[index] = { ...updated[index], quantita };
    setSelectedProdotti(updated);
  };
  
  // Aggiungi prodotto custom
  const handleAddCustomProduct = async () => {
    if (!customNome.trim() || customPrezzo <= 0) {
      toast({
        title: '❌ Dati incompleti',
        description: 'Inserisci nome e prezzo del prodotto personalizzato',
        variant: 'destructive',
      });
      return;
    }
    
    let productId = `custom_${Date.now()}`;
    
    // Se "Salva nel catalogo" è attivo, crea il prodotto in Firestore
    if (saveToCatalog) {
      try {
        productId = await createProduct({
          nome: customNome,
          descrizione: 'Prodotto personalizzato creato da ordine',
          prezzo: customPrezzo,
          sconto: 0,
          numeroFoto: customNumeroFoto,
          categoria: 'pacchetto',
          attivo: true,
          immagini: [],
        });
        
        toast({
          title: '✅ Prodotto salvato',
          description: 'Il prodotto è stato aggiunto al catalogo',
        });
        
        // Invalida cache prodotti
        queryClient.invalidateQueries({ queryKey: ['products'] });
      } catch (error: any) {
        toast({
          title: '❌ Errore salvataggio',
          description: error.message || 'Impossibile salvare il prodotto nel catalogo',
          variant: 'destructive',
        });
        return;
      }
    }
    
    // Aggiungi all'ordine
    const newItem: OrderItem = {
      prodottoId: saveToCatalog ? productId : '', // ID vuoto per prodotti one-time
      prodottoNome: customNome,
      prodottoPrezzo: customPrezzo,
      prodottoNumeroFoto: customNumeroFoto,
      quantita: customQuantita,
    };
    
    setSelectedProdotti([...selectedProdotti, newItem]);
    
    // Reset form
    setCustomNome('');
    setCustomPrezzo(0);
    setCustomNumeroFoto(0);
    setCustomQuantita(1);
    setSaveToCatalog(false);
    setShowCustomProduct(false);
  };
  
  // Salva modifiche ordine
  const handleSave = () => {
    if (!order) return;
    
    if (selectedProdotti.length === 0) {
      toast({
        title: '❌ Errore',
        description: 'Aggiungi almeno un prodotto all\'ordine',
        variant: 'destructive',
      });
      return;
    }
    
    // Rimuovo validazione acconto perché è ora read-only
    
    updateOrderMutation.mutate({
      orderId: order.id,
      data: {
        prodotti: selectedProdotti,
        nomeCliente,
        emailCliente,
        whatsappCliente: whatsappCliente || null,
        note: note || null,
        stato,
        sconto: sconto || 0,
      }
    });
  };
  
  if (!order) return null;
  
  return (
    <Dialog open={!!order} onOpenChange={onClose}>
      <DialogContent 
        className="max-w-4xl max-h-[90vh] overflow-y-auto"
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Modifica Ordine #{order.id.slice(0, 8)}
          </DialogTitle>
          <DialogDescription>
            Le modifiche verranno salvate e il cliente riceverà automaticamente una email di conferma.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Dati Cliente */}
          <div className="space-y-4 border-b pb-4">
            <h3 className="font-semibold text-lg">👤 Dati Cliente</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="nomeCliente">Nome Cliente</Label>
                <Input
                  id="nomeCliente"
                  value={nomeCliente}
                  onChange={(e) => setNomeCliente(e.target.value)}
                  placeholder="Es. Mario Rossi"
                />
              </div>
              <div>
                <Label htmlFor="emailCliente">Email Cliente</Label>
                <Input
                  id="emailCliente"
                  type="email"
                  value={emailCliente}
                  onChange={(e) => setEmailCliente(e.target.value)}
                  placeholder="cliente@example.com"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="whatsapp">WhatsApp</Label>
                <Input
                  id="whatsapp"
                  value={whatsappCliente}
                  onChange={(e) => setWhatsappCliente(e.target.value)}
                  placeholder="3XX XXX XXXX"
                />
              </div>
              <div>
                <Label htmlFor="stato">Stato Ordine</Label>
                <Select value={stato} onValueChange={(value: any) => setStato(value)}>
                  <SelectTrigger id="stato">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bozza">Bozza</SelectItem>
                    <SelectItem value="in_lavorazione">In Lavorazione</SelectItem>
                    <SelectItem value="completato">Completato</SelectItem>
                    <SelectItem value="annullato">Annullato</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          
          {/* Prodotti */}
          <div className="space-y-4 border-b pb-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">🛍️ Prodotti</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowCustomProduct(!showCustomProduct)}
              >
                <Plus className="w-4 h-4 mr-2" />
                Prodotto Personalizzato
              </Button>
            </div>
            
            {/* Aggiungi dal catalogo con filtro categoria e ricerca */}
            <ProductSelector
              products={products}
              categories={categories}
              onSelectProduct={handleAddProduct}
              placeholder="Seleziona prodotto dal catalogo..."
            />
            
            {/* Form prodotto custom */}
            {showCustomProduct && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
                <h4 className="font-medium text-sm text-blue-900">➕ Nuovo Prodotto Personalizzato</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <Label htmlFor="customNome">Nome Prodotto *</Label>
                    <Input
                      id="customNome"
                      value={customNome}
                      onChange={(e) => setCustomNome(e.target.value)}
                      placeholder="Es. Album Deluxe Personalizzato"
                    />
                  </div>
                  <div>
                    <Label htmlFor="customPrezzo">Prezzo (€) *</Label>
                    <Input
                      id="customPrezzo"
                      type="number"
                      min="0"
                      step="0.01"
                      value={customPrezzo}
                      onChange={(e) => setCustomPrezzo(parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <Label htmlFor="customNumeroFoto">Numero Foto</Label>
                    <Input
                      id="customNumeroFoto"
                      type="number"
                      min="0"
                      value={customNumeroFoto}
                      onChange={(e) => setCustomNumeroFoto(parseInt(e.target.value) || 0)}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <Label htmlFor="customQuantita">Quantità</Label>
                    <QuantityInput
                      value={customQuantita}
                      onChange={setCustomQuantita}
                      min={1}
                      max={99}
                      size="md"
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-6">
                    <input
                      type="checkbox"
                      id="saveToCatalog"
                      checked={saveToCatalog}
                      onChange={(e) => setSaveToCatalog(e.target.checked)}
                      className="w-4 h-4"
                    />
                    <Label htmlFor="saveToCatalog" className="cursor-pointer">
                      Salva nel catalogo prodotti
                    </Label>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleAddCustomProduct}
                    className="flex-1"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Aggiungi Prodotto
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowCustomProduct(false)}
                  >
                    Annulla
                  </Button>
                </div>
              </div>
            )}
            
            {/* Lista prodotti selezionati */}
            <div className="space-y-2">
              {selectedProdotti.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nessun prodotto selezionato
                </p>
              ) : (
                selectedProdotti.map((item, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 p-3 bg-gray-50 rounded border"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{item.prodottoNome}</p>
                        {!item.prodottoId && (
                          <Badge variant="secondary" className="text-xs">Custom</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        €{item.prodottoPrezzo.toFixed(2)} · {item.prodottoNumeroFoto} foto
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs">Qtà:</Label>
                      <QuantityInput
                        value={item.quantita}
                        onChange={(val) => handleUpdateQuantity(index, val)}
                        min={1}
                        max={99}
                        size="sm"
                      />
                    </div>
                    <div className="text-right min-w-[80px]">
                      <p className="font-semibold">€{(item.prodottoPrezzo * item.quantita).toFixed(2)}</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveProduct(index)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
          
          {/* Totali */}
          <div className="space-y-3 border-b pb-4">
            <h3 className="font-semibold text-lg">💰 Riepilogo Prezzi</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotale:</span>
                <span className="font-semibold text-lg">€{subtotale.toFixed(2)}</span>
              </div>
              
              {/* Sconto */}
              <div className="flex justify-between items-center">
                <Label className="min-w-[120px] text-muted-foreground">Sconto (€):</Label>
                <Input
                  type="number"
                  min="0"
                  max={subtotale}
                  step="0.01"
                  value={sconto}
                  onChange={(e) => setSconto(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-32 text-right"
                  placeholder="0.00"
                />
              </div>
              
              {sconto > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground font-medium">Totale con sconto:</span>
                  <span className="font-bold text-lg text-green-700">€{totale.toFixed(2)}</span>
                </div>
              )}
              
              {/* Totale Pagato (read-only, calcolato da transactions) */}
              <div className="flex justify-between items-center">
                <Label className="min-w-[120px] text-muted-foreground">Totale Pagato:</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="text"
                    value={`€${totalePagato.toFixed(2)}`}
                    disabled
                    className="w-32 bg-gray-50 text-gray-700 font-semibold text-right cursor-not-allowed"
                  />
                  {(order?.transactions || []).length > 0 && (
                    <Badge variant="outline" className="text-xs">
                      {(order?.transactions || []).length} {(order?.transactions || []).length === 1 ? 'pagamento' : 'pagamenti'}
                    </Badge>
                  )}
                </div>
              </div>
              
              {/* Messaggio informativo */}
              <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-sm text-blue-800">
                <p className="font-medium mb-1">ℹ️ Gestione Pagamenti</p>
                <p className="text-xs">
                  Per registrare acconti o saldo, chiudi questa finestra e usa i pulsanti 
                  <strong> "Aggiungi Acconto" </strong> o <strong> "Registra Saldo" </strong> 
                  dalla lista ordini. Questo garantisce tracciamento completo dei pagamenti.
                </p>
              </div>
              
              <div className="flex justify-between text-lg pt-2">
                <span className="font-semibold">Saldo Residuo:</span>
                <span className={`font-bold ${saldo > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                  €{saldo.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
          
          {/* Cronologia Pagamenti */}
          {order.transactions && order.transactions.length > 0 && (
            <div className="space-y-3 border-b pb-4">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <Clock className="w-5 h-5" />
                📋 Cronologia Pagamenti
              </h3>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data e Ora</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-right">Importo</TableHead>
                      <TableHead>Metodo</TableHead>
                      <TableHead>Note</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {order.transactions
                      .sort((a, b) => {
                        // Helper per convertire timestamp in Date - gestisce Firestore Timestamp, ISO string, e millisecondi
                        const parseTransactionDate = (data: any): Date => {
                          if (!data) return new Date(0); // Fallback per sort
                          if (data.toDate && typeof data.toDate === 'function') return data.toDate(); // Firestore Timestamp
                          if (typeof data === 'string') return new Date(data); // ISO string
                          if (typeof data === 'number') return new Date(data); // Milliseconds
                          return new Date(0); // Fallback sicuro
                        };
                        
                        const dateA = parseTransactionDate(a.data);
                        const dateB = parseTransactionDate(b.data);
                        return dateB.getTime() - dateA.getTime();
                      })
                      .map((transaction, index) => {
                        // Helper per convertire timestamp in Date - gestisce Firestore Timestamp, ISO string, e millisecondi
                        const parseTransactionDate = (data: any): Date => {
                          if (!data) return new Date(); // Fallback per visualizzazione
                          if (data.toDate && typeof data.toDate === 'function') return data.toDate(); // Firestore Timestamp
                          if (typeof data === 'string') return new Date(data); // ISO string
                          if (typeof data === 'number') return new Date(data); // Milliseconds
                          return new Date(); // Fallback sicuro
                        };
                        
                        const date = parseTransactionDate(transaction.data);
                        
                        return (
                          <TableRow key={index}>
                            <TableCell className="font-medium">
                              {format(date, "dd MMMM yyyy 'alle' HH:mm", { locale: it })}
                            </TableCell>
                            <TableCell>
                              <Badge 
                                variant={transaction.tipo === 'acconto' ? 'default' : 'secondary'}
                                className={transaction.tipo === 'acconto' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}
                              >
                                {transaction.tipo === 'acconto' ? 'Acconto' : 'Saldo'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-semibold text-green-600">
                              +€{transaction.importo.toFixed(2)}
                            </TableCell>
                            <TableCell className="capitalize">
                              {transaction.metodo === 'contante' && '💵 Contante'}
                              {transaction.metodo === 'carta' && '💳 Carta'}
                              {transaction.metodo === 'bonifico' && '🏦 Bonifico'}
                              {transaction.metodo === 'paypal' && '📱 PayPal'}
                            </TableCell>
                            <TableCell className="text-sm text-gray-600">
                              {transaction.note || '-'}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              </div>
              
              {/* Riepilogo totale pagamenti */}
              <div className="bg-gray-50 rounded-md p-3 flex justify-between items-center">
                <span className="text-sm font-medium text-gray-700">Totale Versato:</span>
                <span className="text-lg font-bold text-green-600">
                  €{totalePagato.toFixed(2)}
                </span>
              </div>
            </div>
          )}
          
          {/* Note */}
          <div className="space-y-2">
            <Label htmlFor="note">Note</Label>
            <Textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note aggiuntive sull'ordine..."
              rows={3}
            />
          </div>
        </div>
        
        <DialogFooter className="flex !justify-between items-center">
          <div>
            {!showDeleteConfirm ? (
              <Button 
                variant="destructive" 
                size="sm"
                onClick={() => setShowDeleteConfirm(true)} 
                disabled={updateOrderMutation.isPending || deleteOrderMutation.isPending}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Elimina Ordine
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                <span className="text-sm text-red-600 font-medium">Sei sicuro?</span>
                <Button 
                  variant="destructive" 
                  size="sm"
                  onClick={() => order && deleteOrderMutation.mutate(order.id)}
                  disabled={deleteOrderMutation.isPending}
                >
                  {deleteOrderMutation.isPending ? 'Eliminazione...' : 'Conferma'}
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deleteOrderMutation.isPending}
                >
                  No
                </Button>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={updateOrderMutation.isPending}>
              Annulla
            </Button>
            <Button onClick={handleSave} disabled={updateOrderMutation.isPending}>
              {updateOrderMutation.isPending ? (
                <>Salvataggio...</>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Salva e Invia Email
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
