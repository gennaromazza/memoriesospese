import { useState } from 'react';
import { collection, getDocs, doc, getDoc, setDoc, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { AlertTriangle, CheckCircle, Database, RefreshCw, Search } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

interface GalleryRecoveryInfo {
  galleryId: string;
  galleryCode?: string;
  photoCount: number;
  hasDocument: boolean;
  documentEmpty: boolean;
  needsRecovery: boolean;
  firstPhotoDate?: Date;
  recoveredName?: string;
}

export default function GalleryRecoveryTool() {
  const [isScanning, setIsScanning] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [scanResults, setScanResults] = useState<GalleryRecoveryInfo[]>([]);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('');
  const { toast } = useToast();

  const scanGalleries = async () => {
    setIsScanning(true);
    setScanResults([]);
    setProgress(0);
    
    try {
      setCurrentStep('Caricamento foto dalla collezione photos...');
      
      const photosSnapshot = await getDocs(collection(db, 'photos'));
      console.log(`[Recovery] Trovate ${photosSnapshot.docs.length} foto nella collezione 'photos'`);
      
      const galleryMap = new Map<string, { 
        galleryId: string; 
        galleryCode?: string; 
        galleryName?: string;
        photos: any[];
        firstPhotoDate?: Date;
        fromOrder?: boolean;
        specialTheme?: string;
      }>();
      
      photosSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const galleryId = data.galleryId;
        if (!galleryId) return;
        
        if (!galleryMap.has(galleryId)) {
          galleryMap.set(galleryId, {
            galleryId,
            galleryCode: data.galleryCode,
            photos: [],
            firstPhotoDate: data.createdAt?.toDate?.() || undefined
          });
        }
        
        const entry = galleryMap.get(galleryId)!;
        entry.photos.push(data);
        
        if (!entry.galleryCode && data.galleryCode) {
          entry.galleryCode = data.galleryCode;
        }
        
        const photoDate = data.createdAt?.toDate?.();
        if (photoDate && (!entry.firstPhotoDate || photoDate < entry.firstPhotoDate)) {
          entry.firstPhotoDate = photoDate;
        }
      });
      
      // ANCHE cerca gallerie dagli ORDINI (per gallerie vuote create da booking)
      setCurrentStep('Caricamento ordini per gallerie vuote...');
      const ordersSnapshot = await getDocs(collection(db, 'orders'));
      console.log(`[Recovery] Trovati ${ordersSnapshot.docs.length} ordini`);
      
      ordersSnapshot.docs.forEach(orderDoc => {
        const data = orderDoc.data();
        const galleryId = data.galleryId;
        if (!galleryId) return;
        
        // Se questa galleria non è già stata trovata dalle foto
        if (!galleryMap.has(galleryId)) {
          galleryMap.set(galleryId, {
            galleryId,
            galleryCode: data.galleryCode,
            galleryName: data.nomeCliente ? `Galleria ${data.nomeCliente}` : undefined,
            photos: [],
            firstPhotoDate: data.createdAt?.toDate?.() || data.dataEvento?.toDate?.() || undefined,
            fromOrder: true,
            specialTheme: data.specialTheme
          });
          console.log(`[Recovery] Galleria vuota trovata da ordine: ${galleryId}`);
        }
      });
      
      // ANCHE cerca gallerie dai JOBS (per gallerie vuote create da lavori)
      setCurrentStep('Caricamento lavori per gallerie associate...');
      const jobsSnapshot = await getDocs(collection(db, 'jobs'));
      console.log(`[Recovery] Trovati ${jobsSnapshot.docs.length} lavori`);
      
      jobsSnapshot.docs.forEach(jobDoc => {
        const data = jobDoc.data();
        const galleryIds = data.galleryIds || [];
        galleryIds.forEach((galleryId: string) => {
          if (!galleryMap.has(galleryId)) {
            galleryMap.set(galleryId, {
              galleryId,
              galleryName: data.titolo ? `Galleria ${data.titolo}` : undefined,
              photos: [],
              firstPhotoDate: data.dataEvento?.toDate?.() || data.createdAt?.toDate?.() || undefined,
              fromOrder: true
            });
            console.log(`[Recovery] Galleria vuota trovata da job: ${galleryId}`);
          }
        });
      });
      
      console.log(`[Recovery] Trovate ${galleryMap.size} gallerie uniche (incluse quelle da ordini/jobs)`);
      setCurrentStep(`Verificando ${galleryMap.size} gallerie...`);
      
      const results: GalleryRecoveryInfo[] = [];
      let processed = 0;
      
      for (const [galleryId, info] of galleryMap) {
        const galleryDoc = await getDoc(doc(db, 'galleries', galleryId));
        const hasDocument = galleryDoc.exists();
        const data = galleryDoc.data() || {};
        const documentEmpty = hasDocument && !data.name && !data.code;
        const needsRecovery = !hasDocument || documentEmpty;
        
        // Priorità nome: galleryName da ordine/job > codice > ID
        const recoveredName = info.galleryName || 
          (info.galleryCode ? `Galleria ${info.galleryCode}` : `Galleria ${galleryId.substring(0, 8)}`);
        
        results.push({
          galleryId,
          galleryCode: info.galleryCode,
          photoCount: info.photos.length,
          hasDocument,
          documentEmpty,
          needsRecovery,
          firstPhotoDate: info.firstPhotoDate,
          recoveredName,
          // @ts-ignore - campo extra per tracking
          fromOrder: info.fromOrder,
          specialTheme: info.specialTheme
        } as GalleryRecoveryInfo);
        
        processed++;
        setProgress((processed / galleryMap.size) * 100);
      }
      
      setScanResults(results);
      setCurrentStep('');
      
      const needRecovery = results.filter(r => r.needsRecovery).length;
      toast({
        title: 'Scansione completata',
        description: `${results.length} gallerie trovate, ${needRecovery} da ripristinare`
      });
      
    } catch (error) {
      console.error('[Recovery] Errore durante scansione:', error);
      toast({
        title: 'Errore',
        description: 'Errore durante la scansione delle gallerie',
        variant: 'destructive'
      });
    } finally {
      setIsScanning(false);
    }
  };

  const recoverGalleries = async () => {
    const toRecover = scanResults.filter(r => r.needsRecovery);
    if (toRecover.length === 0) {
      toast({
        title: 'Niente da ripristinare',
        description: 'Tutte le gallerie hanno già i dati corretti'
      });
      return;
    }
    
    setIsRecovering(true);
    setProgress(0);
    
    try {
      let recovered = 0;
      
      // Carica tutti i gallerySecrets per trovare password/PIN anche per ID diversi
      const allSecretsSnapshot = await getDocs(collection(db, 'gallerySecrets'));
      const secretsMap = new Map<string, { password?: string; specialPin?: string }>();
      allSecretsSnapshot.docs.forEach(doc => {
        secretsMap.set(doc.id, doc.data() as { password?: string; specialPin?: string });
      });
      console.log(`[Recovery] Caricati ${secretsMap.size} documenti da gallerySecrets`);
      
      for (const gallery of toRecover) {
        setCurrentStep(`Ripristino ${gallery.galleryCode || gallery.galleryId}...`);
        
        // Cerca secrets per ID galleria
        let secrets = secretsMap.get(gallery.galleryId);
        const hasPassword = !!secrets?.password;
        const hasSpecialPin = !!secrets?.specialPin;
        
        // Determina se è una galleria speciale (con PIN) o normale (con password)
        const isSpecialGallery = hasSpecialPin;
        // @ts-ignore - campo extra per tracking
        const themeFromOrder = (gallery as any).specialTheme;
        
        const galleryData: Record<string, any> = {
          name: gallery.recoveredName || `Galleria ${gallery.galleryId.substring(0, 8)}`,
          code: gallery.galleryCode || gallery.galleryId.substring(0, 8).toUpperCase(),
          date: gallery.firstPhotoDate?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0],
          active: true,
          photoCount: gallery.photoCount,
          createdAt: gallery.firstPhotoDate || new Date(),
          updatedAt: new Date(),
          recoveredAt: new Date(),
          recoveryNote: 'Documento ripristinato automaticamente dalla collezione photos/orders'
        };
        
        // Se ha special PIN, è una galleria tematica (NO password)
        if (isSpecialGallery) {
          galleryData.specialTheme = themeFromOrder || 'elegance'; // Usa tema da ordine o default
          galleryData.hasSpecialPin = true;
          galleryData.hasPassword = false; // Special gallery NON hanno password
          console.log(`[Recovery] Galleria SPECIALE ${gallery.galleryId} con PIN, tema: ${galleryData.specialTheme}`);
        } else {
          // Galleria normale con password
          galleryData.hasPassword = hasPassword;
          galleryData.hasSpecialPin = false;
          if (hasPassword) {
            console.log(`[Recovery] Galleria NORMALE ${gallery.galleryId} con password`);
          }
        }
        
        await setDoc(doc(db, 'galleries', gallery.galleryId), galleryData, { merge: true });
        console.log(`[Recovery] Ripristinata galleria: ${gallery.galleryId}`, galleryData);
        
        recovered++;
        setProgress((recovered / toRecover.length) * 100);
      }
      
      setCurrentStep('');
      
      const updatedResults = scanResults.map(r => ({
        ...r,
        needsRecovery: false,
        hasDocument: true,
        documentEmpty: false
      }));
      setScanResults(updatedResults);
      
      toast({
        title: 'Ripristino completato!',
        description: `${recovered} gallerie ripristinate con successo. Ora puoi rinominarle dall'elenco gallerie.`
      });
      
    } catch (error) {
      console.error('[Recovery] Errore durante ripristino:', error);
      toast({
        title: 'Errore',
        description: 'Errore durante il ripristino delle gallerie',
        variant: 'destructive'
      });
    } finally {
      setIsRecovering(false);
    }
  };

  const needsRecoveryCount = scanResults.filter(r => r.needsRecovery).length;
  const okCount = scanResults.filter(r => !r.needsRecovery).length;

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          Ripristino Gallerie
        </CardTitle>
        <CardDescription>
          Questo strumento trova le gallerie con documenti vuoti e le ripristina usando i dati delle foto.
          Le password esistenti vengono mantenute.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button 
            onClick={scanGalleries} 
            disabled={isScanning || isRecovering}
            variant="outline"
          >
            {isScanning ? (
              <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Scansione...</>
            ) : (
              <><Search className="h-4 w-4 mr-2" /> Scansiona Gallerie</>
            )}
          </Button>
          
          {needsRecoveryCount > 0 && (
            <Button 
              onClick={recoverGalleries} 
              disabled={isScanning || isRecovering}
              className="bg-[#8b9a7d] hover:bg-[#7a8970]"
            >
              {isRecovering ? (
                <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Ripristino...</>
              ) : (
                <><Database className="h-4 w-4 mr-2" /> Ripristina {needsRecoveryCount} Gallerie</>
              )}
            </Button>
          )}
        </div>
        
        {(isScanning || isRecovering) && (
          <div className="space-y-2">
            <Progress value={progress} className="w-full" />
            <p className="text-sm text-gray-500">{currentStep}</p>
          </div>
        )}
        
        {scanResults.length > 0 && (
          <div className="space-y-4">
            <div className="flex gap-4 text-sm">
              <div className="flex items-center gap-1 text-green-600">
                <CheckCircle className="h-4 w-4" />
                {okCount} OK
              </div>
              <div className="flex items-center gap-1 text-amber-600">
                <AlertTriangle className="h-4 w-4" />
                {needsRecoveryCount} da ripristinare
              </div>
            </div>
            
            <div className="max-h-64 overflow-y-auto border rounded-md">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="text-left p-2">Codice</th>
                    <th className="text-left p-2">Foto</th>
                    <th className="text-left p-2">Data</th>
                    <th className="text-left p-2">Stato</th>
                  </tr>
                </thead>
                <tbody>
                  {scanResults.map(result => (
                    <tr key={result.galleryId} className="border-t">
                      <td className="p-2 font-mono text-xs">
                        {result.galleryCode || result.galleryId.substring(0, 8)}
                      </td>
                      <td className="p-2">{result.photoCount}</td>
                      <td className="p-2 text-xs">
                        {result.firstPhotoDate?.toLocaleDateString('it-IT') || '-'}
                      </td>
                      <td className="p-2">
                        {result.needsRecovery ? (
                          <span className="text-amber-600 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            {result.documentEmpty ? 'Vuoto' : 'Mancante'}
                          </span>
                        ) : (
                          <span className="text-green-600 flex items-center gap-1">
                            <CheckCircle className="h-3 w-3" />
                            OK
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
