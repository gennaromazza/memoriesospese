import { useState, useEffect, useCallback } from "react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import { Search, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ADMIN_NAV_GROUPS,
  getFlatNavItems,
  type FlatNavItem,
  type NavTarget,
} from "@/components/admin/adminNavigation";

const flatItems = getFlatNavItems();
const groupOrder = ADMIN_NAV_GROUPS.map((g) => g.label);

interface AdminCommandPaletteProps {
  onNavigate: (target: NavTarget) => void;
}

export function AdminCommandPalette({ onNavigate }: AdminCommandPaletteProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const handleSelect = useCallback(
    (item: FlatNavItem) => {
      onNavigate(item.target);
      setOpen(false);
    },
    [onNavigate],
  );

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="relative h-9 w-9 p-0 xl:h-10 xl:w-60 xl:justify-start xl:px-3 xl:py-2"
        onClick={() => setOpen(true)}
        data-testid="admin-search-button"
      >
        <Search className="h-4 w-4 xl:mr-2" />
        <span className="hidden xl:inline-flex">Cerca sezione...</span>
        <kbd className="pointer-events-none absolute right-1.5 top-2 hidden h-6 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 xl:flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Cerca una sezione del pannello..." />
        <CommandList>
          <CommandEmpty>Nessuna sezione trovata.</CommandEmpty>
          {groupOrder.map((group, index) => {
            const items = flatItems.filter((s) => s.group === group);
            if (items.length === 0) return null;
            return (
              <div key={group}>
                {index > 0 && <CommandSeparator />}
                <CommandGroup heading={group}>
                  {items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <CommandItem
                        key={item.id}
                        value={`${item.label} ${item.group}`}
                        onSelect={() => handleSelect(item)}
                        className="cursor-pointer"
                        data-testid={`command-item-${item.id}`}
                      >
                        <Icon className="mr-2 h-4 w-4" />
                        <span className="flex-1">{item.label}</span>
                        {item.target.newTab && (
                          <ExternalLink className="ml-2 h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </div>
            );
          })}
        </CommandList>
      </CommandDialog>
    </>
  );
}

export default AdminCommandPalette;
