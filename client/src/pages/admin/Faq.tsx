/**
 * Admin FAQ Management Page
 * Gestisce i set di domande per il sistema questionario coppie
 */

import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { Plus, Edit, Trash2, Check, X, Eye, Settings, Save, Power, PowerOff, ChevronUp, ChevronDown, GripVertical } from 'lucide-react';
import { QuestionnaireService } from '@/lib/questionnaire';
import { initializeDefaultFaqSet } from '@/lib/questionnaireDefaults';
import { FaqSet, QuestionKey, insertFaqSetSchema } from '@shared/schema';

interface QuestionFormData {
  key: QuestionKey;
  text: string;
  type: "text" | "textarea";
}

export default function Faq() {
  const [, setLocation] = useLocation();
  const [faqSets, setFaqSets] = useState<FaqSet[]>([]);
  const [activeFaqSet, setActiveFaqSet] = useState<FaqSet | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>("list");
  const [isCreating, setIsCreating] = useState(false);
  const [editingSet, setEditingSet] = useState<FaqSet | null>(null);
  const [deleteSet, setDeleteSet] = useState<FaqSet | null>(null);
  const { toast } = useToast();

  // Form state per nuovo/modifica set
  const [formTitle, setFormTitle] = useState('');
  const [formQuestions, setFormQuestions] = useState<QuestionFormData[]>([]);

  // Inizializza le 10 domande vuote
  const initializeEmptyQuestions = (): QuestionFormData[] => {
    return Array.from({ length: 10 }, (_, index) => ({
      key: `q${index + 1}` as QuestionKey,
      text: '',
      type: 'textarea' as const
    }));
  };

  useEffect(() => {
    loadFaqSets();
  }, []);

  const loadFaqSets = async () => {
    try {
      setIsLoading(true);
      const [allSets, activeSet] = await Promise.all([
        QuestionnaireService.getAllFaqSets(),
        QuestionnaireService.getActiveFaqSet()
      ]);
      
      setFaqSets(allSets);
      setActiveFaqSet(activeSet);
      
      // Se non ci sono set, suggerisci di inizializzare quello predefinito
      if (allSets.length === 0) {
        toast({
          title: "Nessun set di domande trovato",
          description: "Clicca su 'Crea Set Predefinito' per inizializzare le domande standard",
          variant: "default"
        });
      }
    } catch (error) {
      console.error('Errore caricamento FAQ sets:', error);
      toast({
        title: "Errore",
        description: "Impossibile caricare i set di domande",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateDefault = async () => {
    try {
      setIsLoading(true);
      await initializeDefaultFaqSet();
      toast({
        title: "Set predefinito creato",
        description: "Il set di domande standard è stato creato e attivato",
        variant: "default"
      });
      await loadFaqSets();
    } catch (error) {
      console.error('Errore creazione set predefinito:', error);
      toast({
        title: "Errore",
        description: "Impossibile creare il set predefinito",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateNew = () => {
    setFormTitle('');
    setFormQuestions(initializeEmptyQuestions());
    setEditingSet(null);
    setIsCreating(true);
    setActiveTab("form");
  };

  const handleEdit = (faqSet: FaqSet) => {
    setFormTitle(faqSet.title);
    setFormQuestions(faqSet.questions.map(q => ({ ...q })));
    setEditingSet(faqSet);
    setIsCreating(false);
    setActiveTab("form");
  };

  const handleCancelForm = () => {
    setFormTitle('');
    setFormQuestions([]);
    setEditingSet(null);
    setIsCreating(false);
    setActiveTab("list");
  };

  const handleSaveSet = async () => {
    try {
      // Valida i dati con schema Zod
      const formData = {
        title: formTitle.trim(),
        questions: formQuestions.map(q => ({
          key: q.key,
          text: q.text.trim(),
          type: q.type
        }))
      };

      const validatedData = insertFaqSetSchema.parse(formData);

      setIsLoading(true);
      
      if (editingSet) {
        // Aggiorna set esistente
        await QuestionnaireService.updateFaqSet(editingSet.id, {
          title: validatedData.title,
          questions: validatedData.questions as any,
          updatedBy: 'admin'
        });
        
        toast({
          title: "Set aggiornato",
          description: "Il set di domande è stato modificato con successo",
          variant: "default"
        });
      } else {
        // Crea nuovo set
        await QuestionnaireService.createFaqSet({
          title: validatedData.title,
          questions: validatedData.questions as any,
          active: false, // Non attivo per default
          version: 1,
          createdBy: 'admin'
        });
        
        toast({
          title: "Set creato",
          description: "Il nuovo set di domande è stato creato",
          variant: "default"
        });
      }

      await loadFaqSets();
      handleCancelForm();
    } catch (error: any) {
      console.error('Errore salvataggio set:', error);
      
      if (error.name === 'ZodError') {
        const firstError = error.errors[0];
        toast({
          title: "Errore di validazione",
          description: firstError.message,
          variant: "destructive"
        });
      } else {
        toast({
          title: "Errore",
          description: "Impossibile salvare il set di domande",
          variant: "destructive"
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleActivateSet = async (faqSet: FaqSet) => {
    try {
      setIsLoading(true);
      await QuestionnaireService.activateFaqSet(faqSet.id);
      
      toast({
        title: "Set attivato",
        description: `"${faqSet.title}" è ora il set attivo`,
        variant: "default"
      });
      
      await loadFaqSets();
    } catch (error) {
      console.error('Errore attivazione set:', error);
      toast({
        title: "Errore",
        description: "Impossibile attivare il set di domande",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteSet = async () => {
    if (!deleteSet) return;

    try {
      setIsLoading(true);
      await QuestionnaireService.deleteFaqSet(deleteSet.id);
      
      toast({
        title: "Set eliminato",
        description: `"${deleteSet.title}" è stato eliminato`,
        variant: "default"
      });
      
      await loadFaqSets();
      setDeleteSet(null);
    } catch (error) {
      console.error('Errore eliminazione set:', error);
      toast({
        title: "Errore",
        description: "Impossibile eliminare il set di domande",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const updateQuestion = (index: number, field: keyof QuestionFormData, value: string) => {
    const updated = [...formQuestions];
    updated[index] = { ...updated[index], [field]: value };
    setFormQuestions(updated);
  };

  const addQuestion = () => {
    const newIndex = formQuestions.length + 1;
    const newQuestion: QuestionFormData = {
      key: `q${newIndex}` as QuestionKey,
      text: '',
      type: 'textarea'
    };
    setFormQuestions([...formQuestions, newQuestion]);
  };

  const removeQuestion = (index: number) => {
    if (formQuestions.length <= 1) {
      toast({
        title: "Errore",
        description: "Deve esserci almeno una domanda nel set",
        variant: "destructive"
      });
      return;
    }
    
    const updated = formQuestions.filter((_, i) => i !== index);
    // Rigenera le chiavi per mantenere la sequenza
    const reindexed = updated.map((q, i) => ({
      ...q,
      key: `q${i + 1}` as QuestionKey
    }));
    setFormQuestions(reindexed);
  };

  const moveQuestion = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (newIndex < 0 || newIndex >= formQuestions.length) return;
    
    const updated = [...formQuestions];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    
    // Rigenera le chiavi per mantenere la sequenza
    const reindexed = updated.map((q, i) => ({
      ...q,
      key: `q${i + 1}` as QuestionKey
    }));
    setFormQuestions(reindexed);
  };

  const isFormValid = () => {
    return formTitle.trim().length >= 3 && 
           formQuestions.every(q => q.text.trim().length > 0 && q.text.trim().length <= 200);
  };

  if (isLoading && faqSets.length === 0) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-muted-foreground">Caricamento set di domande...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Gestione Domande FAQ</h1>
          <p className="text-muted-foreground mt-2">
            Configura i set di domande per il questionario coppie
          </p>
        </div>
        <div className="flex gap-3">
          <Button 
            variant="outline" 
            onClick={() => setLocation('/admin/dashboard')}
          >
            Torna alla Dashboard
          </Button>
          {faqSets.length === 0 && (
            <Button onClick={handleCreateDefault} disabled={isLoading}>
              <Plus className="w-4 h-4 mr-2" />
              Crea Set Predefinito
            </Button>
          )}
        </div>
      </div>

      {/* Set Attivo */}
      {activeFaqSet && (
        <Card className="mb-6 border-green-200 bg-green-50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-green-800">Set Attivo</CardTitle>
                <CardDescription className="text-green-600">
                  Questo set di domande è attualmente utilizzato per i nuovi questionari
                </CardDescription>
              </div>
              <Badge variant="default" className="bg-green-600">
                <Power className="w-3 h-3 mr-1" />
                Attivo
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <h3 className="font-semibold text-green-800">{activeFaqSet.title}</h3>
            <p className="text-sm text-green-600 mt-1">
              Versione {activeFaqSet.version} • {activeFaqSet.questions.length} domande
            </p>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="list">Lista Set Domande</TabsTrigger>
          <TabsTrigger value="form" disabled={!isCreating && !editingSet}>
            {isCreating ? 'Nuovo Set' : editingSet ? 'Modifica Set' : 'Nuovo/Modifica'}
          </TabsTrigger>
        </TabsList>

        {/* Lista Set */}
        <TabsContent value="list" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Tutti i Set di Domande</h2>
            <Button onClick={handleCreateNew} disabled={isLoading}>
              <Plus className="w-4 h-4 mr-2" />
              Nuovo Set
            </Button>
          </div>

          {faqSets.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Settings className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Nessun set di domande</h3>
                <p className="text-muted-foreground mb-4">
                  Crea il primo set di domande per iniziare a raccogliere le risposte delle coppie
                </p>
                <Button onClick={handleCreateDefault} disabled={isLoading}>
                  <Plus className="w-4 h-4 mr-2" />
                  Crea Set Predefinito
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {faqSets.map((faqSet) => (
                <Card key={faqSet.id} className={faqSet.active ? 'border-green-200' : ''}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          {faqSet.title}
                          {faqSet.active && (
                            <Badge variant="default" className="bg-green-600">
                              <Power className="w-3 h-3 mr-1" />
                              Attivo
                            </Badge>
                          )}
                        </CardTitle>
                        <CardDescription>
                          Versione {faqSet.version} • {faqSet.questions.length} domande • 
                          Creato {new Date(faqSet.createdAt).toLocaleDateString('it-IT')}
                        </CardDescription>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(faqSet)}
                          disabled={isLoading}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        {!faqSet.active && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleActivateSet(faqSet)}
                            disabled={isLoading}
                          >
                            <Power className="w-4 h-4" />
                          </Button>
                        )}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={faqSet.active || isLoading}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Conferma eliminazione</AlertDialogTitle>
                              <AlertDialogDescription>
                                Sei sicuro di voler eliminare il set "{faqSet.title}"? 
                                Questa azione non può essere annullata.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Annulla</AlertDialogCancel>
                              <AlertDialogAction 
                                onClick={() => setDeleteSet(faqSet)}
                                className="bg-red-600 hover:bg-red-700"
                              >
                                Elimina
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-2">
                      {faqSet.questions.slice(0, 3).map((question, index) => (
                        <div key={question.key} className="text-sm">
                          <span className="font-medium">{question.key.toUpperCase()}:</span>{' '}
                          <span className="text-muted-foreground">
                            {question.text.length > 80 
                              ? `${question.text.substring(0, 80)}...` 
                              : question.text
                            }
                          </span>
                        </div>
                      ))}
                      {faqSet.questions.length > 3 && (
                        <p className="text-sm text-muted-foreground">
                          ... e altre {faqSet.questions.length - 3} domande
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Form Nuovo/Modifica */}
        <TabsContent value="form" className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">
              {isCreating ? 'Nuovo Set di Domande' : `Modifica "${editingSet?.title}"`}
            </h2>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleCancelForm}>
                <X className="w-4 h-4 mr-2" />
                Annulla
              </Button>
              <Button 
                onClick={handleSaveSet} 
                disabled={!isFormValid() || isLoading}
              >
                <Save className="w-4 h-4 mr-2" />
                Salva Set
              </Button>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Dettagli Set</CardTitle>
              <CardDescription>
                Configura il titolo e le 10 domande del set
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Titolo */}
              <div>
                <Label htmlFor="title">Titolo del Set</Label>
                <Input
                  id="title"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="es. Set Domande Standard v2"
                  className="mt-1"
                />
                <p className="text-sm text-muted-foreground mt-1">
                  Minimo 3 caratteri
                </p>
              </div>

              {/* Domande */}
              <div>
                <div className="flex items-center justify-between">
                  <Label>Domande ({formQuestions.length} domande)</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addQuestion}
                    className="flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Aggiungi Domanda
                  </Button>
                </div>
                <div className="grid gap-4 mt-3">
                  {formQuestions.map((question, index) => (
                    <Card key={`${question.key}-${index}`} className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{question.key.toUpperCase()}</Badge>
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => moveQuestion(index, 'up')}
                              disabled={index === 0}
                              className="h-6 w-6 p-0"
                            >
                              <ChevronUp className="w-3 h-3" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => moveQuestion(index, 'down')}
                              disabled={index === formQuestions.length - 1}
                              className="h-6 w-6 p-0"
                            >
                              <ChevronDown className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={question.text.trim() ? "default" : "secondary"}>
                            {question.text.trim() ? "Completa" : "Vuota"}
                          </Badge>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeQuestion(index)}
                            disabled={formQuestions.length <= 1}
                            className="h-6 w-6 p-0 text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                      <div>
                        <Label htmlFor={`question-${index}`}>Testo della domanda</Label>
                        <Textarea
                          id={`question-${index}`}
                          value={question.text}
                          onChange={(e) => updateQuestion(index, 'text', e.target.value)}
                          placeholder={`Inserisci il testo per la domanda ${index + 1}...`}
                          className="mt-1"
                          rows={2}
                        />
                        <p className="text-sm text-muted-foreground mt-1">
                          {question.text.length}/200 caratteri
                        </p>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <p className="text-sm text-muted-foreground">
                Minimo 1 domanda richiesta. Ogni domanda: 1-200 caratteri
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleCancelForm}>
                  Annulla
                </Button>
                <Button 
                  onClick={handleSaveSet} 
                  disabled={!isFormValid() || isLoading}
                >
                  <Save className="w-4 h-4 mr-2" />
                  Salva Set
                </Button>
              </div>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog di conferma eliminazione */}
      {deleteSet && (
        <AlertDialog open={!!deleteSet} onOpenChange={() => setDeleteSet(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Conferma eliminazione</AlertDialogTitle>
              <AlertDialogDescription>
                Sei sicuro di voler eliminare il set "{deleteSet.title}"?
                Questa azione non può essere annullata.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annulla</AlertDialogCancel>
              <AlertDialogAction 
                onClick={handleDeleteSet}
                className="bg-red-600 hover:bg-red-700"
              >
                Elimina
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}