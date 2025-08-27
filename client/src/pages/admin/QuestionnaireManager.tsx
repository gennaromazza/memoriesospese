/**
 * Admin Questionnaire Manager Page
 * Gestisce questionari per una specifica galleria
 */

import { useState, useEffect } from 'react';
import { useLocation, useParams } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { 
  ArrowLeft, 
  Settings, 
  Power, 
  PowerOff, 
  Link as LinkIcon, 
  Copy, 
  RefreshCw, 
  Download, 
  Heart, 
  Users,
  Calendar,
  CheckCircle,
  Clock,
  AlertTriangle,
  FileText
} from 'lucide-react';
import { QuestionnaireService } from '@/lib/questionnaire';
import { generateChatGPTPrompt } from '@/lib/questionnaireDefaults';
import { FaqSet, Questionnaire, AnswerSet, Role, CoupleInfo } from '@shared/schema';
import { createAbsoluteUrl } from '@/lib/basePath';

interface QuestionnaireManagerParams {
  galleryId: string;
}

export default function QuestionnaireManager() {
  const [, setLocation] = useLocation();
  const params = useParams<QuestionnaireManagerParams>();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("config");
  const { toast } = useToast();

  // Stato del questionario
  const [questionnaire, setQuestionnaire] = useState<Questionnaire | null>(null);
  const [faqSets, setFaqSets] = useState<FaqSet[]>([]);
  const [activeFaqSet, setActiveFaqSet] = useState<FaqSet | null>(null);
  const [answers, setAnswers] = useState<{ bride: AnswerSet | null; groom: AnswerSet | null }>({ bride: null, groom: null });
  
  // Form stato
  const [enabled, setEnabled] = useState(false);
  const [selectedFaqSetId, setSelectedFaqSetId] = useState<string>('');
  const [coupleInfo, setCoupleInfo] = useState<CoupleInfo>({
    brideName: '',
    groomName: '',
    weddingDate: '',
    emailBride: '',
    emailGroom: ''
  });

  // Stato UI
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [regeneratingToken, setRegeneratingToken] = useState<Role | null>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportContent, setExportContent] = useState('');

  useEffect(() => {
    loadQuestionnaireData();
  }, [params?.galleryId]);

  const loadQuestionnaireData = async () => {
    if (!params?.galleryId) return;

    try {
      setIsLoading(true);
      
      // Carica dati in parallelo
      const [questionnaireData, faqSetsData, activeFaqSetData] = await Promise.all([
        QuestionnaireService.getGalleryQuestionnaire(params.galleryId),
        QuestionnaireService.getAllFaqSets(),
        QuestionnaireService.getActiveFaqSet()
      ]);

      setQuestionnaire(questionnaireData);
      setFaqSets(faqSetsData);
      setActiveFaqSet(activeFaqSetData);

      if (questionnaireData) {
        setEnabled(questionnaireData.enabled);
        setSelectedFaqSetId(questionnaireData.faqSetId);
        
        // Carica risposte se disponibili
        const answersData = await QuestionnaireService.getAllAnswers(params.galleryId, questionnaireData.id);
        setAnswers(answersData);
      } else {
        // Imposta FAQ set attivo come default
        if (activeFaqSetData) {
          setSelectedFaqSetId(activeFaqSetData.id);
        }
      }
    } catch (error) {
      console.error('Errore caricamento dati questionario:', error);
      toast({
        title: "Errore",
        description: "Impossibile caricare i dati del questionario",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateQuestionnaire = async () => {
    if (!params?.galleryId || !selectedFaqSetId) return;

    try {
      setIsSaving(true);
      
      const selectedFaqSet = faqSets.find(set => set.id === selectedFaqSetId);
      if (!selectedFaqSet) {
        throw new Error('Set di domande non trovato');
      }

      const questionnaireId = await QuestionnaireService.createQuestionnaire(
        params.galleryId,
        selectedFaqSetId,
        selectedFaqSet.version,
        'admin'
      );

      toast({
        title: "Questionario creato",
        description: "Il questionario è stato creato con successo",
        variant: "default"
      });

      await loadQuestionnaireData();
    } catch (error) {
      console.error('Errore creazione questionario:', error);
      toast({
        title: "Errore",
        description: "Impossibile creare il questionario",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleEnabled = async () => {
    if (!questionnaire || !params?.galleryId) return;

    try {
      setIsSaving(true);
      const newEnabled = !enabled;
      
      await QuestionnaireService.toggleQuestionnaire(params.galleryId, questionnaire.id, newEnabled);
      setEnabled(newEnabled);
      
      toast({
        title: newEnabled ? "Questionario attivato" : "Questionario disattivato",
        description: newEnabled 
          ? "Le coppie possono ora accedere al questionario" 
          : "L'accesso al questionario è stato sospeso",
        variant: "default"
      });
    } catch (error) {
      console.error('Errore toggle questionario:', error);
      toast({
        title: "Errore",
        description: "Impossibile aggiornare lo stato del questionario",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleGenerateToken = async (role: Role) => {
    if (!questionnaire || !params?.galleryId) return;

    try {
      setRegeneratingToken(role);
      
      const { tokenId, url } = await QuestionnaireService.generateRoleToken(
        params.galleryId,
        questionnaire.id,
        role
      );

      // Aggiorna il questionario locale
      setQuestionnaire(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          tokens: {
            ...prev.tokens,
            [role]: {
              tokenId,
              url,
              createdAt: Date.now(),
              expiresAt: Date.now() + (90 * 24 * 60 * 60 * 1000)
            }
          }
        };
      });

      toast({
        title: "Token generato",
        description: `Nuovo link creato per ${role === 'bride' ? 'la sposa' : 'lo sposo'}`,
        variant: "default"
      });
    } catch (error) {
      console.error('Errore generazione token:', error);
      toast({
        title: "Errore",
        description: "Impossibile generare il token",
        variant: "destructive"
      });
    } finally {
      setRegeneratingToken(null);
    }
  };

  const handleCopyLink = async (role: Role) => {
    if (!questionnaire?.tokens[role]?.url) return;

    try {
      await navigator.clipboard.writeText(questionnaire.tokens[role].url);
      setCopiedToken(role);
      
      toast({
        title: "Link copiato",
        description: `Link per ${role === 'bride' ? 'la sposa' : 'lo sposo'} copiato negli appunti`,
        variant: "default"
      });

      // Reset dello stato dopo 2 secondi
      setTimeout(() => setCopiedToken(null), 2000);
    } catch (error) {
      console.error('Errore copia link:', error);
      toast({
        title: "Errore",
        description: "Impossibile copiare il link",
        variant: "destructive"
      });
    }
  };

  const handleExportAnswers = async () => {
    if (!questionnaire || !activeFaqSet || !answers.bride || !answers.groom) {
      toast({
        title: "Export non disponibile",
        description: "Entrambe le risposte (sposa e sposo) devono essere completate",
        variant: "destructive"
      });
      return;
    }

    try {
      const exportData = generateChatGPTPrompt({
        galleryId: params?.galleryId || '',
        brideName: coupleInfo.brideName || 'Sposa',
        groomName: coupleInfo.groomName || 'Sposo', 
        weddingDate: coupleInfo.weddingDate || '',
        questions: activeFaqSet.questions,
        brideAnswers: answers.bride.answers,
        groomAnswers: answers.groom.answers
      });

      setExportContent(exportData);
      setExportDialogOpen(true);
    } catch (error) {
      console.error('Errore export risposte:', error);
      toast({
        title: "Errore",
        description: "Impossibile generare l'export",
        variant: "destructive"
      });
    }
  };

  const copyExportContent = async () => {
    try {
      await navigator.clipboard.writeText(exportContent);
      toast({
        title: "Export copiato",
        description: "Il prompt è stato copiato negli appunti. Incollalo in ChatGPT",
        variant: "default"
      });
    } catch (error) {
      console.error('Errore copia export:', error);
      toast({
        title: "Errore",
        description: "Impossibile copiare il contenuto",
        variant: "destructive"
      });
    }
  };

  const getCompletionStatus = (role: Role) => {
    const answer = answers[role];
    if (!answer) return { status: 'not_started', progress: 0 };
    
    if (answer.status === 'submitted') {
      return { status: 'completed', progress: 100 };
    }
    
    return { status: 'in_progress', progress: 50 };
  };

  const renderStatusBadge = (status: string, progress: number) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-600"><CheckCircle className="w-3 h-3 mr-1" />Completato</Badge>;
      case 'in_progress':
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />In corso</Badge>;
      default:
        return <Badge variant="outline">Non iniziato</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-muted-foreground">Caricamento questionario...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      {/* Header con breadcrumb */}
      <div className="flex items-center gap-4 mb-8">
        <Button 
          variant="outline" 
          size="sm"
          onClick={() => setLocation('/admin/dashboard')}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Dashboard
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Questionario Galleria</h1>
          <p className="text-muted-foreground mt-1">
            ID: {params?.galleryId}
          </p>
        </div>
        
        {questionnaire && (
          <div className="ml-auto flex items-center gap-3">
            <Badge variant={enabled ? "default" : "secondary"}>
              {enabled ? <Power className="w-3 h-3 mr-1" /> : <PowerOff className="w-3 h-3 mr-1" />}
              {enabled ? 'Attivo' : 'Disattivato'}
            </Badge>
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="config">Configurazione</TabsTrigger>
          <TabsTrigger value="tokens" disabled={!questionnaire}>Link Accesso</TabsTrigger>
          <TabsTrigger value="status" disabled={!questionnaire}>Stato & Export</TabsTrigger>
        </TabsList>

        {/* Tab Configurazione */}
        <TabsContent value="config" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Configurazione Questionario
              </CardTitle>
              <CardDescription>
                Crea e configura il questionario per questa galleria
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {!questionnaire ? (
                // Creazione nuovo questionario
                <div className="space-y-6">
                  <div>
                    <Label htmlFor="faqSet">Set di Domande</Label>
                    <Select value={selectedFaqSetId} onValueChange={setSelectedFaqSetId}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Seleziona un set di domande" />
                      </SelectTrigger>
                      <SelectContent>
                        {faqSets.map((faqSet) => (
                          <SelectItem key={faqSet.id} value={faqSet.id}>
                            {faqSet.title} {faqSet.active && '(Attivo)'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-sm text-muted-foreground mt-1">
                      {faqSets.length === 0 ? 'Nessun set di domande disponibile. Crea un set prima.' : 'Seleziona il set di domande da utilizzare per il questionario.'}
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <Button 
                      onClick={handleCreateQuestionnaire}
                      disabled={!selectedFaqSetId || isSaving || faqSets.length === 0}
                    >
                      {isSaving ? 'Creazione...' : 'Crea Questionario'}
                    </Button>
                    <Button variant="outline" onClick={() => setLocation('/admin/faq')}>
                      Gestisci Set Domande
                    </Button>
                  </div>
                </div>
              ) : (
                // Gestione questionario esistente
                <div className="space-y-6">
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <h3 className="font-semibold">Stato Questionario</h3>
                      <p className="text-sm text-muted-foreground">
                        Attiva o disattiva l'accesso al questionario per le coppie
                      </p>
                    </div>
                    <Switch
                      checked={enabled}
                      onCheckedChange={handleToggleEnabled}
                      disabled={isSaving}
                    />
                  </div>

                  <div>
                    <Label>Set di Domande Utilizzato</Label>
                    <div className="mt-1 p-3 bg-muted rounded-lg">
                      <p className="font-medium">
                        {faqSets.find(set => set.id === questionnaire.faqSetId)?.title || 'Set non trovato'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Versione {questionnaire.faqVersion} • {faqSets.find(set => set.id === questionnaire.faqSetId)?.questions.length || 0} domande
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="brideName">Nome Sposa</Label>
                      <Input
                        id="brideName"
                        value={coupleInfo.brideName}
                        onChange={(e) => setCoupleInfo(prev => ({ ...prev, brideName: e.target.value }))}
                        placeholder="Nome della sposa"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="groomName">Nome Sposo</Label>
                      <Input
                        id="groomName"
                        value={coupleInfo.groomName}
                        onChange={(e) => setCoupleInfo(prev => ({ ...prev, groomName: e.target.value }))}
                        placeholder="Nome dello sposo"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="weddingDate">Data Matrimonio</Label>
                      <Input
                        id="weddingDate"
                        type="date"
                        value={coupleInfo.weddingDate}
                        onChange={(e) => setCoupleInfo(prev => ({ ...prev, weddingDate: e.target.value }))}
                        className="mt-1"
                      />
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Link Accesso */}
        <TabsContent value="tokens" className="space-y-6">
          {questionnaire && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <LinkIcon className="w-5 h-5" />
                    Link di Accesso
                  </CardTitle>
                  <CardDescription>
                    Genera e gestisci i link sicuri per bride e groom
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Token Bride */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Heart className="w-4 h-4 text-rose-500" />
                        <h3 className="font-semibold">Link Sposa</h3>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleGenerateToken('bride')}
                        disabled={regeneratingToken === 'bride'}
                      >
                        {regeneratingToken === 'bride' ? (
                          <>
                            <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                            Generando...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="w-3 h-3 mr-1" />
                            Genera Nuovo
                          </>
                        )}
                      </Button>
                    </div>
                    
                    {questionnaire.tokens.bride?.url ? (
                      <div className="flex gap-2">
                        <Input
                          value={questionnaire.tokens.bride.url}
                          readOnly
                          className="font-mono text-sm"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCopyLink('bride')}
                          disabled={copiedToken === 'bride'}
                        >
                          {copiedToken === 'bride' ? (
                            <CheckCircle className="w-4 h-4 text-green-600" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Nessun link generato per la sposa
                      </p>
                    )}
                    
                    {questionnaire.tokens.bride?.expiresAt && (
                      <p className="text-xs text-muted-foreground">
                        Scade il: {new Date(questionnaire.tokens.bride.expiresAt).toLocaleDateString('it-IT')}
                      </p>
                    )}
                  </div>

                  {/* Token Groom */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-blue-500" />
                        <h3 className="font-semibold">Link Sposo</h3>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleGenerateToken('groom')}
                        disabled={regeneratingToken === 'groom'}
                      >
                        {regeneratingToken === 'groom' ? (
                          <>
                            <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                            Generando...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="w-3 h-3 mr-1" />
                            Genera Nuovo
                          </>
                        )}
                      </Button>
                    </div>
                    
                    {questionnaire.tokens.groom?.url ? (
                      <div className="flex gap-2">
                        <Input
                          value={questionnaire.tokens.groom.url}
                          readOnly
                          className="font-mono text-sm"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCopyLink('groom')}
                          disabled={copiedToken === 'groom'}
                        >
                          {copiedToken === 'groom' ? (
                            <CheckCircle className="w-4 h-4 text-green-600" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Nessun link generato per lo sposo
                      </p>
                    )}
                    
                    {questionnaire.tokens.groom?.expiresAt && (
                      <p className="text-xs text-muted-foreground">
                        Scade il: {new Date(questionnaire.tokens.groom.expiresAt).toLocaleDateString('it-IT')}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* Tab Stato & Export */}
        <TabsContent value="status" className="space-y-6">
          {questionnaire && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="w-5 h-5" />
                    Stato Compilazione
                  </CardTitle>
                  <CardDescription>
                    Monitora il progresso delle risposte
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Status Bride */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Heart className="w-4 h-4 text-rose-500" />
                          <h3 className="font-semibold">Sposa</h3>
                        </div>
                        {(() => {
                          const status = getCompletionStatus('bride');
                          return renderStatusBadge(status.status, status.progress);
                        })()}
                      </div>
                      
                      {answers.bride ? (
                        <div className="text-sm space-y-1">
                          <p className="text-muted-foreground">
                            Completato il: {new Date(answers.bride.completedAt).toLocaleDateString('it-IT')}
                          </p>
                          <p className="text-muted-foreground">
                            Risposte: {Object.keys(answers.bride.answers).length}/10
                          </p>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Nessuna risposta ricevuta
                        </p>
                      )}
                    </div>

                    {/* Status Groom */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4 text-blue-500" />
                          <h3 className="font-semibold">Sposo</h3>
                        </div>
                        {(() => {
                          const status = getCompletionStatus('groom');
                          return renderStatusBadge(status.status, status.progress);
                        })()}
                      </div>
                      
                      {answers.groom ? (
                        <div className="text-sm space-y-1">
                          <p className="text-muted-foreground">
                            Completato il: {new Date(answers.groom.completedAt).toLocaleDateString('it-IT')}
                          </p>
                          <p className="text-muted-foreground">
                            Risposte: {Object.keys(answers.groom.answers).length}/10
                          </p>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Nessuna risposta ricevuta
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Export Risposte */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Export Risposte
                  </CardTitle>
                  <CardDescription>
                    Esporta le risposte in formato ChatGPT per la generazione dell'album
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Export per ChatGPT</p>
                      <p className="text-sm text-muted-foreground">
                        Genera un prompt strutturato con tutte le risposte per la creazione dell'album
                      </p>
                    </div>
                    <Button
                      onClick={handleExportAnswers}
                      disabled={!answers.bride || !answers.groom}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Esporta
                    </Button>
                  </div>
                  
                  {(!answers.bride || !answers.groom) && (
                    <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-amber-800">
                            Export non disponibile
                          </p>
                          <p className="text-sm text-amber-700">
                            Entrambe le risposte (sposa e sposo) devono essere completate per procedere con l'export.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialog Export */}
      <AlertDialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <AlertDialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>Export Risposte ChatGPT</AlertDialogTitle>
            <AlertDialogDescription>
              Copia il contenuto sottostante e incollalo in ChatGPT per generare i testi dell'album
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="my-4">
            <textarea
              value={exportContent}
              readOnly
              className="w-full h-96 p-3 border rounded-lg font-mono text-sm resize-none"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Chiudi</AlertDialogCancel>
            <AlertDialogAction onClick={copyExportContent}>
              <Copy className="w-4 h-4 mr-2" />
              Copia Prompt
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}