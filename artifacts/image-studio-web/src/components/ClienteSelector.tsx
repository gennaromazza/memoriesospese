import { useState, useEffect, useMemo } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import type { Cliente } from "@shared/clienti-types";

type ClienteListItem = Pick<Cliente, 'id' | 'nome' | 'cognome' | 'email'>;

interface ClienteSelectorProps {
  value: string;
  onChange: (clienteId: string) => void;
  label?: string;
  placeholder?: string;
  showCurrentClient?: boolean;
  className?: string;
  disabled?: boolean;
}

function fuzzySearchClients(clients: ClienteListItem[], searchTerm: string): ClienteListItem[] {
  if (!searchTerm.trim()) return clients;
  
  const searchTerms = searchTerm.toLowerCase().trim().split(/\s+/).filter(t => t.length > 0);
  
  return clients.filter(cliente => {
    const clientText = `${cliente.nome} ${cliente.cognome} ${cliente.email || ''}`.toLowerCase();
    return searchTerms.every(term => clientText.includes(term));
  });
}

export function ClienteSelector({
  value,
  onChange,
  label = "Cliente",
  placeholder = "Cerca e seleziona cliente...",
  showCurrentClient = true,
  className = "",
  disabled = false
}: ClienteSelectorProps) {
  const [clientiList, setClientiList] = useState<ClienteListItem[]>([]);
  const [clienteSearch, setClienteSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadClienti = async () => {
      try {
        const snapshot = await getDocs(collection(db, "clienti"));
        const clienti = snapshot.docs.map(doc => ({
          id: doc.id,
          nome: doc.data().nome || "",
          cognome: doc.data().cognome || "",
          email: doc.data().email || ""
        }));
        clienti.sort((a, b) => `${a.cognome} ${a.nome}`.localeCompare(`${b.cognome} ${b.nome}`));
        setClientiList(clienti);
      } catch (error) {
        console.error("Errore caricamento clienti:", error);
      } finally {
        setIsLoading(false);
      }
    };
    loadClienti();
  }, []);

  const selectedClient = useMemo(() => 
    clientiList.find(c => c.id === value), 
    [clientiList, value]
  );

  const filteredClients = useMemo(() => 
    fuzzySearchClients(clientiList, clienteSearch).slice(0, 50),
    [clientiList, clienteSearch]
  );

  const totalMatchingClients = useMemo(() => 
    fuzzySearchClients(clientiList, clienteSearch).length,
    [clientiList, clienteSearch]
  );

  return (
    <div className={`border border-sage/30 rounded-lg p-4 bg-gradient-to-br from-sage/5 to-transparent ${className}`}>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-full bg-sage/20 flex items-center justify-center">
          <svg className="w-4 h-4 text-sage" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
        <Label className="text-base font-semibold text-sage-dark">{label}</Label>
      </div>
      
      {showCurrentClient && (
        <>
          {value && selectedClient ? (
            <div className="mb-3 p-3 bg-white rounded-lg border border-sage/20 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-sage text-white flex items-center justify-center font-semibold text-sm">
                    {`${selectedClient.nome[0] || ''}${selectedClient.cognome[0] || ''}`.toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">
                      {selectedClient.nome} {selectedClient.cognome}
                    </p>
                    <p className="text-sm text-gray-500">
                      {selectedClient.email || 'Nessuna email'}
                    </p>
                  </div>
                </div>
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  Selezionato
                </span>
              </div>
            </div>
          ) : (
            <div className="mb-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
              <p className="text-sm text-amber-700 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Nessun cliente selezionato
              </p>
            </div>
          )}
        </>
      )}
      
      <Select 
        value={value || "none"} 
        onValueChange={(val) => {
          onChange(val === "none" ? "" : val);
          setClienteSearch("");
        }}
        onOpenChange={(open) => { if (!open) setClienteSearch(""); }}
        disabled={disabled || isLoading}
      >
        <SelectTrigger className="bg-white" data-testid="select-cliente">
          <SelectValue placeholder={isLoading ? "Caricamento..." : placeholder} />
        </SelectTrigger>
        <SelectContent className="max-h-[300px]">
          <div className="p-2 border-b sticky top-0 bg-white z-10">
            <Input
              placeholder="Digita nome, cognome o email..."
              className="h-9"
              value={clienteSearch}
              onChange={(e) => setClienteSearch(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              data-testid="search-cliente"
            />
          </div>
          <SelectItem value="none" className="text-gray-500">
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Nessun cliente
            </span>
          </SelectItem>
          {filteredClients.map((cliente) => (
            <SelectItem key={cliente.id} value={cliente.id}>
              <span className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-sage/20 text-sage text-xs flex items-center justify-center font-medium shrink-0">
                  {`${cliente.nome[0] || ''}${cliente.cognome[0] || ''}`.toUpperCase()}
                </span>
                <span className="flex flex-col min-w-0">
                  <span className="font-medium truncate">{cliente.cognome} {cliente.nome}</span>
                  {cliente.email && <span className="text-xs text-gray-500 truncate">{cliente.email}</span>}
                </span>
              </span>
            </SelectItem>
          ))}
          {totalMatchingClients > 50 && (
            <div className="p-2 text-center text-xs text-gray-500 border-t">
              Mostra i primi 50 risultati - affina la ricerca
            </div>
          )}
          {totalMatchingClients === 0 && clienteSearch && (
            <div className="p-3 text-center text-sm text-gray-500">
              Nessun cliente trovato per "{clienteSearch}"
            </div>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}

interface ClienteSelectorWithSaveProps extends ClienteSelectorProps {
  onSave: (clienteId: string) => Promise<void>;
  isSaving?: boolean;
}

export function ClienteSelectorWithSave({
  value,
  onChange,
  onSave,
  isSaving = false,
  label = "Cliente Associato",
  placeholder = "Cerca e seleziona cliente...",
  showCurrentClient = true,
  className = "",
  disabled = false
}: ClienteSelectorWithSaveProps) {
  const [clientiList, setClientiList] = useState<ClienteListItem[]>([]);
  const [clienteSearch, setClienteSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadClienti = async () => {
      try {
        const snapshot = await getDocs(collection(db, "clienti"));
        const clienti = snapshot.docs.map(doc => ({
          id: doc.id,
          nome: doc.data().nome || "",
          cognome: doc.data().cognome || "",
          email: doc.data().email || ""
        }));
        clienti.sort((a, b) => `${a.cognome} ${a.nome}`.localeCompare(`${b.cognome} ${b.nome}`));
        setClientiList(clienti);
      } catch (error) {
        console.error("Errore caricamento clienti:", error);
      } finally {
        setIsLoading(false);
      }
    };
    loadClienti();
  }, []);

  const selectedClient = useMemo(() => 
    clientiList.find(c => c.id === value), 
    [clientiList, value]
  );

  const filteredClients = useMemo(() => 
    fuzzySearchClients(clientiList, clienteSearch).slice(0, 50),
    [clientiList, clienteSearch]
  );

  const totalMatchingClients = useMemo(() => 
    fuzzySearchClients(clientiList, clienteSearch).length,
    [clientiList, clienteSearch]
  );

  return (
    <div className={`border border-sage/30 rounded-lg p-4 bg-gradient-to-br from-sage/5 to-transparent ${className}`}>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-full bg-sage/20 flex items-center justify-center">
          <svg className="w-4 h-4 text-sage" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
        <Label className="text-base font-semibold text-sage-dark">{label}</Label>
      </div>
      
      {showCurrentClient && (
        <>
          {value && selectedClient ? (
            <div className="mb-3 p-3 bg-white rounded-lg border border-sage/20 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-sage text-white flex items-center justify-center font-semibold text-sm">
                    {`${selectedClient.nome[0] || ''}${selectedClient.cognome[0] || ''}`.toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">
                      {selectedClient.nome} {selectedClient.cognome}
                    </p>
                    <p className="text-sm text-gray-500">
                      {selectedClient.email || 'Nessuna email'}
                    </p>
                  </div>
                </div>
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  Collegato
                </span>
              </div>
            </div>
          ) : (
            <div className="mb-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
              <p className="text-sm text-amber-700 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Nessun cliente associato - seleziona per abilitare le notifiche
              </p>
            </div>
          )}
        </>
      )}
      
      <div className="flex gap-2">
        <Select 
          value={value || "none"} 
          onValueChange={(val) => {
            onChange(val === "none" ? "" : val);
            setClienteSearch("");
          }}
          onOpenChange={(open) => { if (!open) setClienteSearch(""); }}
          disabled={disabled || isLoading}
        >
          <SelectTrigger className="flex-1 bg-white" data-testid="select-cliente">
            <SelectValue placeholder={isLoading ? "Caricamento..." : placeholder} />
          </SelectTrigger>
          <SelectContent className="max-h-[300px]">
            <div className="p-2 border-b sticky top-0 bg-white z-10">
              <Input
                placeholder="Digita nome, cognome o email..."
                className="h-9"
                value={clienteSearch}
                onChange={(e) => setClienteSearch(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                data-testid="search-cliente"
              />
            </div>
            <SelectItem value="none" className="text-gray-500">
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Rimuovi associazione
              </span>
            </SelectItem>
            {filteredClients.map((cliente) => (
              <SelectItem key={cliente.id} value={cliente.id}>
                <span className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-sage/20 text-sage text-xs flex items-center justify-center font-medium shrink-0">
                    {`${cliente.nome[0] || ''}${cliente.cognome[0] || ''}`.toUpperCase()}
                  </span>
                  <span className="flex flex-col min-w-0">
                    <span className="font-medium truncate">{cliente.cognome} {cliente.nome}</span>
                    {cliente.email && <span className="text-xs text-gray-500 truncate">{cliente.email}</span>}
                  </span>
                </span>
              </SelectItem>
            ))}
            {totalMatchingClients > 50 && (
              <div className="p-2 text-center text-xs text-gray-500 border-t">
                Mostra i primi 50 risultati - affina la ricerca
              </div>
            )}
            {totalMatchingClients === 0 && clienteSearch && (
              <div className="p-3 text-center text-sm text-gray-500">
                Nessun cliente trovato per "{clienteSearch}"
              </div>
            )}
          </SelectContent>
        </Select>
        <button
          type="button"
          disabled={isSaving || isLoading}
          className={`min-w-[100px] px-4 py-2 rounded-md font-medium transition-colors flex items-center justify-center gap-2 ${
            value 
              ? "bg-sage hover:bg-sage/90 text-white" 
              : "border border-gray-300 bg-white hover:bg-gray-50 text-gray-700"
          } ${(isSaving || isLoading) ? 'opacity-50 cursor-not-allowed' : ''}`}
          onClick={() => onSave(value)}
          data-testid="button-associa-cliente"
        >
          {isSaving ? (
            <>
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Salvo...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Salva
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export function ClienteSelectorCompact({
  value,
  onChange,
  placeholder = "Seleziona cliente...",
  disabled = false,
  className = ""
}: Omit<ClienteSelectorProps, 'label' | 'showCurrentClient'>) {
  const [clientiList, setClientiList] = useState<ClienteListItem[]>([]);
  const [clienteSearch, setClienteSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadClienti = async () => {
      try {
        const snapshot = await getDocs(collection(db, "clienti"));
        const clienti = snapshot.docs.map(doc => ({
          id: doc.id,
          nome: doc.data().nome || "",
          cognome: doc.data().cognome || "",
          email: doc.data().email || ""
        }));
        clienti.sort((a, b) => `${a.cognome} ${a.nome}`.localeCompare(`${b.cognome} ${b.nome}`));
        setClientiList(clienti);
      } catch (error) {
        console.error("Errore caricamento clienti:", error);
      } finally {
        setIsLoading(false);
      }
    };
    loadClienti();
  }, []);

  const filteredClients = useMemo(() => 
    fuzzySearchClients(clientiList, clienteSearch).slice(0, 50),
    [clientiList, clienteSearch]
  );

  const totalMatchingClients = useMemo(() => 
    fuzzySearchClients(clientiList, clienteSearch).length,
    [clientiList, clienteSearch]
  );

  return (
    <Select 
      value={value || "none"} 
      onValueChange={(val) => {
        onChange(val === "none" ? "" : val);
        setClienteSearch("");
      }}
      onOpenChange={(open) => { if (!open) setClienteSearch(""); }}
      disabled={disabled || isLoading}
    >
      <SelectTrigger className={`bg-white ${className}`} data-testid="select-cliente">
        <SelectValue placeholder={isLoading ? "Caricamento..." : placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-[300px]">
        <div className="p-2 border-b sticky top-0 bg-white z-10">
          <Input
            placeholder="Digita nome, cognome o email..."
            className="h-9"
            value={clienteSearch}
            onChange={(e) => setClienteSearch(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            data-testid="search-cliente"
          />
        </div>
        <SelectItem value="none" className="text-gray-500">
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Nessun cliente
          </span>
        </SelectItem>
        {filteredClients.map((cliente) => (
          <SelectItem key={cliente.id} value={cliente.id}>
            <span className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-sage/20 text-sage text-xs flex items-center justify-center font-medium shrink-0">
                {`${cliente.nome[0] || ''}${cliente.cognome[0] || ''}`.toUpperCase()}
              </span>
              <span className="flex flex-col min-w-0">
                <span className="font-medium truncate">{cliente.cognome} {cliente.nome}</span>
                {cliente.email && <span className="text-xs text-gray-500 truncate">{cliente.email}</span>}
              </span>
            </span>
          </SelectItem>
        ))}
        {totalMatchingClients > 50 && (
          <div className="p-2 text-center text-xs text-gray-500 border-t">
            Mostra i primi 50 di {totalMatchingClients} risultati
          </div>
        )}
        {totalMatchingClients === 0 && clienteSearch && (
          <div className="p-3 text-center text-sm text-gray-500">
            Nessun cliente trovato
          </div>
        )}
      </SelectContent>
    </Select>
  );
}
