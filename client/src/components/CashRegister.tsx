/**
 * Cash Register - Registro Cassa Generale
 * Form per aggiungere/modificare movimenti entrate/uscite
 */

import { useState } from "react";
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
import { Plus, Edit, Trash, TrendingUp, TrendingDown, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getAllCashMovements, createCashMovement, updateCashMovement, deleteCashMovement } from "@/lib/cash";
import { CASH_CATEGORIES } from "@shared/cash-types";
import type { CashMovement, InsertCashMovement } from "@shared/cash-types";

export default function CashRegister() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingMovement, setEditingMovement] = useState<CashMovement | null>(null);
  const [formData, setFormData] = useState<InsertCashMovement>({
    tipo: "entrata",
    categoria: "",
    importo: 0,
    descrizione: "",
    data: new Date(),
    metodoPagamento: "contante",
    note: "",
  });

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
  const handleOpenDialog = (movement?: CashMovement) => {
    if (movement) {
      setEditingMovement(movement);
      setFormData({
        tipo: movement.tipo,
        categoria: movement.categoria,
        importo: movement.importo,
        descrizione: movement.descrizione,
        data: movement.data instanceof Timestamp ? movement.data.toDate() : new Date(movement.data),
        metodoPagamento: movement.metodoPagamento,
        note: movement.note || "",
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
      createMutation.mutate(formData);
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

  // Categorie disponibili in base al tipo
  const availableCategories = formData.tipo === "entrata" 
    ? CASH_CATEGORIES.entrata 
    : CASH_CATEGORIES.uscita;

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

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="mr-2 h-4 w-4" />
              Nuovo Movimento
            </Button>
          </DialogTrigger>

          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-lg sm:text-xl">
                {editingMovement ? "Modifica Movimento" : "Nuovo Movimento Cassa"}
              </DialogTitle>
              <DialogDescription className="text-sm">
                Registra entrate o uscite non legate agli ordini
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
              {/* Tipo */}
              <div className="space-y-1.5 sm:space-y-2">
                <Label className="text-sm">Tipo Movimento *</Label>
                <Select
                  value={formData.tipo}
                  onValueChange={(value: "entrata" | "uscita") => {
                    setFormData({ ...formData, tipo: value, categoria: "" });
                  }}
                >
                  <SelectTrigger className="h-10">
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
              <div className="space-y-1.5 sm:space-y-2">
                <Label className="text-sm">Categoria *</Label>
                <Select
                  value={formData.categoria}
                  onValueChange={(value) => setFormData({ ...formData, categoria: value })}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Seleziona categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableCategories.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Importo */}
              <div className="space-y-1.5 sm:space-y-2">
                <Label className="text-sm">Importo (€) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.importo}
                  onChange={(e) => setFormData({ ...formData, importo: parseFloat(e.target.value) || 0 })}
                  placeholder="0.00"
                  className="h-10"
                />
              </div>

              {/* Descrizione */}
              <div className="space-y-1.5 sm:space-y-2">
                <Label className="text-sm">Descrizione *</Label>
                <Input
                  value={formData.descrizione}
                  onChange={(e) => setFormData({ ...formData, descrizione: e.target.value })}
                  placeholder="Es: Acquisto obiettivo 50mm"
                  className="h-10"
                />
              </div>

              {/* Data */}
              <div className="space-y-1.5 sm:space-y-2">
                <Label className="text-sm">Data *</Label>
                <Input
                  type="date"
                  value={formData.data.toISOString().split("T")[0]}
                  onChange={(e) => setFormData({ ...formData, data: new Date(e.target.value) })}
                  className="h-10"
                />
              </div>

              {/* Metodo Pagamento */}
              <div className="space-y-1.5 sm:space-y-2">
                <Label className="text-sm">Metodo Pagamento</Label>
                <Select
                  value={formData.metodoPagamento}
                  onValueChange={(value: any) => setFormData({ ...formData, metodoPagamento: value })}
                >
                  <SelectTrigger className="h-10">
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

              {/* Note */}
              <div className="space-y-1.5 sm:space-y-2">
                <Label className="text-sm">Note</Label>
                <Textarea
                  value={formData.note}
                  onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                  placeholder="Note aggiuntive (opzionali)"
                  rows={2}
                  className="resize-none text-sm"
                />
              </div>

              <DialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-0 pt-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={handleCloseDialog}
                  className="w-full sm:w-auto"
                >
                  Annulla
                </Button>
                <Button 
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="w-full sm:w-auto"
                >
                  {editingMovement ? "Salva Modifiche" : "Registra Movimento"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Tabella Movimenti */}
      <Card>
        <CardHeader>
          <CardTitle>Tutti i Movimenti</CardTitle>
          <CardDescription>
            {movements?.length || 0} movimenti registrati
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Caricamento movimenti...
            </div>
          ) : !movements || movements.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nessun movimento registrato. Aggiungi il primo movimento cliccando "Nuovo Movimento".
            </div>
          ) : (
            <div className="rounded-md border">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-sm font-semibold">Data</th>
                    <th className="px-4 py-2 text-left text-sm font-semibold">Tipo</th>
                    <th className="px-4 py-2 text-left text-sm font-semibold">Categoria</th>
                    <th className="px-4 py-2 text-left text-sm font-semibold">Descrizione</th>
                    <th className="px-4 py-2 text-left text-sm font-semibold">Importo</th>
                    <th className="px-4 py-2 text-left text-sm font-semibold">Metodo</th>
                    <th className="px-4 py-2 text-right text-sm font-semibold">Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((mov) => (
                    <tr key={mov.id} className="border-t hover:bg-gray-50">
                      <td className="px-4 py-2 text-sm">
                        {toDate(mov.data).toLocaleDateString("it-IT")}
                      </td>
                      <td className="px-4 py-2 text-sm">
                        <span
                          className={`px-2 py-1 rounded text-xs ${
                            mov.tipo === "entrata"
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {mov.tipo === "entrata" ? "⬆️ Entrata" : "⬇️ Uscita"}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-sm text-muted-foreground">
                        {mov.categoria}
                      </td>
                      <td className="px-4 py-2 text-sm">{mov.descrizione}</td>
                      <td
                        className={`px-4 py-2 text-sm font-semibold ${
                          mov.tipo === "entrata" ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {mov.tipo === "entrata" ? "+" : "-"}
                        {formatCurrency(mov.importo)}
                      </td>
                      <td className="px-4 py-2 text-sm">{mov.metodoPagamento}</td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenDialog(mov)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>

                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="sm" className="text-red-600">
                                <Trash className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Conferma Eliminazione</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Sei sicuro di voler eliminare questo movimento? Questa
                                  azione non può essere annullata.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Annulla</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteMutation.mutate(mov.id)}
                                  className="bg-red-600 hover:bg-red-700"
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
    </div>
  );
}
