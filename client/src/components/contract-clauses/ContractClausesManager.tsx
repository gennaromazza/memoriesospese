/**
 * CONTRACT CLAUSES MANAGER
 * Gestione template clausole contrattuali per tipo lavoro
 */

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  getAllClauseTemplates,
  createClauseTemplate,
  updateClauseTemplate,
  deleteClauseTemplate,
  setAsDefaultTemplate
} from '@/lib/contract-clauses';
import { useFirebaseAuth } from '@/context/FirebaseAuthContext';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Plus,
  FileText,
  Star,
  Trash2,
  Edit,
  Loader2,
  Eye
} from 'lucide-react';
import type { ContractClauseTemplate } from '@shared/contract-clause-types';
import type { JobType } from '@shared/jobs-types';
import { DEFAULT_CLAUSES } from '@shared/contract-clause-types';
import CreateTemplateModal from './CreateTemplateModal';
import EditTemplateModal from './EditTemplateModal';
import PreviewClausesModal from './PreviewClausesModal';

const JOB_TYPES: { value: JobType | 'generico'; label: string; color: string }[] = [
  { value: 'matrimonio', label: 'Matrimonio', color: 'bg-pink-100 text-pink-800' },
  { value: 'battesimo', label: 'Battesimo', color: 'bg-blue-100 text-blue-800' },
  { value: 'famiglia', label: 'Famiglia', color: 'bg-green-100 text-green-800' },
  { value: 'evento', label: 'Evento', color: 'bg-purple-100 text-purple-800' },
  { value: 'comunione', label: 'Comunione', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'compleanno', label: 'Compleanno', color: 'bg-orange-100 text-orange-800' },
  { value: 'altro', label: 'Altro', color: 'bg-gray-100 text-gray-800' },
  { value: 'generico', label: 'Generico', color: 'bg-slate-100 text-slate-800' }
];

export default function ContractClausesManager() {
  const { user } = useFirebaseAuth();
  const { toast } = useToast();
  const [selectedJobType, setSelectedJobType] = useState<JobType | 'generico'>('matrimonio');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ContractClauseTemplate | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<ContractClauseTemplate | null>(null);

  // Query templates
  const { data: allTemplates = [], isLoading } = useQuery({
    queryKey: ['contract-clause-templates'],
    queryFn: getAllClauseTemplates
  });

  // Filtra per tipo
  const templates = allTemplates.filter(t => t.jobType === selectedJobType);

  // Mutation elimina template
  const deleteMutation = useMutation({
    mutationFn: deleteClauseTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contract-clause-templates'] });
      toast({
        title: 'Template eliminato',
        description: 'Il template è stato eliminato con successo.'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Errore',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  // Mutation imposta predefinito
  const setDefaultMutation = useMutation({
    mutationFn: ({ id, jobType }: { id: string; jobType: string }) =>
      setAsDefaultTemplate(id, jobType),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contract-clause-templates'] });
      toast({
        title: 'Template predefinito impostato',
        description: 'Questo template verrà usato automaticamente per i nuovi preventivi.'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Errore',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const handleDelete = (id: string) => {
    if (confirm('Sei sicuro di voler eliminare questo template?')) {
      deleteMutation.mutate(id);
    }
  };

  const handleSetDefault = (id: string, jobType: string) => {
    setDefaultMutation.mutate({ id, jobType });
  };

  // Mostra clausole di default se non ci sono template
  const defaultClauses = DEFAULT_CLAUSES[selectedJobType as JobType];
  const hasDefaultClauses = defaultClauses && defaultClauses.length > 0;

  return (
    <div className="space-y-6" data-testid="contract-clauses-manager">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="w-6 h-6" />
            Clausole Contrattuali
          </h2>
          <p className="text-muted-foreground mt-1">
            Gestisci i template delle clausole per tipo di lavoro
          </p>
        </div>
        <Button
          onClick={() => setCreateModalOpen(true)}
          data-testid="button-create-template"
        >
          <Plus className="w-4 h-4 mr-2" />
          Nuovo Template
        </Button>
      </div>

      <Tabs value={selectedJobType} onValueChange={(v) => setSelectedJobType(v as JobType | 'generico')}>
        <TabsList className="grid grid-cols-4 lg:grid-cols-8 gap-2">
          {JOB_TYPES.map(type => (
            <TabsTrigger
              key={type.value}
              value={type.value}
              data-testid={`tab-${type.value}`}
            >
              {type.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {JOB_TYPES.map(type => (
          <TabsContent key={type.value} value={type.value} className="space-y-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : templates.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">Nessun template personalizzato</h3>
                  <p className="text-muted-foreground mb-6">
                    {hasDefaultClauses
                      ? `Vengono utilizzate ${defaultClauses.length} clausole predefinite per ${type.label}.`
                      : 'Non ci sono clausole configurate per questo tipo di lavoro.'}
                  </p>
                  <div className="flex gap-2 justify-center">
                    <Button
                      onClick={() => setCreateModalOpen(true)}
                      data-testid={`button-create-first-${type.value}`}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Crea Primo Template
                    </Button>
                    {hasDefaultClauses && (
                      <Button
                        variant="outline"
                        onClick={() => setPreviewTemplate({
                          id: 'default',
                          jobType: type.value as JobType,
                          titolo: `Clausole predefinite ${type.label}`,
                          clauses: defaultClauses.map((c, i) => ({ ...c, id: `default-${i}` })),
                          attivo: true,
                          createdAt: null as any,
                          updatedAt: null as any,
                          createdBy: ''
                        })}
                        data-testid={`button-preview-default-${type.value}`}
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        Vedi Clausole Predefinite
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4" data-testid={`templates-list-${type.value}`}>
                {templates.map(template => (
                  <Card key={template.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <CardTitle className="text-lg">
                              {template.titolo}
                            </CardTitle>
                            {template.predefinito && (
                              <Badge variant="default" className="gap-1">
                                <Star className="w-3 h-3" />
                                Predefinito
                              </Badge>
                            )}
                            {!template.attivo && (
                              <Badge variant="secondary">
                                Disattivato
                              </Badge>
                            )}
                          </div>
                          <CardDescription>
                            {template.clauses.length} clausole • 
                            {' '}{template.clauses.filter(c => c.required).length} obbligatorie
                          </CardDescription>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setPreviewTemplate(template)}
                            data-testid={`button-preview-${template.id}`}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingTemplate(template)}
                            data-testid={`button-edit-${template.id}`}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          {!template.predefinito && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleSetDefault(template.id, template.jobType)}
                              disabled={setDefaultMutation.isPending}
                              data-testid={`button-set-default-${template.id}`}
                            >
                              <Star className="w-4 h-4" />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDelete(template.id)}
                            disabled={deleteMutation.isPending}
                            data-testid={`button-delete-${template.id}`}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {template.clauses.slice(0, 3).map((clause, idx) => (
                          <div
                            key={clause.id}
                            className="flex items-start gap-2 text-sm text-muted-foreground"
                            data-testid={`clause-preview-${clause.id}`}
                          >
                            <span className="font-medium">{clause.ordine}.</span>
                            <span className="flex-1">{clause.text}</span>
                            {clause.required && (
                              <Badge variant="secondary" className="text-xs">
                                Obbligatoria
                              </Badge>
                            )}
                          </div>
                        ))}
                        {template.clauses.length > 3 && (
                          <p className="text-sm text-muted-foreground italic">
                            + altre {template.clauses.length - 3} clausole
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      {/* Modals */}
      <CreateTemplateModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        defaultJobType={selectedJobType}
      />

      {editingTemplate && (
        <EditTemplateModal
          template={editingTemplate}
          open={!!editingTemplate}
          onClose={() => setEditingTemplate(null)}
        />
      )}

      {previewTemplate && (
        <PreviewClausesModal
          template={previewTemplate}
          open={!!previewTemplate}
          onClose={() => setPreviewTemplate(null)}
        />
      )}
    </div>
  );
}
