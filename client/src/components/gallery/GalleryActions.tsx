import React, { useState } from 'react';
import { Download, FileText, Upload, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { usePlanFeatures } from '@/hooks/use-plan-features';
import { UpgradePrompt, FeatureBlocked } from '../UpgradePrompt';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { useFirebaseAuth } from '@/context/FirebaseAuthContext';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';

interface GalleryActionsProps {
  galleryId: string;
  galleryName: string;
  isOwner: boolean;
}

export function GalleryActions({ galleryId, galleryName, isOwner }: GalleryActionsProps) {
  const { user } = useFirebaseAuth();
  const { features, planType } = usePlanFeatures();
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [upgradeFeature, setUpgradeFeature] = useState('');
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);

  if (!isOwner || !user) {
    return null;
  }

  const handleDownloadZip = async () => {
    if (!features.downloadZip) {
      setUpgradeFeature('Download ZIP galleria');
      setShowUpgradeDialog(true);
      return;
    }

    setDownloadingZip(true);
    try {
      const generateZip = httpsCallable<{ galleryId: string }, { downloadUrl: string; photoCount: number; expiresIn: number }>(
        functions,
        'generateGalleryZip'
      );
      
      const result = await generateZip({ galleryId });
      
      // Download the file
      const a = document.createElement('a');
      a.href = result.data.downloadUrl;
      a.download = `${galleryName.replace(/[^a-z0-9]/gi, '_')}_gallery.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      toast.success(`ZIP generato con ${result.data.photoCount} foto. Il link scade tra ${Math.floor(result.data.expiresIn / 60)} minuti.`);
    } catch (error: any) {
      console.error('Errore download ZIP:', error);
      toast.error(error.message || 'Errore durante la generazione del file ZIP');
    } finally {
      setDownloadingZip(false);
    }
  };

  const handleExportCsv = async () => {
    if (!features.leadsExport) {
      setUpgradeFeature('Esportazione CSV contatti');
      setShowUpgradeDialog(true);
      return;
    }

    setExportingCsv(true);
    try {
      const exportCsv = httpsCallable<{ galleryId: string }, { csv: string; fileName: string; recordCount: number }>(
        functions,
        'exportGalleryAccessCSV'
      );
      
      const result = await exportCsv({ galleryId });
      
      // Decode base64 and download
      const csvContent = atob(result.data.csv);
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = result.data.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success(`CSV esportato con ${result.data.recordCount} contatti`);
    } catch (error: any) {
      console.error('Errore export CSV:', error);
      toast.error(error.message || 'Errore durante l\'esportazione CSV');
    } finally {
      setExportingCsv(false);
    }
  };

  return (
    <>
      <Card className="mt-4">
        <CardContent className="p-4">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Info className="h-5 w-5" />
            Azioni Galleria
          </h3>
          
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Download ZIP */}
            <div>
              {features.downloadZip ? (
                <Button
                  onClick={handleDownloadZip}
                  disabled={downloadingZip}
                  variant="outline"
                  className="w-full justify-start"
                >
                  <Download className="mr-2 h-4 w-4" />
                  {downloadingZip ? 'Generazione ZIP...' : 'Download ZIP Galleria'}
                </Button>
              ) : (
                <div className="relative">
                  <Button
                    variant="outline"
                    className="w-full justify-start opacity-50"
                    disabled
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download ZIP Galleria
                  </Button>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <FeatureBlocked
                      feature="Download ZIP"
                      requiredPlans={['premium']}
                      inline
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Export CSV */}
            <div>
              {features.leadsExport ? (
                <Button
                  onClick={handleExportCsv}
                  disabled={exportingCsv}
                  variant="outline"
                  className="w-full justify-start"
                >
                  <FileText className="mr-2 h-4 w-4" />
                  {exportingCsv ? 'Esportazione CSV...' : 'Esporta Contatti CSV'}
                </Button>
              ) : (
                <div className="relative">
                  <Button
                    variant="outline"
                    className="w-full justify-start opacity-50"
                    disabled
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    Esporta Contatti CSV
                  </Button>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <FeatureBlocked
                      feature="Export CSV"
                      requiredPlans={['pro', 'premium']}
                      inline
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {planType === 'free' && (
            <p className="mt-4 text-sm text-muted-foreground text-center">
              Passa a un piano superiore per sbloccare più funzionalità
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog open={showUpgradeDialog} onOpenChange={setShowUpgradeDialog}>
        <DialogContent>
          <UpgradePrompt
            feature={upgradeFeature}
            requiredPlans={upgradeFeature.includes('ZIP') ? ['premium'] : ['pro', 'premium']}
            currentPlan={planType}
            onClose={() => setShowUpgradeDialog(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}