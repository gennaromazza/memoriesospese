import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { collection, writeBatch, doc, setDoc, updateDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { getAllClienti, updateCliente, createCliente } from "@/lib/clienti";
import type { Cliente } from "@shared/clienti-types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Check, AlertCircle, Upload, Users, Briefcase, FileText, ShoppingCart, ArrowRight, Loader2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface LegacyCliente {
  id: string;
  nome: string;
  cognome: string;
  email?: string;
  telefono?: string;
  indirizzo?: string;
  citta?: string;
  cap?: string;
  provincia?: string;
  codiceFiscale?: string;
  note?: string;
}

interface LegacyJob {
  id: string;
  clientiIds: string[];
  nomeEvento: string;
  jobType: string;
  eventDate: string;
  eventLocation?: string;
  allDay?: boolean;
  provenance?: string;
  status: string;
  financials?: {
    totalePreventivato?: number;
    totalePagato?: number;
    totaleOrdini?: number;
    saldoResiduo?: number;
  };
  noteInterne?: string;
  quoteIds?: string[];
  orderIds?: string[];
  galleryIds?: string[];
  pdfs?: any[];
  costi?: any[];
  jobSource?: string;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface LegacyOrder {
  id: string;
  clienteId: string;
  jobId: string;
  totale: number;
  acconto: number;
  saldo: number;
  stato: string;
  prodotti: string[];
  transactions?: any[];
  dataServizio?: string;
}

interface LegacyQuote {
  id: string;
  jobId: string;
  clienteId: string;
  clientiInfo?: any[];
  jobInfo?: any;
  type: string;
  products?: any[];
  contractClauses?: any[];
  totaleBase?: number;
  totaleSelezionato?: number;
  totalBeforeDiscount?: number;
  totalAfterDiscount?: number;
  discountType?: string;
  discountValue?: number;
  theme?: any;
  signature?: any;
  status: string;
  publicToken?: string;
  sentTo?: string;
  emailSentAt?: string;
  viewedAt?: string;
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
}

interface LegacyPayment {
  id: string;
  tipo: string;
  importo: number;
  dataScadenza: string;
  stato: string;
  dataPagamento?: string;
  metodoPagamento?: string;
  note?: string;
}

interface LegacyPaymentSchedule {
  id: string;
  jobId: string;
  orderId: string;
  clienteId: string;
  totale: number;
  totalePagato: number;
  saldoResiduo: number;
  payments: LegacyPayment[];
}

interface LegacyData {
  clienti: LegacyCliente[];
  jobs: LegacyJob[];
  orders: LegacyOrder[];
  quotes: LegacyQuote[];
  paymentSchedules?: LegacyPaymentSchedule[];
}

interface ClientMapping {
  legacyId: string;
  legacyCliente: LegacyCliente;
  mappedToId: string | null;
  mappedCliente: Cliente | null;
  fieldsToUpdate: string[];
  createNew: boolean;
}

export default function AdminLegacyImporter() {
  const isAdmin = useIsAdmin();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [step, setStep] = useState(1);
  const [jsonText, setJsonText] = useState("");
  const [legacyData, setLegacyData] = useState<LegacyData | null>(null);
  const [existingClienti, setExistingClienti] = useState<Cliente[]>([]);
  const [clientMappings, setClientMappings] = useState<ClientMapping[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [importResult, setImportResult] = useState<{
    clientiCreated: number;
    clientiUpdated: number;
    jobsImported: number;
    ordersImported: number;
    quotesImported: number;
    paymentSchedulesImported: number;
  } | null>(null);

  useEffect(() => {
    if (isAdmin) {
      loadExistingClienti();
    }
  }, [isAdmin]);

  const loadExistingClienti = async () => {
    try {
      const clienti = await getAllClienti();
      setExistingClienti(clienti);
    } catch (error) {
      console.error("Errore caricamento clienti:", error);
      toast({
        title: "Errore",
        description: "Impossibile caricare i clienti esistenti",
        variant: "destructive",
      });
    }
  };

  if (!isAdmin) {
    return (
      <div className="max-w-7xl mx-auto py-6 px-4 text-center">
        <h1 className="text-2xl font-bold text-red-600">Accesso Negato</h1>
        <p className="mt-4">Solo gli amministratori possono accedere a questa pagina.</p>
        <Button onClick={() => navigate("/admin")} className="mt-4">
          Vai alla Dashboard Admin
        </Button>
      </div>
    );
  }

  const handleParse = () => {
    try {
      const data = JSON.parse(jsonText) as LegacyData;
      
      if (!data.clienti || !data.jobs) {
        throw new Error("Il JSON deve contenere almeno 'clienti' e 'jobs'");
      }
      
      setLegacyData(data);
      
      const mappings: ClientMapping[] = data.clienti.map((legacyCliente) => {
        const match = findBestMatch(legacyCliente, existingClienti);
        const fieldsToUpdate = match ? getFieldsToUpdate(legacyCliente, match) : [];
        
        return {
          legacyId: legacyCliente.id,
          legacyCliente,
          mappedToId: match?.id || null,
          mappedCliente: match || null,
          fieldsToUpdate,
          createNew: !match,
        };
      });
      
      setClientMappings(mappings);
      setStep(2);
      
      toast({
        title: "JSON Caricato",
        description: `Trovati ${data.clienti.length} clienti, ${data.jobs.length} lavori, ${data.orders?.length || 0} ordini, ${data.quotes?.length || 0} preventivi`,
      });
    } catch (err: any) {
      toast({
        title: "Errore JSON",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const findBestMatch = (legacy: LegacyCliente, existing: Cliente[]): Cliente | null => {
    const normalizedPhone = legacy.telefono?.replace(/\D/g, "") || "";
    const normalizedNome = legacy.nome?.toLowerCase().trim() || "";
    const normalizedCognome = legacy.cognome?.toLowerCase().trim() || "";
    
    for (const cliente of existing) {
      const clientePhone1 = cliente.cellulare1?.replace(/\D/g, "") || "";
      const clientePhone2 = cliente.cellulare2?.replace(/\D/g, "") || "";
      const clienteWhatsapp = cliente.whatsapp?.replace(/\D/g, "") || "";
      
      if (normalizedPhone && (
        clientePhone1 === normalizedPhone ||
        clientePhone2 === normalizedPhone ||
        clienteWhatsapp === normalizedPhone
      )) {
        return cliente;
      }
      
      const clienteNome = cliente.nome?.toLowerCase().trim() || "";
      const clienteCognome = cliente.cognome?.toLowerCase().trim() || "";
      
      if (normalizedNome && normalizedCognome &&
          clienteNome === normalizedNome && clienteCognome === normalizedCognome) {
        return cliente;
      }
      
      if (legacy.email && cliente.email &&
          legacy.email.toLowerCase() === cliente.email.toLowerCase()) {
        return cliente;
      }
    }
    
    return null;
  };

  const getFieldsToUpdate = (legacy: LegacyCliente, existing: Cliente): string[] => {
    const fields: string[] = [];
    
    if (!existing.cellulare1 && legacy.telefono) fields.push("telefono");
    if (!existing.via && legacy.indirizzo) fields.push("indirizzo");
    if (!existing.citta && legacy.citta) fields.push("città");
    if (!existing.cap && legacy.cap) fields.push("CAP");
    if (!existing.provincia && legacy.provincia) fields.push("provincia");
    if (!existing.note && legacy.note) fields.push("note");
    
    return fields;
  };

  const handleMappingChange = (legacyId: string, newMappedId: string) => {
    setClientMappings((prev) =>
      prev.map((m) => {
        if (m.legacyId === legacyId) {
          if (newMappedId === "__CREATE_NEW__") {
            return {
              ...m,
              mappedToId: null,
              mappedCliente: null,
              fieldsToUpdate: [],
              createNew: true,
            };
          }
          const mappedCliente = existingClienti.find((c) => c.id === newMappedId) || null;
          const fieldsToUpdate = mappedCliente ? getFieldsToUpdate(m.legacyCliente, mappedCliente) : [];
          return {
            ...m,
            mappedToId: newMappedId || null,
            mappedCliente,
            fieldsToUpdate,
            createNew: false,
          };
        }
        return m;
      })
    );
  };

  const allMapped = clientMappings.every((m) => m.mappedToId || m.createNew);

  const handleImport = async () => {
    if (!legacyData || !allMapped) return;
    
    setIsLoading(true);
    
    try {
      const idMap = new Map<string, string>();
      
      let clientiCreated = 0;
      let clientiUpdated = 0;
      
      for (const mapping of clientMappings) {
        const legacy = mapping.legacyCliente;
        
        if (mapping.createNew) {
          try {
            const newClienteId = await createCliente({
              nome: legacy.nome,
              cognome: legacy.cognome,
              email: legacy.email || `imported_${legacy.id}@placeholder.com`,
              cellulare1: legacy.telefono,
              via: legacy.indirizzo,
              citta: legacy.citta,
              cap: legacy.cap,
              provincia: legacy.provincia,
              note: legacy.note ? `${legacy.note}\n[Importato da legacy]` : "[Importato da legacy]",
              status: 'cliente_attivo',
            });
            if (!newClienteId) {
              throw new Error(`Creazione cliente fallita per ${legacy.nome} ${legacy.cognome}`);
            }
            idMap.set(mapping.legacyId, newClienteId);
            clientiCreated++;
            console.log(`✅ Creato cliente ${legacy.nome} ${legacy.cognome} con ID ${newClienteId}`);
          } catch (err) {
            console.error(`❌ Errore creazione cliente ${legacy.nome} ${legacy.cognome}:`, err);
            throw new Error(`Impossibile creare cliente ${legacy.nome} ${legacy.cognome}: ${err}`);
          }
        } else if (mapping.mappedToId) {
          idMap.set(mapping.legacyId, mapping.mappedToId);
          
          if (mapping.fieldsToUpdate.length > 0) {
            const updates: Record<string, any> = {};
            
            if (mapping.fieldsToUpdate.includes("telefono") && legacy.telefono) {
              updates.cellulare1 = legacy.telefono;
            }
            if (mapping.fieldsToUpdate.includes("indirizzo") && legacy.indirizzo) {
              updates.via = legacy.indirizzo;
            }
            if (mapping.fieldsToUpdate.includes("città") && legacy.citta) {
              updates.citta = legacy.citta;
            }
            if (mapping.fieldsToUpdate.includes("CAP") && legacy.cap) {
              updates.cap = legacy.cap;
            }
            if (mapping.fieldsToUpdate.includes("provincia") && legacy.provincia) {
              updates.provincia = legacy.provincia;
            }
            if (mapping.fieldsToUpdate.includes("note") && legacy.note) {
              updates.note = legacy.note;
            }
            
            if (Object.keys(updates).length > 0) {
              await updateCliente(mapping.mappedToId, updates);
              clientiUpdated++;
            }
          }
        }
      }
      
      const BATCH_LIMIT = 400;
      let batch = writeBatch(db);
      let operations = 0;
      
      const commitBatchIfNeeded = async () => {
        if (operations >= BATCH_LIMIT) {
          await batch.commit();
          batch = writeBatch(db);
          operations = 0;
        }
      };
      
      let jobsImported = 0;
      for (const job of legacyData.jobs) {
        const mappedClientiIds = job.clientiIds.map((oldId) => {
          const newId = idMap.get(oldId);
          if (!newId) {
            console.warn(`⚠️ ID cliente ${oldId} non trovato nel mapping, usando ID originale`);
          }
          return newId || oldId;
        });
        
        const jobData = {
          ...job,
          clientiIds: mappedClientiIds,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          importedFrom: "legacy_json",
          importedAt: serverTimestamp(),
        };
        
        const jobRef = doc(db, "jobs", job.id);
        batch.set(jobRef, jobData);
        operations++;
        jobsImported++;
        await commitBatchIfNeeded();
      }
      
      let ordersImported = 0;
      for (const order of legacyData.orders || []) {
        const mappedClienteId = idMap.get(order.clienteId) || order.clienteId;
        
        const orderData = {
          ...order,
          clienteId: mappedClienteId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          importedFrom: "legacy_json",
          importedAt: serverTimestamp(),
        };
        
        const orderRef = doc(db, "orders", order.id);
        batch.set(orderRef, orderData);
        operations++;
        ordersImported++;
        await commitBatchIfNeeded();
      }
      
      let quotesImported = 0;
      for (const quote of legacyData.quotes || []) {
        const mappedClienteId = idMap.get(quote.clienteId) || quote.clienteId;
        
        const mappedClientiInfo = quote.clientiInfo?.map((ci: any) => ({
          ...ci,
          id: idMap.get(ci.id) || ci.id,
        }));
        
        const quoteData = {
          ...quote,
          clienteId: mappedClienteId,
          clientiInfo: mappedClientiInfo,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          importedFrom: "legacy_json",
          importedAt: serverTimestamp(),
        };
        
        const quoteRef = doc(db, "quotes", quote.id);
        batch.set(quoteRef, quoteData);
        operations++;
        quotesImported++;
        await commitBatchIfNeeded();
      }
      
      let paymentSchedulesImported = 0;
      for (const schedule of legacyData.paymentSchedules || []) {
        const mappedClienteId = idMap.get(schedule.clienteId) || schedule.clienteId;
        
        const convertedPayments = schedule.payments.map((payment: LegacyPayment) => {
          const isPagato = payment.stato === 'pagato';
          return {
            ...payment,
            dataScadenza: payment.dataScadenza ? Timestamp.fromDate(new Date(payment.dataScadenza)) : null,
            dataPagamento: payment.dataPagamento ? Timestamp.fromDate(new Date(payment.dataPagamento)) : null,
            importoPagato: isPagato ? payment.importo : (payment as any).importoPagato || 0,
          };
        });
        
        const scheduleData = {
          ...schedule,
          clienteId: mappedClienteId,
          payments: convertedPayments,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          importedFrom: "legacy_json",
          importedAt: serverTimestamp(),
        };
        
        const scheduleRef = doc(db, "paymentSchedules", schedule.id);
        batch.set(scheduleRef, scheduleData);
        operations++;
        paymentSchedulesImported++;
        await commitBatchIfNeeded();
      }
      
      if (operations > 0) {
        await batch.commit();
      }
      
      setImportResult({
        clientiCreated,
        clientiUpdated,
        jobsImported,
        ordersImported,
        quotesImported,
        paymentSchedulesImported,
      });
      
      setStep(3);
      
      toast({
        title: "Importazione completata!",
        description: `${jobsImported} lavori, ${ordersImported} ordini, ${quotesImported} preventivi, ${paymentSchedulesImported} piani pagamento importati`,
      });
      
    } catch (error: any) {
      console.error("Errore importazione:", error);
      toast({
        title: "Errore durante l'importazione",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 lg:px-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold" data-testid="page-title">Importa da Vecchio Gestionale</h1>
          <p className="text-muted-foreground mt-1">
            Importa lavori, ordini e preventivi con mappatura clienti esistenti
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate("/admin/dashboard")}>
          Torna alla Dashboard
        </Button>
      </div>

      <div className="flex items-center gap-2 mb-6">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step >= s
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {step > s ? <Check className="w-4 h-4" /> : s}
            </div>
            {s < 3 && (
              <ArrowRight className={`w-4 h-4 mx-2 ${step > s ? "text-primary" : "text-muted-foreground"}`} />
            )}
          </div>
        ))}
        <span className="ml-4 text-sm text-muted-foreground">
          {step === 1 && "Carica JSON"}
          {step === 2 && "Mappa Clienti"}
          {step === 3 && "Completato"}
        </span>
      </div>

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5" />
              Carica JSON dal vecchio gestionale
            </CardTitle>
            <CardDescription>
              Incolla il JSON esportato contenente clienti, jobs, orders e quotes
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>JSON Data</Label>
              <Textarea
                rows={20}
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
                placeholder='{"clienti": [...], "jobs": [...], "orders": [...], "quotes": [...]}'
                className="font-mono text-sm"
                data-testid="input-json"
              />
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertCircle className="w-4 h-4" />
              Il JSON deve contenere almeno le chiavi "clienti" e "jobs"
            </div>
            <Button onClick={handleParse} disabled={!jsonText.trim()} data-testid="button-parse">
              Analizza JSON
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 2 && legacyData && (
        <div className="space-y-6">
          <div className="grid grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <Users className="w-8 h-8 text-blue-500" />
                  <div>
                    <p className="text-2xl font-bold">{legacyData.clienti.length}</p>
                    <p className="text-sm text-muted-foreground">Clienti da mappare</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <Briefcase className="w-8 h-8 text-green-500" />
                  <div>
                    <p className="text-2xl font-bold">{legacyData.jobs.length}</p>
                    <p className="text-sm text-muted-foreground">Lavori da importare</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <ShoppingCart className="w-8 h-8 text-orange-500" />
                  <div>
                    <p className="text-2xl font-bold">{legacyData.orders?.length || 0}</p>
                    <p className="text-sm text-muted-foreground">Ordini da importare</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <FileText className="w-8 h-8 text-purple-500" />
                  <div>
                    <p className="text-2xl font-bold">{legacyData.quotes?.length || 0}</p>
                    <p className="text-sm text-muted-foreground">Preventivi da importare</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Mappatura Clienti</CardTitle>
              <CardDescription>
                Collega ogni cliente del JSON al cliente corrispondente nel database.
                I campi mancanti verranno aggiornati automaticamente.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <div className="space-y-4">
                  {clientMappings.map((mapping) => (
                    <div
                      key={mapping.legacyId}
                      className={`p-4 border rounded-lg ${
                        mapping.mappedToId 
                          ? "border-green-200 bg-green-50" 
                          : mapping.createNew 
                            ? "border-blue-200 bg-blue-50"
                            : "border-orange-200 bg-orange-50"
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        <div className="flex-1">
                          <p className="font-medium">
                            {mapping.legacyCliente.nome} {mapping.legacyCliente.cognome}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Tel: {mapping.legacyCliente.telefono || "N/D"} |
                            Email: {mapping.legacyCliente.email || "N/D"}
                          </p>
                          {mapping.legacyCliente.indirizzo && (
                            <p className="text-sm text-muted-foreground">
                              {mapping.legacyCliente.indirizzo}
                            </p>
                          )}
                        </div>
                        
                        <ArrowRight className="w-5 h-5 text-muted-foreground mt-2" />
                        
                        <div className="flex-1">
                          <Select
                            value={mapping.createNew ? "__CREATE_NEW__" : (mapping.mappedToId || "")}
                            onValueChange={(value) => handleMappingChange(mapping.legacyId, value)}
                          >
                            <SelectTrigger className="w-full" data-testid={`select-client-${mapping.legacyId}`}>
                              <SelectValue placeholder="Seleziona cliente..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__CREATE_NEW__" className="text-blue-600 font-medium">
                                + Crea nuovo cliente
                              </SelectItem>
                              {existingClienti.map((cliente) => (
                                <SelectItem key={cliente.id} value={cliente.id}>
                                  {cliente.nome} {cliente.cognome}
                                  {cliente.cellulare1 && ` - ${cliente.cellulare1}`}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          
                          {mapping.createNew && (
                            <div className="mt-2">
                              <Badge variant="outline" className="text-blue-600 border-blue-300">
                                Verrà creato nuovo cliente
                              </Badge>
                            </div>
                          )}
                          
                          {mapping.mappedToId && mapping.fieldsToUpdate.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              <span className="text-xs text-muted-foreground">Campi da aggiornare:</span>
                              {mapping.fieldsToUpdate.map((field) => (
                                <Badge key={field} variant="secondary" className="text-xs">
                                  {field}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>
              Indietro
            </Button>
            <div className="flex items-center gap-4">
              {!allMapped && (
                <span className="text-sm text-orange-600">
                  <AlertCircle className="w-4 h-4 inline mr-1" />
                  Mappa tutti i clienti prima di procedere
                </span>
              )}
              <Button
                onClick={handleImport}
                disabled={!allMapped || isLoading}
                data-testid="button-import"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Importazione in corso...
                  </>
                ) : (
                  "Importa Tutto"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {step === 3 && importResult && (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center space-y-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <Check className="w-8 h-8 text-green-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-green-600">Importazione Completata!</h2>
                <p className="text-muted-foreground mt-2">
                  I dati sono stati importati correttamente nel database.
                </p>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 max-w-4xl mx-auto">
                <div className="p-4 bg-blue-50 rounded-lg">
                  <p className="text-2xl font-bold text-blue-600">{importResult.clientiCreated}</p>
                  <p className="text-sm text-muted-foreground">Clienti creati</p>
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-2xl font-bold">{importResult.clientiUpdated}</p>
                  <p className="text-sm text-muted-foreground">Clienti aggiornati</p>
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-2xl font-bold">{importResult.jobsImported}</p>
                  <p className="text-sm text-muted-foreground">Lavori importati</p>
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-2xl font-bold">{importResult.ordersImported}</p>
                  <p className="text-sm text-muted-foreground">Ordini importati</p>
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-2xl font-bold">{importResult.quotesImported}</p>
                  <p className="text-sm text-muted-foreground">Preventivi importati</p>
                </div>
                <div className="p-4 bg-green-50 rounded-lg">
                  <p className="text-2xl font-bold text-green-600">{importResult.paymentSchedulesImported}</p>
                  <p className="text-sm text-muted-foreground">Piani Pagamento</p>
                </div>
              </div>

              <div className="flex justify-center gap-4">
                <Button variant="outline" onClick={() => {
                  setStep(1);
                  setJsonText("");
                  setLegacyData(null);
                  setClientMappings([]);
                  setImportResult(null);
                }}>
                  Importa altro
                </Button>
                <Button onClick={() => navigate("/admin/jobs")}>
                  Vai ai Lavori
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
