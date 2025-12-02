import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  ArrowRight, 
  Plus, 
  X, 
  Check, 
  AlertCircle,
  Layers,
  Link2,
  Ban
} from 'lucide-react';
import { JobTypeIcon } from '@/lib/job-type-icons';

interface DiscoveredJobType {
  nome: string;
  slug: string;
  count: number;
}

interface ExistingJobType {
  id: string;
  nome: string;
  slug: string;
  colore: string;
  icona: string;
  createdBy?: string;
}

export interface JobTypeMapping {
  originalName: string;
  action: 'map' | 'create' | 'skip';
  targetSlug?: string;
  newName?: string;
}

interface JobTypeMappingPanelProps {
  discoveredJobTypes: DiscoveredJobType[];
  existingJobTypes: ExistingJobType[];
  initialMappings?: JobTypeMapping[];
  onMappingComplete: (mappings: JobTypeMapping[]) => void;
  onCancel: (currentMappings: JobTypeMapping[]) => void;
}

export default function JobTypeMappingPanel({
  discoveredJobTypes,
  existingJobTypes,
  initialMappings,
  onMappingComplete,
  onCancel,
}: JobTypeMappingPanelProps) {
  const [mappings, setMappings] = useState<Record<string, JobTypeMapping>>(() => {
    const initial: Record<string, JobTypeMapping> = {};
    
    // ✅ Se ci sono mapping iniziali (utente ha navigato indietro), usali
    if (initialMappings && initialMappings.length > 0) {
      for (const mapping of initialMappings) {
        initial[mapping.originalName] = mapping;
      }
      return initial;
    }
    
    // Altrimenti, auto-detect basato su slug/nome match
    for (const discovered of discoveredJobTypes) {
      const matchingExisting = existingJobTypes.find(
        e => e.slug === discovered.slug || e.nome.toLowerCase() === discovered.nome.toLowerCase()
      );
      
      if (matchingExisting) {
        initial[discovered.nome] = {
          originalName: discovered.nome,
          action: 'map',
          targetSlug: matchingExisting.slug,
        };
      } else {
        initial[discovered.nome] = {
          originalName: discovered.nome,
          action: 'create',
        };
      }
    }
    
    return initial;
  });

  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  const stats = useMemo(() => {
    const mapped = Object.values(mappings).filter(m => m.action === 'map').length;
    const toCreate = Object.values(mappings).filter(m => m.action === 'create').length;
    const skipped = Object.values(mappings).filter(m => m.action === 'skip').length;
    const totalJobs = discoveredJobTypes.reduce((sum, t) => sum + t.count, 0);
    const skippedJobs = discoveredJobTypes
      .filter(t => mappings[t.nome]?.action === 'skip')
      .reduce((sum, t) => sum + t.count, 0);
    
    return { mapped, toCreate, skipped, totalJobs, skippedJobs };
  }, [mappings, discoveredJobTypes]);

  const handleSelectAll = () => {
    if (selectedItems.size === discoveredJobTypes.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(discoveredJobTypes.map(t => t.nome)));
    }
  };

  const handleToggleSelect = (nome: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(nome)) {
      newSelected.delete(nome);
    } else {
      newSelected.add(nome);
    }
    setSelectedItems(newSelected);
  };

  const handleBulkAction = (action: 'create' | 'skip', targetSlug?: string) => {
    const newMappings = { ...mappings };
    
    for (const nome of selectedItems) {
      if (action === 'create') {
        newMappings[nome] = {
          originalName: nome,
          action: 'create',
        };
      } else if (action === 'skip') {
        newMappings[nome] = {
          originalName: nome,
          action: 'skip',
        };
      }
    }
    
    setMappings(newMappings);
    setSelectedItems(new Set());
  };

  const handleBulkMapTo = (targetSlug: string) => {
    const newMappings = { ...mappings };
    
    for (const nome of selectedItems) {
      newMappings[nome] = {
        originalName: nome,
        action: 'map',
        targetSlug,
      };
    }
    
    setMappings(newMappings);
    setSelectedItems(new Set());
  };

  const handleSingleAction = (nome: string, action: 'map' | 'create' | 'skip', targetSlug?: string) => {
    setMappings(prev => ({
      ...prev,
      [nome]: {
        originalName: nome,
        action,
        targetSlug,
      },
    }));
  };

  const handleConfirm = () => {
    onMappingComplete(Object.values(mappings));
  };

  const getActionBadge = (mapping: JobTypeMapping) => {
    switch (mapping.action) {
      case 'map':
        const target = existingJobTypes.find(e => e.slug === mapping.targetSlug);
        return (
          <Badge variant="default" className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
            <Link2 className="h-3 w-3 mr-1" />
            → {target?.nome || mapping.targetSlug}
          </Badge>
        );
      case 'create':
        return (
          <Badge variant="default" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
            <Plus className="h-3 w-3 mr-1" />
            Nuovo
          </Badge>
        );
      case 'skip':
        return (
          <Badge variant="default" className="bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400">
            <Ban className="h-3 w-3 mr-1" />
            Escluso
          </Badge>
        );
    }
  };

  return (
    <Card className="border-2 border-blue-200 dark:border-blue-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Layers className="h-5 w-5" />
          Mapping Tipi di Lavoro
        </CardTitle>
        <CardDescription>
          Trovati {discoveredJobTypes.length} tipi di lavoro nel file. 
          Decidi come gestire ciascuno: mappalo a un tipo esistente, creane uno nuovo, o escludilo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-blue-600 dark:text-blue-400">
              <Link2 className="h-3 w-3 mr-1" />
              {stats.mapped} mappati
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-green-600 dark:text-green-400">
              <Plus className="h-3 w-3 mr-1" />
              {stats.toCreate} da creare
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-gray-600 dark:text-gray-400">
              <Ban className="h-3 w-3 mr-1" />
              {stats.skipped} esclusi
            </Badge>
          </div>
          {stats.skippedJobs > 0 && (
            <div className="flex items-center gap-2 text-sm text-yellow-600 dark:text-yellow-400">
              <AlertCircle className="h-4 w-4" />
              {stats.skippedJobs} job non verranno importati
            </div>
          )}
        </div>

        {selectedItems.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
              {selectedItems.size} selezionati:
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleBulkAction('create')}
              className="h-7 text-xs"
              data-testid="button-bulk-create"
            >
              <Plus className="h-3 w-3 mr-1" />
              Crea tutti
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleBulkAction('skip')}
              className="h-7 text-xs"
              data-testid="button-bulk-skip"
            >
              <Ban className="h-3 w-3 mr-1" />
              Escludi tutti
            </Button>
            <Select onValueChange={handleBulkMapTo}>
              <SelectTrigger className="w-[180px] h-7 text-xs" data-testid="select-bulk-map">
                <SelectValue placeholder="Mappa tutti a..." />
              </SelectTrigger>
              <SelectContent>
                {existingJobTypes.map(type => (
                  <SelectItem key={type.id} value={type.slug}>
                    <span className="flex items-center gap-2">
                      <JobTypeIcon slug={type.slug} size="sm" />
                      {type.nome}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedItems(new Set())}
              className="h-7 text-xs"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}

        <ScrollArea className="h-[400px] rounded-md border">
          <div className="p-4 space-y-2">
            <div className="flex items-center gap-3 pb-2 border-b mb-2">
              <Checkbox
                checked={selectedItems.size === discoveredJobTypes.length}
                onCheckedChange={handleSelectAll}
                data-testid="checkbox-select-all"
              />
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Seleziona tutti
              </span>
            </div>

            {discoveredJobTypes.map((discovered) => {
              const mapping = mappings[discovered.nome];
              const isSelected = selectedItems.has(discovered.nome);

              return (
                <div
                  key={discovered.nome}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                    isSelected 
                      ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700' 
                      : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700'
                  }`}
                  data-testid={`job-type-row-${discovered.slug}`}
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => handleToggleSelect(discovered.nome)}
                    data-testid={`checkbox-${discovered.slug}`}
                  />
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
                        {discovered.nome}
                      </span>
                      <Badge variant="secondary" className="text-xs">
                        {discovered.count} job
                      </Badge>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {getActionBadge(mapping)}
                    
                    <Select
                      value={mapping.action === 'map' ? mapping.targetSlug : mapping.action}
                      onValueChange={(value) => {
                        if (value === 'create' || value === 'skip') {
                          handleSingleAction(discovered.nome, value);
                        } else {
                          handleSingleAction(discovered.nome, 'map', value);
                        }
                      }}
                    >
                      <SelectTrigger className="w-[180px]" data-testid={`select-action-${discovered.slug}`}>
                        <SelectValue placeholder="Seleziona azione" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="create">
                          <div className="flex items-center gap-2">
                            <Plus className="h-4 w-4 text-green-600" />
                            Crea nuovo
                          </div>
                        </SelectItem>
                        <SelectItem value="skip">
                          <div className="flex items-center gap-2">
                            <Ban className="h-4 w-4 text-gray-500" />
                            Escludi
                          </div>
                        </SelectItem>
                        {existingJobTypes.length > 0 && (
                          <>
                            <div className="px-2 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 border-t mt-1">
                              Mappa a tipo esistente:
                            </div>
                            {existingJobTypes.map(type => (
                              <SelectItem key={type.id} value={type.slug}>
                                <div className="flex items-center gap-2">
                                  <Link2 className="h-4 w-4 text-blue-600" />
                                  <span 
                                    className="inline-block w-3 h-3 rounded-full mr-1" 
                                    style={{ backgroundColor: type.colore }}
                                  />
                                  <JobTypeIcon slug={type.slug} size="sm" />
                                  {type.nome}
                                  {type.createdBy === 'import' && (
                                    <Badge variant="outline" className="text-[10px] py-0 ml-1">
                                      importato
                                    </Badge>
                                  )}
                                </div>
                              </SelectItem>
                            ))}
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <div className="flex items-center justify-between pt-4 border-t">
          <Button variant="outline" onClick={() => onCancel(Object.values(mappings))} data-testid="button-cancel-mapping">
            Annulla
          </Button>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {stats.totalJobs - stats.skippedJobs} job verranno importati
            </span>
            <Button onClick={handleConfirm} data-testid="button-confirm-mapping">
              <Check className="h-4 w-4 mr-2" />
              Conferma Mapping
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
