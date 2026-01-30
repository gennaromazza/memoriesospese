
/**
 * SendReceiptDialog - Invia ricevuta fiscale via email/WhatsApp
 * Con ricerca cliente integrata per recuperare contatti
 */

import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Mail, MessageCircle, Search, Loader2, Send } from "lucide-react";
import { getAllClienti } from "@/lib/clienti";
import { useToast } from "@/hooks/use-toast";
import type { CashMovementFE } from "@shared/cash-types";
import type { Cliente } from "@shared/clienti-types";

interface SendReceiptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  movement: CashMovementFE;
}

export default function SendReceiptDialog({
  open,
  onOpenChange,
  movement,
}: SendReceiptDialogProps) {
  const { toast } = useToast();
  const [sendMethod, setSendMethod] = useState<"email" | "whatsapp">("email");
  const [searchMode, setSearchMode] = useState<"manual" | "search">("manual");
  const [selectedClienteId, setSelectedClienteId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [manualEmail, setManualEmail] = useState("");
  const [manualWhatsApp, setManualWhatsApp] = useState("");
  const [manualNome, setManualNome] = useState("");
  const [manualCognome, setManualCognome] = useState("");
  const [sending, setSending] = useState(false);

  // Query clienti per ricerca (solo con almeno 2 caratteri)
  const { data: allClienti = [], isLoading: loadingClienti } = useQuery({
    queryKey: ["clienti-for-receipt"],
    queryFn: getAllClienti,
    enabled: open && searchMode === "search" && searchQuery.length >= 2,
  });

  // Filtra clienti in base alla query
  const filteredClienti = useMemo(() => {
    if (!searchQuery || searchQuery.length < 2) return [];
    const query = searchQuery.toLowerCase();
    return allClienti.filter(c => 
      c.nome.toLowerCase().includes(query) ||
      c.cognome.toLowerCase().includes(query) ||
      c.email.toLowerCase().includes(query) ||
      c.cellulare1?.includes(query) ||
      c.whatsapp?.includes(query)
    );
  }, [allClienti, searchQuery]);

  // Cliente selezionato
  const selectedCliente = allClienti.find((c) => c.id === selectedClienteId);

  // Reset search quando si chiude il dialog
  useEffect(() => {
    if (!open) {
      setSearchQuery("");
      setSelectedClienteId("");
    }
  }, [open]);

  const handleSendReceipt = async () => {
    let recipient = "";
    let clienteNome = "";
    let clienteCognome = "";

    // Determina destinatario in base a modalità
    if (searchMode === "search" && selectedCliente) {
      if (sendMethod === "email") {
        recipient = selectedCliente.email;
      } else {
        recipient = selectedCliente.whatsapp || selectedCliente.cellulare1 || "";
      }
      clienteNome = selectedCliente.nome;
      clienteCognome = selectedCliente.cognome;
    } else {
      // Modalità manuale
      recipient = sendMethod === "email" ? manualEmail : manualWhatsApp;
      clienteNome = manualNome;
      clienteCognome = manualCognome;
    }

    if (!recipient.trim()) {
      toast({
        title: "Destinatario mancante",
        description: `Inserisci ${sendMethod === "email" ? "un'email" : "un numero WhatsApp"} valido.`,
        variant: "destructive",
      });
      return;
    }

    setSending(true);

    try {
      const baseUrl = window.location.origin;
      const response = await fetch(`${baseUrl}/api/receipts/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          movementId: movement.id,
          method: sendMethod,
          recipient,
          clienteNome,
          clienteCognome,
        }),
      });

      if (!response.ok) {
        throw new Error("Errore invio ricevuta");
      }

      const result = await response.json();

      // Se WhatsApp, apri automaticamente il link wa.me
      if (sendMethod === "whatsapp" && result.whatsappLink) {
        window.open(result.whatsappLink, "_blank");
        toast({
          title: "WhatsApp aperto",
          description: `Messaggio precompilato pronto per ${recipient}. Clicca 'Invia' su WhatsApp.`,
        });
      } else {
        toast({
          title: "Ricevuta inviata",
          description: `Ricevuta inviata con successo via email a ${recipient}`,
        });
      }

      onOpenChange(false);
      resetForm();
    } catch (error) {
      console.error("Errore invio ricevuta:", error);
      toast({
        title: "Errore",
        description: "Impossibile inviare la ricevuta. Riprova.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const resetForm = () => {
    setSearchMode("manual");
    setSelectedClienteId("");
    setManualEmail("");
    setManualWhatsApp("");
    setManualNome("");
    setManualCognome("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg sm:text-xl">Invia Ricevuta</DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            Invia ricevuta per movimento di{" "}
            <strong className="text-green-600">
              €{movement.importo.toFixed(2)}
            </strong>{" "}
            - {movement.descrizione}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Metodo invio */}
          <Tabs value={sendMethod} onValueChange={(v) => setSendMethod(v as any)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="email" className="text-xs sm:text-sm">
                <Mail className="w-4 h-4 mr-2" />
                Email
              </TabsTrigger>
              <TabsTrigger value="whatsapp" className="text-xs sm:text-sm">
                <MessageCircle className="w-4 h-4 mr-2" />
                WhatsApp
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Modalità inserimento */}
          <Tabs value={searchMode} onValueChange={(v) => setSearchMode(v as any)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="manual" className="text-xs sm:text-sm">
                Inserimento Manuale
              </TabsTrigger>
              <TabsTrigger value="search" className="text-xs sm:text-sm">
                <Search className="w-4 h-4 mr-2" />
                Cerca Cliente
              </TabsTrigger>
            </TabsList>

            {/* Inserimento manuale */}
            <TabsContent value="manual" className="space-y-3">
              <div className="space-y-2">
                <Label className="text-xs sm:text-sm">Nome (opzionale)</Label>
                <Input
                  value={manualNome}
                  onChange={(e) => setManualNome(e.target.value)}
                  placeholder="Nome cliente"
                  className="text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs sm:text-sm">Cognome (opzionale)</Label>
                <Input
                  value={manualCognome}
                  onChange={(e) => setManualCognome(e.target.value)}
                  placeholder="Cognome cliente"
                  className="text-sm"
                />
              </div>
              {sendMethod === "email" ? (
                <div className="space-y-2">
                  <Label className="text-xs sm:text-sm">Email *</Label>
                  <Input
                    type="email"
                    value={manualEmail}
                    onChange={(e) => setManualEmail(e.target.value)}
                    placeholder="cliente@esempio.it"
                    className="text-sm"
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <Label className="text-xs sm:text-sm">Numero WhatsApp *</Label>
                  <Input
                    type="tel"
                    value={manualWhatsApp}
                    onChange={(e) => setManualWhatsApp(e.target.value)}
                    placeholder="+39 333 1234567"
                    className="text-sm"
                  />
                </div>
              )}
            </TabsContent>

            {/* Ricerca cliente */}
            <TabsContent value="search" className="space-y-3">
              <div className="space-y-2">
                <Label className="text-xs sm:text-sm">Cerca Cliente</Label>
                <Command className="rounded-lg border">
                  <CommandInput
                    placeholder="Digita nome, cognome o email (min 2 caratteri)..."
                    value={searchQuery}
                    onValueChange={setSearchQuery}
                  />
                  <CommandList>
                    {searchQuery.length < 2 ? (
                      <CommandEmpty>
                        Digita almeno 2 caratteri per cercare
                      </CommandEmpty>
                    ) : loadingClienti ? (
                      <div className="p-4 text-center">
                        <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">Ricerca in corso...</p>
                      </div>
                    ) : filteredClienti.length === 0 ? (
                      <CommandEmpty>
                        Nessun cliente trovato per "{searchQuery}"
                      </CommandEmpty>
                    ) : (
                      <CommandGroup>
                        {filteredClienti.map((cliente) => (
                          <CommandItem
                            key={cliente.id}
                            value={`${cliente.nome} ${cliente.cognome} ${cliente.email}`}
                            onSelect={() => {
                              setSelectedClienteId(cliente.id);
                              setSearchQuery(`${cliente.nome} ${cliente.cognome}`);
                            }}
                            className="cursor-pointer"
                          >
                            <div className="flex flex-col">
                              <span className="font-medium">
                                {cliente.nome} {cliente.cognome}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {cliente.email}
                              </span>
                              {(cliente.whatsapp || cliente.cellulare1) && (
                                <span className="text-xs text-muted-foreground">
                                  Tel: {cliente.whatsapp || cliente.cellulare1}
                                </span>
                              )}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                  </CommandList>
                </Command>
              </div>

              {/* Anteprima cliente selezionato */}
              {selectedCliente && (
                <div className="bg-gray-50 p-3 rounded-md space-y-1 text-sm border border-sage/20">
                  <p className="font-semibold text-sage">✓ Cliente Selezionato</p>
                  <p>
                    <strong>Nome:</strong> {selectedCliente.nome}{" "}
                    {selectedCliente.cognome}
                  </p>
                  {sendMethod === "email" && (
                    <p>
                      <strong>Email:</strong> {selectedCliente.email}
                    </p>
                  )}
                  {sendMethod === "whatsapp" && (
                    <p>
                      <strong>WhatsApp:</strong>{" "}
                      {selectedCliente.whatsapp || selectedCliente.cellulare1 || "N/D"}
                    </p>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto text-sm">
            Annulla
          </Button>
          <Button onClick={handleSendReceipt} disabled={sending} className="w-full sm:w-auto text-sm">
            {sending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Invio in corso...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Invia Ricevuta
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
