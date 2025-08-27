import React, { useState } from 'react';
import { Download, FileText, Upload, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
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
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);

  if (!isOwner || !user) {
    return null;
  }

  const handleDownloadZip = async () => {

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
              <Button
                onClick={handleDownloadZip}
                disabled={downloadingZip}
                variant="outline"
                className="w-full justify-start"
              >
                <Download className="mr-2 h-4 w-4" />
                {downloadingZip ? 'Generazione ZIP...' : 'Download ZIP Galleria'}
              </Button>
            </div>

            {/* Export CSV */}
            <div>
              <Button
                onClick={handleExportCsv}
                disabled={exportingCsv}
                variant="outline"
                className="w-full justify-start"
              >
                <FileText className="mr-2 h-4 w-4" />
                {exportingCsv ? 'Esportazione CSV...' : 'Esporta Contatti CSV'}
              </Button>
            </div>
          </div>

        </CardContent>
      </Card>

    </>
  );
}