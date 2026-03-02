/**
 * Cash Register - Registro Cassa Generale
 * Form per aggiungere/modificare movimenti entrate/uscite
 */

import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Timestamp } from "firebase/firestore";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Edit, Trash, TrendingUp, TrendingDown, Calendar, FileText, ShoppingBag } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getAllCashMovements, createCashMovement, updateCashMovement, deleteCashMovement, getCategoriesByTipo, getAllCashCategories, createCashCategory } from "@/lib/cash";
import { CASH_CATEGORIES } from "@shared/cash-types";
import type { CashMovementFE, InsertCashMovement } from "@shared/cash-types";
import { getAllCampaigns } from "@/lib/booking-campaigns";
import SendReceiptDialog from "./SendReceiptDialog";
import QuickOrderModal from "./QuickOrderModal";

export default function CashRegister() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingMovement, setEditingMovement] = useState<CashMovementFE | null>(null);
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);
  const [selectedMovement, setSelectedMovement] = useState<CashMovementFE | null>(null);
  const [quickOrderModalOpen, setQuickOrderModalOpen] = useState(false);
  const [filterTypeState, setFilterTypeState] = useState<"all" | "entrata" | "uscita">("all");
  const [filterCategoryState, setFilterCategoryState] = useState<string>("all");
  const [formData, setFormData] = useState<InsertCashMovement>({
    tipo: "entrata",
    categoria: "",
    importo: 0,
    descrizione: "",
    data: new Date(),
    metodoPagamento: "contante",
    note: "",
    origineTema: "",
  });
  const [newCategoryName, setNewCategoryName] = useState("");
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);

  // Query per categorie dinamiche
  const { data: dynamicCategories } = useQuery({
    queryKey: ["cash-categories"],
    queryFn: getAllCashCategories,
  });

  // Query per campagne (per selezione tema)
  const { data: campaigns } = useQuery({
    queryKey: ["booking-campaigns"],
    queryFn: getAllCampaigns,
  });

  // Ottieni categorie per il tipo corrente
  const availableCategories = (() => {
    if (!dynamicCategories || dynamicCategories.length === 0) {
      return CASH_CATEGORIES[formData.tipo];
    }
    return dynamicCategories
      .filter(c => c.attiva && (c.tipo === formData.tipo || c.tipo === "entrambi"))
      .map(c => c.nome);
  })();

  // Query per movimenti cassa
  const { data: movements, isLoading } = useQuery({
    queryKey: ["cash-movements"],
    queryFn: getAllCashMovements,
  });

  // Mutation per creare movimento
  const createMutation = useMutation({
    mutationFn: createCashMovement,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cash-movements"] });
      queryClient.invalidateQueries({ queryKey: ["financial-summary"] });
      queryClient.invalidateQueries({ queryKey: ["monthly-data"] });
      toast({
        title: "✅ Movimento registrato",
        description: "Il movimento di cassa è stato aggiunto con successo.",
      });
      handleCloseDialog();
    },
    onError: (error: any) => {
      toast({
        title: "❌ Errore",
        description: error.message || "Impossibile creare il movimento.",
        variant: "destructive",
      });
    },
  });

  // Mutation per aggiornare movimento
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<InsertCashMovement> }) =>
      updateCashMovement(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cash-movements"] });
      queryClient.invalidateQueries({ queryKey: ["financial-summary"] });
      queryClient.invalidateQueries({ queryKey: ["monthly-data"] });
      toast({
        title: "✅ Movimento aggiornato",
        description: "Le modifiche sono state salvate.",
      });
      handleCloseDialog();
    },
    onError: (error: any) => {
      toast({
        title: "❌ Errore",
        description: error.message || "Impossibile aggiornare il movimento.",
        variant: "destructive",
      });
    },
  });

  // Mutation per eliminare movimento
  const deleteMutation = useMutation({
    mutationFn: deleteCashMovement,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cash-movements"] });
      queryClient.invalidateQueries({ queryKey: ["financial-summary"] });
      queryClient.invalidateQueries({ queryKey: ["monthly-data"] });
      toast({
        title: "✅ Movimento eliminato",
        description: "Il movimento è stato rimosso dal registro cassa.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "❌ Errore",
        description: error.message || "Impossibile eliminare il movimento.",
        variant: "destructive",
      });
    },
  });

  // Handler form
  const handleOpenDialog = (movement?: CashMovementFE) => {
    if (movement) {
      setEditingMovement(movement);
      setFormData({
        tipo: movement.tipo,
        categoria: movement.categoria,
        importo: movement.importo,
        descrizione: movement.descrizione,
        data: movement.data instanceof Date ? movement.data : new Date(movement.data),
        metodoPagamento: movement.metodoPagamento,
        note: movement.note || "",
        origineTema: movement.origineTema || "",
      });
    } else {
      setEditingMovement(null);
      setFormData({
        tipo: "entrata",
        categoria: "",
        importo: 0,
        descrizione: "",
        data: new Date(),
        metodoPagamento: "contante",
        note: "",
        origineTema: "",
      });
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingMovement(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.categoria || formData.importo <= 0 || !formData.descrizione.trim()) {
      toast({
        title: "⚠️ Campi mancanti",
        description: "Compila tutti i campi obbligatori.",
        variant: "destructive",
      });
      return;
    }

    if (editingMovement) {
      updateMutation.mutate({ id: editingMovement.id, data: formData });
    } else {
      createMutation.mutate({
        ...formData,
        origine: 'manuale' as const,
      });
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: "EUR",
    }).format(value);
  };

  const toDate = (d: Date | Timestamp): Date => {
    return d instanceof Timestamp ? d.toDate() : d;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-xl font-semibold text-blue-gray">📝 Registro Cassa</h3>
          <p className="text-sm text-muted-foreground">
            Gestisci entrate e uscite non derivanti da ordini
          </p>
        </div>

        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => setQuickOrderModalOpen(true)}
            className="border-sage text-sage hover:bg-sage hover:text-white"
          >
            <ShoppingBag className="mr-2 h-4 w-4" />
            Ordine Rapido
          </Button>
          
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => handleOpenDialog()}>
                <Plus className="mr-2 h-4 w-4" />
                Nuovo Movimento
              </Button>
            </DialogTrigger>

            <DialogContent className="w-[95vw] max-w-md max-h-[95vh] overflow-y-auto p-4 sm:p-6">
            <DialogHeader className="space-y-1.5 sm:space-y-2">
              <DialogTitle className="text-base sm:text-lg md:text-xl">
                {editingMovement ? "Modifica Movimento" : "Nuovo Movimento Cassa"}
              </DialogTitle>
              <DialogDescription className="text-xs sm:text-sm">
                Registra entrate o uscite non legate agli ordini
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-2.5 sm:space-y-3 md:space-y-4">
              {/* Tipo */}
              <div className="space-y-1 sm:space-y-1.5">
                <Label className="text-xs sm:text-sm font-medium">Tipo Movimento *</Label>
                <Select
                  value={formData.tipo}
                  onValueChange={(value: "entrata" | "uscita") => {
                    setFormData({ ...formData, tipo: value, categoria: "" });
                  }}
                >
                  <SelectTrigger className="h-9 sm:h-10 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="entrata">
                      <span className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-green-600" />
                        Entrata
                      </span>
                    </SelectItem>
                    <SelectItem value="uscita">
                      <span className="flex items-center gap-2">
                        <TrendingDown className="h-4 w-4 text-red-600" />
                        Uscita
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Categoria */}
              <div className="space-y-1 sm:space-y-1.5">
                <Label className="text-xs sm:text-sm font-medium">Categoria *</Label>
                {showNewCategoryInput ? (
                  <div className="flex gap-2">
                    <Input
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder="Nome nuova categoria"
                      className="h-9 sm:h-10 text-sm flex-1"
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={async () => {
                        if (newCategoryName.trim()) {
                          await createCashCategory({
                            nome: newCategoryName.trim(),
                            tipo: formData.tipo,
                          });
                          queryClient.invalidateQueries({ queryKey: ["cash-categories"] });
                          setFormData({ ...formData, categoria: newCategoryName.trim() });
                          setNewCategoryName("");
                          setShowNewCategoryInput(false);
                          toast({
                            title: "✅ Categoria creata",
                            description: `"${newCategoryName.trim()}" aggiunta alle categorie`,
                          });
                        }
                      }}
                      className="h-9 sm:h-10"
                    >
                      Salva
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowNewCategoryInput(false);
                        setNewCategoryName("");
                      }}
                      className="h-9 sm:h-10"
                    >
                      ✕
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Select
                      value={formData.categoria}
                      onValueChange={(value) => {
                        if (value === "__new__") {
                          setShowNewCategoryInput(true);
                        } else {
                          setFormData({ ...formData, categoria: value });
                        }
                      }}
                    >
                      <SelectTrigger className="h-9 sm:h-10 text-sm flex-1">
                        <SelectValue placeholder="Seleziona categoria" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableCategories.map((cat) => (
                          <SelectItem key={cat} value={cat}>
                            {cat}
                          </SelectItem>
                        ))}
                        <SelectItem value="__new__" className="text-blue-600 font-medium">
                          + Nuova categoria...
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {/* Importo */}
              <div className="space-y-1 sm:space-y-1.5">
                <Label className="text-xs sm:text-sm font-medium">Importo (€) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.importo === 0 ? '' : formData.importo}
                  onChange={(e) => setFormData({ ...formData, importo: parseFloat(e.target.value) || 0 })}
                  placeholder="0.00"
                  className="h-9 sm:h-10 text-sm"
                />
              </div>

              {/* Descrizione */}
              <div className="space-y-1 sm:space-y-1.5">
                <Label className="text-xs sm:text-sm font-medium">Descrizione *</Label>
                <Input
                  value={formData.descrizione}
                  onChange={(e) => setFormData({ ...formData, descrizione: e.target.value })}
                  placeholder="Es: Acquisto obiettivo 50mm"
                  className="h-9 sm:h-10 text-sm"
                />
              </div>

              {/* Data */}
              <div className="space-y-1 sm:space-y-1.5">
                <Label className="text-xs sm:text-sm font-medium">Data *</Label>
                <Input
                  type="date"
                  value={formData.data.toISOString().split("T")[0]}
                  onChange={(e) => setFormData({ ...formData, data: new Date(e.target.value) })}
                  className="h-9 sm:h-10 text-sm"
                />
              </div>

              {/* Metodo Pagamento */}
              <div className="space-y-1 sm:space-y-1.5">
                <Label className="text-xs sm:text-sm font-medium">Metodo Pagamento</Label>
                <Select
                  value={formData.metodoPagamento}
                  onValueChange={(value: any) => setFormData({ ...formData, metodoPagamento: value })}
                >
                  <SelectTrigger className="h-9 sm:h-10 text-sm">
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

              {/* Tema/Campagna (per associare spese a campagne) */}
              <div className="space-y-1 sm:space-y-1.5">
                <Label className="text-xs sm:text-sm font-medium">Campagna/Tema</Label>
                <Select
                  value={formData.origineTema || ""}
                  onValueChange={(value) => setFormData({ ...formData, origineTema: value === "nessuno" ? "" : value })}
                >
                  <SelectTrigger className="h-9 sm:h-10 text-sm">
                    <SelectValue placeholder="Nessuna campagna" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nessuno">Nessuna campagna</SelectItem>
                    {campaigns?.filter(c => c.attiva).map((campaign) => (
                      <SelectItem key={campaign.id} value={campaign.nome}>
                        {campaign.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] sm:text-xs text-muted-foreground">
                  Associa questa {formData.tipo === "uscita" ? "spesa" : "entrata"} a una campagna
                </p>
              </div>

              {/* Note */}
              <div className="space-y-1 sm:space-y-1.5">
                <Label className="text-xs sm:text-sm font-medium">Note</Label>
                <Textarea
                  value={formData.note}
                  onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                  placeholder="Note aggiuntive (opzionali)"
                  rows={2}
                  className="resize-none text-xs sm:text-sm"
                />
              </div>

              <DialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-2 pt-3 sm:pt-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={handleCloseDialog}
                  className="w-full sm:w-auto h-9 sm:h-10 text-sm"
                >
                  Annulla
                </Button>
                <Button 
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="w-full sm:w-auto h-9 sm:h-10 text-sm"
                >
                  {editingMovement ? "Salva Modifiche" : "Registra Movimento"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      </div>

      {/* Tabella Movimenti - Responsive */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">Tutti i Movimenti</CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            {movements?.length || 0} movimenti registrati
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 sm:p-6">
          {isLoading ? (
            <div className="text-center py-8 text-xs sm:text-sm text-muted-foreground">
              Caricamento movimenti...
            </div>
          ) : !movements || movements.length === 0 ? (
            <div className="text-center py-8 px-4 text-xs sm:text-sm text-muted-foreground">
              Nessun movimento registrato. Aggiungi il primo movimento cliccando "Nuovo Movimento".
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full min-w-[800px]">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-2 sm:px-4 py-2 text-left text-xs sm:text-sm font-semibold whitespace-nowrap">Data</th>
                    <th className="px-2 sm:px-4 py-2 text-left text-xs sm:text-sm font-semibold whitespace-nowrap">Tipo</th>
                    <th className="px-2 sm:px-4 py-2 text-left text-xs sm:text-sm font-semibold whitespace-nowrap">Riferimento</th>
                    <th className="px-2 sm:px-4 py-2 text-left text-xs sm:text-sm font-semibold whitespace-nowrap">Categoria</th>
                    <th className="px-2 sm:px-4 py-2 text-left text-xs sm:text-sm font-semibold">Descrizione</th>
                    <th className="px-2 sm:px-4 py-2 text-left text-xs sm:text-sm font-semibold whitespace-nowrap">Importo</th>
                    <th className="px-2 sm:px-4 py-2 text-left text-xs sm:text-sm font-semibold whitespace-nowrap">Metodo</th>
                    <th className="px-2 sm:px-4 py-2 text-right text-xs sm:text-sm font-semibold whitespace-nowrap">Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((mov) => (
                    <tr key={mov.id} className="border-t hover:bg-gray-50">
                      <td className="px-2 sm:px-4 py-2 text-xs sm:text-sm whitespace-nowrap">
                        {toDate(mov.data).toLocaleDateString("it-IT")}
                      </td>
                      <td className="px-2 sm:px-4 py-2 text-xs sm:text-sm">
                        <span
                          className={`px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-[10px] sm:text-xs whitespace-nowrap ${
                            mov.tipo === "entrata"
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {mov.tipo === "entrata" ? "⬆️ Entrata" : "⬇️ Uscita"}
                        </span>
                      </td>
                      <td className="px-2 sm:px-4 py-2 text-xs sm:text-sm whitespace-nowrap">
                        {mov.jobId ? (
                          <Link href={`/admin/jobs/${mov.jobId}`} className="text-blue-600 font-medium hover:underline cursor-pointer" title={`Vai al lavoro`}>
                            💼 Lavoro
                          </Link>
                        ) : mov.orderId ? (
                          <Link href={`/admin/jobs?orderId=${mov.orderId}`} className="text-orange-600 font-medium hover:underline cursor-pointer" title={`Vai all'ordine`}>
                            🛒 Ordine
                          </Link>
                        ) : (
                          <span className="text-muted-foreground italic">Libero</span>
                        )}
                      </td>
                      <td className="px-2 sm:px-4 py-2 text-xs sm:text-sm text-muted-foreground whitespace-nowrap">
                        {mov.categoria}
                      </td>
                      <td className="px-2 sm:px-4 py-2 text-xs sm:text-sm max-w-[200px] truncate" title={mov.descrizione}>
                        {mov.descrizione}
                      </td>
                      <td
                        className={`px-2 sm:px-4 py-2 text-xs sm:text-sm font-semibold whitespace-nowrap ${
                          mov.tipo === "entrata" ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {mov.tipo === "entrata" ? "+" : "-"}
                        {formatCurrency(mov.importo)}
                      </td>
                      <td className="px-2 sm:px-4 py-2 text-xs sm:text-sm whitespace-nowrap">{mov.metodoPagamento}</td>
                      <td className="px-2 sm:px-4 py-2 text-right whitespace-nowrap">
                        <div className="flex justify-end gap-1 sm:gap-2">
                          {/* Pulsante "Invia Ricevuta" solo per movimenti ENTRATA */}
                          {mov.tipo === 'entrata' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedMovement(mov);
                                setReceiptDialogOpen(true);
                              }}
                              className="h-7 w-7 sm:h-8 sm:w-8 p-0 text-blue-600 hover:text-blue-800"
                              title="Invia Ricevuta Fiscale"
                            >
                              <FileText className="h-3 w-3 sm:h-4 sm:w-4" />
                            </Button>
                          )}
                          
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenDialog(mov)}
                            className="h-7 w-7 sm:h-8 sm:w-8 p-0"
                          >
                            <Edit className="h-3 w-3 sm:h-4 sm:w-4" />
                          </Button>

                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="sm" className="text-red-600 h-7 w-7 sm:h-8 sm:w-8 p-0">
                                <Trash className="h-3 w-3 sm:h-4 sm:w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="w-[95vw] max-w-md">
                              <AlertDialogHeader>
                                <AlertDialogTitle className="text-base sm:text-lg">Conferma Eliminazione</AlertDialogTitle>
                                <AlertDialogDescription className="text-xs sm:text-sm">
                                  Sei sicuro di voler eliminare questo movimento? Questa
                                  azione non può essere annullata.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter className="flex-col-reverse sm:flex-row gap-2">
                                <AlertDialogCancel className="w-full sm:w-auto text-xs sm:text-sm">Annulla</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteMutation.mutate(mov.id)}
                                  className="w-full sm:w-auto bg-red-600 hover:bg-red-700 text-xs sm:text-sm"
                                >
                                  Elimina
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog Invio Ricevuta */}
      {selectedMovement && (
        <SendReceiptDialog
          open={receiptDialogOpen}
          onOpenChange={setReceiptDialogOpen}
          movement={selectedMovement}
        />
      )}

      {/* Modal Ordine Rapido */}
      <QuickOrderModal
        isOpen={quickOrderModalOpen}
        onClose={() => setQuickOrderModalOpen(false)}
        onSuccess={() => {
          setQuickOrderModalOpen(false);
          queryClient.invalidateQueries({ queryKey: ['orders'] });
          queryClient.invalidateQueries({ queryKey: ['cash-movements'] });
        }}
      />
    </div>
  );
}
