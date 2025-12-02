/**
 * CONTRACT CLAUSES MANAGER
 * Gestione template clausole contrattuali per tipo lavoro
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  getAllClauseTemplates,
  createClauseTemplate,
  updateClauseTemplate,
  deleteClauseTemplate,
  setAsDefaultTemplate
} from '@/lib/contract-clauses';
import { getJobTypes } from '@/lib/job-types';
import { useFirebaseAuth } from '@/context/FirebaseAuthContext';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Plus,
  FileText,
  Star,
  Trash2,
  Edit,
  Loader2,
  Eye
} from 'lucide-react';
import { JobTypeIcon } from '@/lib/job-type-icons';
import type { ContractClauseTemplate } from '@shared/contract-clause-types';
import type { JobType } from '@shared/jobs-types';
import { DEFAULT_CLAUSES } from '@shared/contract-clause-types';
import CreateTemplateModal from './CreateTemplateModal';
import EditTemplateModal from './EditTemplateModal';
import PreviewClausesModal from './PreviewClausesModal';

export default function ContractClausesManager() {
  const { user } = useFirebaseAuth();
  const { toast } = useToast();
  const [selectedJobType, setSelectedJobType] = useState<string>('');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ContractClauseTemplate | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<ContractClauseTemplate | null>(null);

  // Query job types
  const { data: jobTypes = [], isLoading: isLoadingJobTypes } = useQuery({
    queryKey: ['jobTypes'],
    queryFn: getJobTypes
  });

  // Query templates
  const { data: allTemplates = [], isLoading: isLoadingTemplates } = useQuery({
    queryKey: ['contract-clause-templates'],
    queryFn: getAllClauseTemplates
  });

  // Imposta jobType selezionato al primo disponibile (useEffect per evitare render loop)
  useEffect(() => {
    if (jobTypes.length > 0 && !selectedJobType) {
      setSelectedJobType(jobTypes[0].slug);
    }
  }, [jobTypes, selectedJobType]);

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

  const isLoading = isLoadingJobTypes || isLoadingTemplates;
  
  // Mostra clausole di default se non ci sono template
  const defaultClauses = DEFAULT_CLAUSES[selectedJobType as JobType];
  const hasDefaultClauses = defaultClauses && defaultClauses.length > 0;
  
  const selectedJobTypeData = jobTypes.find(jt => jt.slug === selectedJobType);

  if (isLoadingJobTypes) {
    return (
      <div className="space-y-4" data-testid="contract-clauses-manager">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (jobTypes.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground" data-testid="contract-clauses-manager">
        <FileText className="mx-auto h-12 w-12 mb-4 opacity-50" />
        <p className="font-semibold mb-2">Nessun tipo di lavoro configurato</p>
        <p className="text-sm">Configura prima i tipi di lavoro nella sezione "Tipi di Lavoro"</p>
      </div>
    );
  }

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
          disabled={!selectedJobTypeData?.attivo}
          data-testid="button-create-template"
        >
          <Plus className="w-4 h-4 mr-2" />
          Nuovo Template
        </Button>
      </div>

      <Tabs value={selectedJobType} onValueChange={setSelectedJobType}>
        <TabsList className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {jobTypes.filter(jt => jt.attivo).map(type => (
            <TabsTrigger
              key={type.slug}
              value={type.slug}
              data-testid={`tab-${type.slug}`}
              className="flex items-center gap-2"
            >
              <JobTypeIcon slug={type.slug} size="sm" />
              <span className="hidden sm:inline">{type.nome}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {jobTypes.filter(jt => jt.attivo).map(type => (
          <TabsContent key={type.slug} value={type.slug} className="space-y-4">
            {isLoadingTemplates ? (
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
                      ? `Vengono utilizzate ${defaultClauses.length} clausole predefinite per ${type.nome}.`
                      : 'Non ci sono clausole configurate per questo tipo di lavoro.'}
                  </p>
                  <div className="flex gap-2 justify-center">
                    <Button
                      onClick={() => setCreateModalOpen(true)}
                      data-testid={`button-create-first-${type.slug}`}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Crea Primo Template
                    </Button>
                    {hasDefaultClauses && (
                      <Button
                        variant="outline"
                        onClick={() => setPreviewTemplate({
                          id: 'default',
                          jobType: type.slug as JobType,
                          titolo: `Clausole predefinite ${type.nome}`,
                          clauses: defaultClauses.map((c, i) => ({ ...c, id: `default-${i}` })),
                          attivo: true,
                          createdAt: null as any,
                          updatedAt: null as any,
                          createdBy: ''
                        })}
                        data-testid={`button-preview-default-${type.slug}`}
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        Vedi Clausole Predefinite
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4" data-testid={`templates-list-${type.slug}`}>
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
        jobTypes={jobTypes}
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
