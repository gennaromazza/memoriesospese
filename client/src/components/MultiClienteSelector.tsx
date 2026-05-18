import { useState, useEffect, useMemo } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Button } from "./ui/button";
import { X, Users, UserPlus } from "lucide-react";
import type { Cliente } from "@shared/clienti-types";

type ClienteListItem = Pick<Cliente, "id" | "nome" | "cognome" | "email">;

interface MultiClienteSelectorProps {
  values: string[];
  onChange: (clientiIds: string[]) => void;
  label?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  emptyHint?: string;
}

function fuzzySearchClients(clients: ClienteListItem[], searchTerm: string): ClienteListItem[] {
  if (!searchTerm.trim()) return clients;
  const terms = searchTerm.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return clients.filter((c) => {
    const t = `${c.nome} ${c.cognome} ${c.email || ""}`.toLowerCase();
    return terms.every((term) => t.includes(term));
  });
}

export function MultiClienteSelector({
  values,
  onChange,
  label = "Clienti Associati",
  placeholder = "Aggiungi cliente...",
  className = "",
  disabled = false,
  emptyHint = "Nessun cliente associato",
}: MultiClienteSelectorProps) {
  const [clientiList, setClientiList] = useState<ClienteListItem[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDocs(collection(db, "clienti"));
        const list = snap.docs.map((d) => ({
          id: d.id,
          nome: d.data().nome || "",
          cognome: d.data().cognome || "",
          email: d.data().email || "",
        }));
        list.sort((a, b) => `${a.cognome} ${a.nome}`.localeCompare(`${b.cognome} ${b.nome}`));
        setClientiList(list);
      } catch (err) {
        console.error("Errore caricamento clienti:", err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const selected = useMemo(
    () => values.map((id) => clientiList.find((c) => c.id === id)).filter(Boolean) as ClienteListItem[],
    [values, clientiList],
  );

  const selectableClients = useMemo(
    () => fuzzySearchClients(clientiList, search).filter((c) => !values.includes(c.id)).slice(0, 50),
    [clientiList, search, values],
  );

  const handleAdd = (id: string) => {
    if (!id || values.includes(id)) return;
    onChange([...values, id]);
    setSearch("");
  };

  const handleRemove = (id: string) => {
    onChange(values.filter((v) => v !== id));
  };

  return (
    <div className={`border border-sage/30 rounded-lg p-4 bg-gradient-to-br from-sage/5 to-transparent ${className}`}>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-full bg-sage/20 flex items-center justify-center">
          <Users className="w-4 h-4 text-sage" />
        </div>
        <Label className="text-base font-semibold text-sage-dark">
          {label}
          {selected.length > 0 && (
            <span className="ml-2 text-xs font-normal text-sage">({selected.length})</span>
          )}
        </Label>
      </div>

      {selected.length > 0 ? (
        <div className="mb-3 space-y-2">
          {selected.map((c) => (
            <div
              key={c.id}
              className="p-3 bg-white rounded-lg border border-sage/20 shadow-sm flex items-center justify-between"
              data-testid={`chip-cliente-${c.id}`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-full bg-sage text-white flex items-center justify-center font-semibold text-sm shrink-0">
                  {`${c.nome[0] || ""}${c.cognome[0] || ""}`.toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 truncate">
                    {c.nome} {c.cognome}
                  </p>
                  <p className="text-sm text-gray-500 truncate">{c.email || "Nessuna email"}</p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-gray-400 hover:text-red-600 shrink-0"
                onClick={() => handleRemove(c.id)}
                disabled={disabled}
                data-testid={`button-remove-cliente-${c.id}`}
                aria-label={`Rimuovi ${c.nome} ${c.cognome}`}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <div className="mb-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
          <p className="text-sm text-amber-700">{emptyHint}</p>
        </div>
      )}

      <Select
        value=""
        onValueChange={(val) => handleAdd(val)}
        onOpenChange={(open) => {
          if (!open) setSearch("");
        }}
        disabled={disabled || isLoading}
      >
        <SelectTrigger className="bg-white" data-testid="select-add-cliente">
          <SelectValue
            placeholder={
              isLoading ? "Caricamento..." : selected.length > 0 ? "Aggiungi un altro cliente..." : placeholder
            }
          />
        </SelectTrigger>
        <SelectContent className="max-h-[300px]">
          <div className="p-2 border-b sticky top-0 bg-white z-10">
            <Input
              placeholder="Digita nome, cognome o email..."
              className="h-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              data-testid="search-cliente-multi"
            />
          </div>
          {selectableClients.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              <span className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-sage/20 text-sage text-xs flex items-center justify-center font-medium shrink-0">
                  {`${c.nome[0] || ""}${c.cognome[0] || ""}`.toUpperCase()}
                </span>
                <span className="flex flex-col min-w-0">
                  <span className="font-medium truncate">
                    {c.cognome} {c.nome}
                  </span>
                  {c.email && <span className="text-xs text-gray-500 truncate">{c.email}</span>}
                </span>
              </span>
            </SelectItem>
          ))}
          {selectableClients.length === 0 && search && (
            <div className="p-3 text-center text-sm text-gray-500">Nessun cliente trovato per "{search}"</div>
          )}
          {selectableClients.length === 0 && !search && clientiList.length > 0 && (
            <div className="p-3 text-center text-sm text-gray-500">
              <UserPlus className="w-4 h-4 inline mr-1" />
              Tutti i clienti sono già associati
            </div>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}
