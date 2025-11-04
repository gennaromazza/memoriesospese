/**
 * EditOrderModal - Modal per modificare ordini esistenti con email automatica
 */

import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { createProduct } from '@/lib/products';
import type { Order, Product, OrderItem } from '@shared/booking-types';
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
import { useToast } from '@/hooks/use-toast';
import { Trash2, Plus, Save, ShoppingCart, Package } from 'lucide-react';

interface EditOrderModalProps {
  order: Order | null;
  products: Product[];
  onClose: () => void;
}

export default function EditOrderModal({ order, products, onClose }: EditOrderModalProps) {
  const { toast } = useToast();
  
  // Prodotti selezionati nell'ordine
  const [selectedProdotti, setSelectedProdotti] = useState<OrderItem[]>([]);
  
  // Dati ordine
  const [nomeCliente, setNomeCliente] = useState('');
  const [emailCliente, setEmailCliente] = useState('');
  const [whatsappCliente, setWhatsappCliente] = useState('');
  const [note, setNote] = useState('');
  const [stato, setStato] = useState<'bozza' | 'in_lavorazione' | 'completato' | 'annullato'>('bozza');
  const [acconto, setAcconto] = useState(0);
  
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
      setNote(order.note || '');
      setStato(order.stato || 'bozza');
      setAcconto(order.acconto || 0);
    }
  }, [order]);
  
  // Calcola totali
  const totale = selectedProdotti.reduce((sum, item) => {
    return sum + (item.prodottoPrezzo * item.quantita);
  }, 0);
  
  const saldo = totale - acconto;
  
  // Mutation per update ordine
  const updateOrderMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest('PATCH', `/api/orders/${order!.id}`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: '✅ Ordine aggiornato',
        description: 'Le modifiche sono state salvate e il cliente ha ricevuto una email di conferma.',
      });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
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
    
    const newItem: OrderItem = {
      prodottoId: product.id,
      prodottoNome: product.nome,
      prodottoPrezzo: product.prezzoFinale,
      prodottoNumeroFoto: product.numeroFoto,
      quantita: 1,
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
    if (selectedProdotti.length === 0) {
      toast({
        title: '❌ Errore',
        description: 'Aggiungi almeno un prodotto all\'ordine',
        variant: 'destructive',
      });
      return;
    }
    
    if (acconto > totale) {
      toast({
        title: '❌ Errore',
        description: 'L\'acconto non può superare il totale',
        variant: 'destructive',
      });
      return;
    }
    
    updateOrderMutation.mutate({
      prodotti: selectedProdotti,
      nomeCliente,
      emailCliente,
      whatsappCliente: whatsappCliente || null,
      note: note || null,
      stato,
      acconto,
    });
  };
  
  if (!order) return null;
  
  return (
    <Dialog open={!!order} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
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
            
            {/* Aggiungi dal catalogo */}
            <div className="flex gap-2">
              <Select onValueChange={handleAddProduct}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Seleziona prodotto dal catalogo..." />
                </SelectTrigger>
                <SelectContent>
                  {products.map(product => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.nome} - €{product.prezzoFinale} ({product.numeroFoto} foto)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
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
                    <Input
                      id="customQuantita"
                      type="number"
                      min="1"
                      value={customQuantita}
                      onChange={(e) => setCustomQuantita(parseInt(e.target.value) || 1)}
                      placeholder="1"
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
                      <Input
                        type="number"
                        min="1"
                        value={item.quantita}
                        onChange={(e) => handleUpdateQuantity(index, parseInt(e.target.value) || 1)}
                        className="w-16 h-8 text-center"
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
                <span className="text-muted-foreground">Totale:</span>
                <span className="font-semibold text-lg">€{totale.toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-4">
                <Label htmlFor="acconto" className="min-w-[80px]">Acconto:</Label>
                <Input
                  id="acconto"
                  type="number"
                  min="0"
                  max={totale}
                  step="0.01"
                  value={acconto}
                  onChange={(e) => setAcconto(parseFloat(e.target.value) || 0)}
                  className="w-32"
                />
                <span className="text-muted-foreground">€</span>
              </div>
              <div className="flex justify-between text-lg">
                <span className="font-semibold">Saldo:</span>
                <span className={`font-bold ${saldo > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                  €{saldo.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
          
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
        
        <DialogFooter>
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
