import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { auth } from "@/lib/firebase";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Trash2, AlertTriangle, CheckCircle, Image, RefreshCw, Shield, AlertCircle } from "lucide-react";
import { Link } from "wouter";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface OrphanedGallery {
  galleryId: string;
  totalPhotos: number;
  duplicateCount: number;
  uniqueCount: number;
  duplicates: any[];
  unique: any[];
  safeToDelete: boolean;
}

interface OrphanedPhotosAnalysis {
  success: boolean;
  timestamp: string;
  durationMs: number;
  summary: {
    totalOrphanedPhotos: number;
    totalDuplicates: number;
    totalUnique: number;
    orphanedGalleriesCount: number;
    safeToDeleteCount: number;
  };
  orphanedGalleries: OrphanedGallery[];
}

export default function OrphanedPhotosManager() {
  const { toast } = useToast();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedGallery, setSelectedGallery] = useState<OrphanedGallery | null>(null);

  const { data, isLoading, error, refetch } = useQuery<OrphanedPhotosAnalysis, Error>({
    queryKey: ["/api/audit/orphaned-photos"],
    queryFn: async () => {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Non autenticato");
      
      const response = await fetch("/api/audit/orphaned-photos", {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Errore durante l'analisi");
      }
      
      return response.json();
    },
    enabled: !!auth.currentUser,
  });

  const deleteMutation = useMutation({
    mutationFn: async (galleryId: string) => {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Non autenticato");
      
      const response = await fetch(`/api/audit/orphaned-photos/${galleryId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Errore durante l'eliminazione");
      }
      
      return response.json();
    },
    onSuccess: (result) => {
      toast({
        title: "Foto eliminate",
        description: result.message,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/audit/orphaned-photos"] });
      setDeleteDialogOpen(false);
      setSelectedGallery(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Errore",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleDelete = (gallery: OrphanedGallery) => {
    setSelectedGallery(gallery);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (selectedGallery) {
      deleteMutation.mutate(selectedGallery.galleryId);
    }
  };

  return (
    <div className="container mx-auto py-6 px-4 max-w-6xl">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/admin/audit">
          <Button variant="ghost" size="sm" data-testid="button-back-audit">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Torna all'Audit
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">Gestione Foto Orfane</h1>
      </div>

      <Alert className="mb-6">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Informazioni</AlertTitle>
        <AlertDescription>
          Le foto orfane sono foto che appartengono a gallerie eliminate. Questa pagina ti permette di analizzarle e gestirle in sicurezza.
          Le foto "duplicate" esistono già in altre gallerie e possono essere eliminate senza perdita di dati.
        </AlertDescription>
      </Alert>

      <div className="flex justify-end mb-4">
        <Button onClick={() => refetch()} disabled={isLoading} data-testid="button-refresh-analysis">
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Aggiorna Analisi
        </Button>
      </div>

      {isLoading && (
        <Card>
          <CardContent className="py-8">
            <div className="flex flex-col items-center gap-4">
              <RefreshCw className="h-8 w-8 animate-spin text-primary" />
              <p>Analisi in corso... Potrebbe richiedere qualche minuto.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Errore</AlertTitle>
          <AlertDescription>{error instanceof Error ? error.message : 'Errore sconosciuto'}</AlertDescription>
        </Alert>
      )}

      {data?.success && (
        <>
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Image className="h-5 w-5" />
                Riepilogo Analisi
              </CardTitle>
              <CardDescription>
                Analisi completata in {data.durationMs}ms
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-3xl font-bold text-destructive">
                    {data.summary.totalOrphanedPhotos}
                  </div>
                  <div className="text-sm text-muted-foreground">Foto Orfane Totali</div>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-3xl font-bold text-green-600">
                    {data.summary.totalDuplicates}
                  </div>
                  <div className="text-sm text-muted-foreground">Duplicati (Sicure)</div>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-3xl font-bold text-amber-600">
                    {data.summary.totalUnique}
                  </div>
                  <div className="text-sm text-muted-foreground">Uniche (Attenzione)</div>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-3xl font-bold">
                    {data.summary.orphanedGalleriesCount}
                  </div>
                  <div className="text-sm text-muted-foreground">Gallerie Mancanti</div>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-3xl font-bold text-green-600">
                    {data.summary.safeToDeleteCount}
                  </div>
                  <div className="text-sm text-muted-foreground">Sicure da Eliminare</div>
                </div>
              </div>

              {data.summary.totalOrphanedPhotos > 0 && (
                <div className="mt-4">
                  <div className="flex justify-between text-sm mb-1">
                    <span>Progresso pulizia sicura</span>
                    <span>{Math.round((data.summary.totalDuplicates / data.summary.totalOrphanedPhotos) * 100)}%</span>
                  </div>
                  <Progress 
                    value={(data.summary.totalDuplicates / data.summary.totalOrphanedPhotos) * 100} 
                    className="h-2"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {data.orphanedGalleries.length === 0 ? (
            <Card>
              <CardContent className="py-8">
                <div className="flex flex-col items-center gap-4">
                  <CheckCircle className="h-12 w-12 text-green-600" />
                  <p className="text-lg font-medium">Nessuna foto orfana trovata!</p>
                  <p className="text-muted-foreground">Tutte le foto sono correttamente collegate alle rispettive gallerie.</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Gallerie Mancanti con Foto Orfane</CardTitle>
                <CardDescription>
                  Clicca su una galleria per vedere i dettagli e le opzioni di gestione
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Accordion type="single" collapsible className="w-full">
                  {data.orphanedGalleries.map((gallery, index) => (
                    <AccordionItem key={gallery.galleryId} value={gallery.galleryId}>
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex items-center gap-3 w-full pr-4">
                          <span className="font-mono text-sm truncate max-w-[200px]">
                            {gallery.galleryId}
                          </span>
                          <div className="flex gap-2 ml-auto">
                            <Badge variant="destructive">{gallery.totalPhotos} foto</Badge>
                            {gallery.safeToDelete ? (
                              <Badge variant="default" className="bg-green-600">
                                <Shield className="h-3 w-3 mr-1" />
                                Sicura
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="bg-amber-100 text-amber-800">
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                {gallery.uniqueCount} uniche
                              </Badge>
                            )}
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-4 pt-2">
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="text-muted-foreground">Foto duplicate (sicure):</span>
                              <span className="ml-2 font-medium text-green-600">{gallery.duplicateCount}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Foto uniche (attenzione):</span>
                              <span className="ml-2 font-medium text-amber-600">{gallery.uniqueCount}</span>
                            </div>
                          </div>

                          {gallery.uniqueCount > 0 && (
                            <Alert variant="destructive" className="bg-amber-50 border-amber-200">
                              <AlertTriangle className="h-4 w-4 text-amber-600" />
                              <AlertTitle className="text-amber-800">Attenzione</AlertTitle>
                              <AlertDescription className="text-amber-700">
                                Questa galleria contiene {gallery.uniqueCount} foto che non esistono in altre gallerie.
                                L'eliminazione cancellerà definitivamente queste foto.
                              </AlertDescription>
                            </Alert>
                          )}

                          {gallery.unique.length > 0 && (
                            <div>
                              <h4 className="font-medium mb-2">Anteprima foto uniche:</h4>
                              <div className="flex flex-wrap gap-2">
                                {gallery.unique.map((photo, i) => (
                                  <div key={photo.id} className="text-xs bg-muted px-2 py-1 rounded">
                                    {photo.filename || photo.id}
                                  </div>
                                ))}
                                {gallery.uniqueCount > 5 && (
                                  <div className="text-xs bg-muted px-2 py-1 rounded text-muted-foreground">
                                    +{gallery.uniqueCount - 5} altre
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          <div className="flex gap-2 pt-2">
                            <Button
                              variant={gallery.safeToDelete ? "default" : "destructive"}
                              size="sm"
                              onClick={() => handleDelete(gallery)}
                              disabled={deleteMutation.isPending}
                              data-testid={`button-delete-gallery-${gallery.galleryId}`}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Elimina {gallery.totalPhotos} foto
                            </Button>
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma Eliminazione</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedGallery && (
                <>
                  Stai per eliminare <strong>{selectedGallery.totalPhotos}</strong> foto orfane
                  della galleria <code className="bg-muted px-1 rounded">{selectedGallery.galleryId}</code>.
                  
                  {selectedGallery.uniqueCount > 0 && (
                    <span className="block mt-2 text-amber-600 font-medium">
                      ⚠️ Attenzione: {selectedGallery.uniqueCount} di queste foto sono uniche e andranno perse definitivamente!
                    </span>
                  )}
                  
                  <span className="block mt-2">
                    Questa azione non può essere annullata.
                  </span>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
              className={selectedGallery?.uniqueCount ? "bg-destructive hover:bg-destructive/90" : ""}
            >
              {deleteMutation.isPending ? "Eliminazione..." : "Conferma Eliminazione"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
