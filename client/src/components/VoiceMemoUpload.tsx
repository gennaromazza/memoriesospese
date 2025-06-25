import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { 
  Mic2, 
  Upload, 
  Calendar, 
  MessageSquare, 
  User, 
  Clock,
  Heart,
  Sparkles,
  FileAudio,
  LogIn
} from 'lucide-react';
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import VoiceRecorder from './VoiceRecorder';
import UnifiedAuthDialog from './auth/UnifiedAuthDialog';

interface VoiceMemoUploadProps {
  galleryId: string;
  galleryName: string;
  userEmail?: string;
  userName?: string;
  onUploadComplete?: () => void;
}

export default function VoiceMemoUpload({ 
  galleryId, 
  galleryName, 
  userEmail,
  userName,
  onUploadComplete 
}: VoiceMemoUploadProps) {

  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState(userEmail || '');
  const [currentUserName, setCurrentUserName] = useState(userName || '');

  // Aggiorna i dati di autenticazione quando cambiano le props
  useEffect(() => {
    setCurrentUserEmail(userEmail || '');
    setCurrentUserName(userName || '');
  }, [userEmail, userName]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [message, setMessage] = useState('');
  const [unlockDate, setUnlockDate] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedDuration, setRecordedDuration] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading-audio' | 'saving-data' | 'complete'>('idle');
  const [activeTab, setActiveTab] = useState('record');

  const { toast } = useToast();

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('audio/')) {
        toast({
          title: "Errore",
          description: "Per favore seleziona un file audio valido",
          variant: "destructive",
        });
        return;
      }

      // Validate file size (max 50MB)
      if (file.size > 50 * 1024 * 1024) {
        toast({
          title: "Errore",
          description: "Il file audio è troppo grande. Massimo 50MB consentiti.",
          variant: "destructive",
        });
        return;
      }

      setSelectedFile(file);
      setRecordedBlob(null); // Clear recorded audio if file is selected
    }
  };

  const handleRecordingComplete = (audioBlob: Blob, duration: number) => {
    setRecordedBlob(audioBlob);
    setRecordedDuration(duration);
    setSelectedFile(null); // Clear file if recording is made
    toast({
      title: "Registrazione completata",
      description: `Audio registrato di ${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}`,
    });
  };

  const compressAudio = async (audioBlob: Blob): Promise<Blob> => {
    // If the file is already small enough, don't compress
    if (audioBlob.size < 2 * 1024 * 1024) { // 2MB
      return audioBlob;
    }

    try {
      // Create audio context for compression
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      // Reduce sample rate for compression
      const targetSampleRate = Math.min(audioBuffer.sampleRate, 22050);
      const compressedBuffer = audioContext.createBuffer(
        1, // mono
        audioBuffer.duration * targetSampleRate,
        targetSampleRate
      );

      // Mix down to mono and resample
      const inputData = audioBuffer.getChannelData(0);
      const outputData = compressedBuffer.getChannelData(0);
      const ratio = inputData.length / outputData.length;

      for (let i = 0; i < outputData.length; i++) {
        outputData[i] = inputData[Math.floor(i * ratio)];
      }

      // Convert back to blob
      const offlineContext = new OfflineAudioContext(1, compressedBuffer.length, targetSampleRate);
      const source = offlineContext.createBufferSource();
      source.buffer = compressedBuffer;
      source.connect(offlineContext.destination);
      source.start();

      const renderedBuffer = await offlineContext.startRendering();

      // Convert to WAV format (smaller than WebM for voice)
      const wavBlob = await audioBufferToWav(renderedBuffer);

      return wavBlob.size < audioBlob.size ? wavBlob : audioBlob;
    } catch (error) {
      console.warn('Audio compression failed, using original:', error);
      return audioBlob;
    }
  };

  const audioBufferToWav = (buffer: AudioBuffer): Promise<Blob> => {
    return new Promise((resolve) => {
      const length = buffer.length;
      const arrayBuffer = new ArrayBuffer(44 + length * 2);
      const view = new DataView(arrayBuffer);
      const channels = [buffer.getChannelData(0)];

      // WAV header
      const writeString = (offset: number, string: string) => {
        for (let i = 0; i < string.length; i++) {
          view.setUint8(offset + i, string.charCodeAt(i));
        }
      };

      writeString(0, 'RIFF');
      view.setUint32(4, 36 + length * 2, true);
      writeString(8, 'WAVE');
      writeString(12, 'fmt ');
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 1, true);
      view.setUint32(24, buffer.sampleRate, true);
      view.setUint32(28, buffer.sampleRate * 2, true);
      view.setUint16(32, 2, true);
      view.setUint16(34, 16, true);
      writeString(36, 'data');
      view.setUint32(40, length * 2, true);

      // Convert float samples to 16-bit PCM
      let offset = 44;
      for (let i = 0; i < length; i++) {
        const sample = Math.max(-1, Math.min(1, channels[0][i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        offset += 2;
      }

      resolve(new Blob([arrayBuffer], { type: 'audio/wav' }));
    });
  };

  const uploadAudioToFirebase = async (audioData: Blob | File, fileName: string): Promise<string> => {
    const storage = getStorage();
    const audioRef = ref(storage, `voice-memos/${galleryId}/${fileName}`);
    const uploadTask = uploadBytesResumable(audioRef, audioData);

    return new Promise((resolve, reject) => {
      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 80;
          setUploadProgress(progress);
        },
        (error) => {
          console.error('Upload error:', error);
          reject(error);
        },
        async () => {
          try {
            setUploadProgress(80);
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            resolve(downloadURL);
          } catch (error) {
            reject(error);
          }
        }
      );
    });
  };

  const handleSubmit = async () => {
    if (!guestName.trim()) {
      toast({
        title: "Errore",
        description: "Inserisci il tuo nome",
        variant: "destructive",
      });
      return;
    }

    const audioData = recordedBlob || selectedFile;
    if (!audioData) {
      toast({
        title: "Errore",
        description: "Registra un audio o seleziona un file",
        variant: "destructive",
      });
      return;
    }

     // Verifica autenticazione prima del caricamento
     if (!currentUserEmail || !currentUserName || currentUserEmail.trim() === '' || currentUserName.trim() === '') {
      setShowAuthDialog(true);
      return;
    }

    setIsUploading(true);
    setUploadStatus('uploading-audio');

    try {
      // Generate filename
      const timestamp = Date.now();
      const fileName = recordedBlob 
        ? `recording_${timestamp}.webm`
        : `${selectedFile!.name.replace(/[^a-zA-Z0-9.-]/g, '_')}_${timestamp}`;

      // Upload audio to Firebase Storage with progress
      const audioUrl = await uploadAudioToFirebase(audioData, fileName);

      // Update status to saving data
      setUploadStatus('saving-data');
      setUploadProgress(85);

      // Calculate file size and duration
      const fileSize = audioData.size;
      const duration = recordedBlob ? recordedDuration : undefined;

      // Prepare voice memo data with user authentication
      const voiceMemoData = {
        galleryId,
        guestName: guestName.trim(),
        audioUrl,
        message: message.trim() || undefined,
        unlockDate: unlockDate || undefined,
        fileName,
        fileSize,
        duration,
        userEmail: currentUserEmail, // Required for auth
        userName: currentUserName // Required for auth
      };

      // Send to backend API
      const response = await fetch(`/api/galleries/${galleryId}/voice-memos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(voiceMemoData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Errore nel caricamento del voice memo' }));
        throw new Error(errorData.error || 'Errore nel caricamento del voice memo');
      }

      setUploadStatus('complete');
      setUploadProgress(100);

      // Brief delay to show completion
      await new Promise(resolve => setTimeout(resolve, 500));

      toast({
        title: "Voice memo caricato!",
        description: unlockDate 
          ? `Il tuo messaggio sarà disponibile dal ${new Date(unlockDate).toLocaleDateString('it-IT')}`
          : "Il tuo messaggio è ora disponibile nella galleria",
      });

      // Reset form
      setGuestName('');
      setMessage('');
      setUnlockDate('');
      setSelectedFile(null);
      setRecordedBlob(null);
      setRecordedDuration(0);
      setIsDialogOpen(false);

      if (onUploadComplete) {
        onUploadComplete();
      }

    } catch (error) {
      console.error('Error uploading voice memo:', error);
      toast({
        title: "Errore",
        description: "Errore nel caricamento del voice memo. Riprova.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      setUploadStatus('idle');
    }
  };

  const handleDialogClose = () => {
    if (!isUploading) {
      setIsDialogOpen(false);
    }
  };

  const getTomorrowDate = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  };

  return (
    <>
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogTrigger asChild>
          <div className="relative group">
            <Button 
              variant="outline" 
              size="lg"
              className="bg-[#6d7e6d] hover:bg-[#5a6b5a] text-[#e2f3ff] border-0 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 px-4 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-base"
              onClick={() => setIsDialogOpen(true)}
            >
              <Mic2 className="h-4 w-4 sm:h-5 sm:w-5 mr-1.5 sm:mr-2" />
              <span className="font-medium hidden xs:inline">Registra un ricordo</span>
              <span className="font-medium xs:hidden">Vocale</span>
              <Heart className="h-3 w-3 sm:h-4 sm:w-4 ml-1.5 sm:ml-2 animate-pulse" />
            </Button>

            {/* Tooltip */}
            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 text-xs rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap z-50 hidden sm:block max-w-xs text-[#707d6e] bg-[#667f9a]">
              <div className="flex items-center gap-2 mb-1">
                <Mic2 className="h-3 w-3 text-sage-300" />
                <span className="font-medium">Vocali segreti!</span>
              </div>
              <div className="text-xs text-gray-300">
                • Registra un messaggio<br/>
                • Imposta data di sblocco<br/>
                • Sorprendi gli sposi
              </div>
              <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-2 h-2 bg-blue-gray-800 rotate-45"></div>
            </div>
          </div>
        </DialogTrigger>
        <DialogContent className="sm:max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader className="text-center pb-4 sm:pb-6">
            <div className="mx-auto w-12 h-12 sm:w-16 sm:h-16 bg-gradient-to-r from-sage-600 to-blue-gray-600 rounded-full flex items-center justify-center mb-3 sm:mb-4">
              <Mic2 className="h-6 w-6 sm:h-8 sm:w-8 text-white" />
            </div>
            <DialogTitle className="text-xl sm:text-2xl font-bold text-blue-gray-900">
              Vocali Segreti
            </DialogTitle>
            <p className="text-sage-700 mt-1 sm:mt-2 text-sm sm:text-base px-2">
              Registra un messaggio speciale per "{galleryName}"
            </p>
          </DialogHeader>

          <div className="space-y-4 sm:space-y-6">
            {/* Guest name input */}
            <div className="space-y-2">
              <Label htmlFor="guest-name" className="text-sage-700 font-medium text-sm">
                Il tuo nome
              </Label>
              <Input
                id="guest-name"
                placeholder="Es. Marco e Lisa"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                className="border-gray-300 focus:border-sage-500 focus:ring-sage-500 text-sm sm:text-base h-10 sm:h-11"
              />
            </div>

            {/* Tabs for record vs upload */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="record" className="flex items-center gap-2">
                  <Mic2 className="h-4 w-4" />
                  Registra ora
                </TabsTrigger>
                <TabsTrigger value="upload" className="flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  Carica file
                </TabsTrigger>
              </TabsList>

              <TabsContent value="record" className="mt-4">
                <VoiceRecorder 
                  onRecordingComplete={handleRecordingComplete}
                  maxDuration={300} // 5 minutes
                />
              </TabsContent>

              <TabsContent value="upload" className="mt-4">
                <Card>
                  <CardContent className="p-4 sm:p-6">
                    <div className="space-y-4">
                      <div className="text-center">
                        <FileAudio className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                        <h3 className="text-lg font-medium text-gray-900 mb-2">
                          Carica file audio
                        </h3>
                        <p className="text-sm text-gray-600 mb-4">
                          Seleziona un file audio dal tuo dispositivo (max 50MB)
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="audio-file" className="sr-only">File audio</Label>
                        <Input
                          id="audio-file"
                          type="file"
                          accept="audio/*"
                          onChange={handleFileSelect}
                          className="border-2 border-dashed border-gray-300 hover:border-sage-400 transition-colors"
                        />
                      </div>

                      {selectedFile && (
                        <div className="bg-sage-50 p-3 rounded-lg border border-sage-200">
                          <div className="flex items-center gap-2">
                            <FileAudio className="h-5 w-5 text-sage-600" />
                            <div>
                              <p className="font-medium text-blue-gray-900">{selectedFile.name}</p>
                              <p className="text-sm text-sage-700">
                                {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            {/* Message input */}
            <div className="space-y-2">
              <Label htmlFor="message" className="text-sage-700 font-medium text-sm">
                Messaggio (opzionale)
              </Label>
              <Textarea
                id="message"
                placeholder="Aggiungi un messaggio scritto per accompagnare il tuo audio..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="border-gray-300 focus:border-sage-500 focus:ring-sage-500 text-sm sm:text-base min-h-[80px]"
                maxLength={500}
              />
              <div className="text-xs text-gray-500 text-right">
                {message.length}/500 caratteri
              </div>
            </div>

            {/* Unlock date */}
            <div className="space-y-2">
              <Label htmlFor="unlock-date" className="text-sage-700 font-medium text-sm flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Data di sblocco (opzionale)
              </Label>
              <Input
                id="unlock-date"
                type="date"
                value={unlockDate}
                onChange={(e) => setUnlockDate(e.target.value)}
                min={getTomorrowDate()}
                className="border-gray-300 focus:border-sage-500 focus:ring-sage-500 text-sm sm:text-base h-10 sm:h-11"
              />
              <p className="text-xs text-gray-600">
                Se non specifichi una data, il messaggio sarà subito disponibile
              </p>
            </div>

            {/* Upload progress */}
            {isUploading && (
              <Card className="bg-sage-50 border border-sage-200">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-5 h-5 border-2 border-sage-600 border-t-transparent rounded-full animate-spin"></div>
                    <span className="font-medium text-blue-gray-900">Caricamento in corso...</span>
                    <span className="ml-auto text-sage-700 font-bold">{Math.round(uploadProgress)}%</span>
                  </div>
                  <Progress value={uploadProgress} className="w-full h-2" />
                  <p className="text-xs text-sage-700 mt-2">
                    Il tuo messaggio vocale sta per essere salvato...
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Progress bar when uploading */}
            {isUploading && (
              <div className="space-y-3 mb-4">
                <div className="bg-gray-100 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">
                      {uploadStatus === 'uploading-audio' && 'Caricamento audio...'}
                      {uploadStatus === 'saving-data' && 'Salvataggio dati...'}
                      {uploadStatus === 'complete' && 'Completato!'}
                    </span>
                    <span className="text-sm text-gray-600">{Math.round(uploadProgress)}%</span>
                  </div>
                  <div 
                    className="bg-gradient-to-r from-sage-600 to-blue-gray-600 h-2 rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${uploadProgress}%` }}
                  ></div>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <div className="w-3 h-3 border-2 border-sage-600 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-xs text-gray-500">
                    {uploadStatus === 'uploading-audio' && 'Upload del file audio in corso...'}
                    {uploadStatus === 'saving-data' && 'Creazione del ricordo...'}
                    {uploadStatus === 'complete' && 'Ricordo salvato con successo!'}
                  </span>
                </div>
              </div>
            )}

            {/* Validation messages */}
            {(!guestName.trim() || (!recordedBlob && !selectedFile)) && !isUploading && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-red-600 font-bold text-xs">!</span>
                  </div>
                  <div className="space-y-2">
                    <p className="font-medium text-red-900 text-sm">
                      Completa questi campi per salvare il ricordo:
                    </p>
                    <ul className="text-red-800 text-sm space-y-1">
                      {!guestName.trim() && (
                        <li className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-red-400 rounded-full"></div>
                          Inserisci il tuo nome
                        </li>
                      )}
                      {(!recordedBlob && !selectedFile) && (
                        <li className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-red-400 rounded-full"></div>
                          Registra un audio o carica un file
                        </li>
                      )}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-3">
              <Button
                onClick={() => {
                  if (!currentUserEmail || !currentUserName || currentUserEmail.trim() === '' || currentUserName.trim() === '') {
                    setShowAuthDialog(true);
                  } else {
                    handleSubmit();
                  }
                }}
                disabled={!guestName.trim() || (!recordedBlob && !selectedFile) || isUploading}
                className="flex-1 bg-gradient-to-r from-sage-600 to-blue-gray-600 hover:from-sage-700 hover:to-blue-gray-700 text-white font-medium py-2.5 sm:py-3 shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base relative"
              >
                {isUploading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    {uploadStatus === 'uploading-audio' && 'Caricamento...'}
                    {uploadStatus === 'saving-data' && 'Salvataggio...'}
                    {uploadStatus === 'complete' && 'Completato!'}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Heart className="h-4 w-4" />
                    {(!guestName.trim() || (!recordedBlob && !selectedFile)) ? 'Completa i campi' : 'Salva ricordo'}
                  </div>
                )}
                {(!guestName.trim() || (!recordedBlob && !selectedFile)) && !isUploading && (
                  <div className="absolute inset-0 bg-gray-400 bg-opacity-10 rounded-md flex items-center justify-center">
                    <div className="w-4 h-4 border-2 border-gray-400 rounded-full flex items-center justify-center">
                      <span className="text-gray-400 font-bold text-xs">!</span>
                    </div>
                  </div>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={handleDialogClose}
                disabled={isUploading}
                className="px-4 sm:px-6 border-gray-300 hover:bg-gray-50 text-sm sm:text-base py-2.5 sm:py-3"
              >
                {isUploading ? 'Attendere...' : 'Annulla'}
              </Button>
            </div>

            {/* Info box */}
            {!isUploading && (
              <div className="bg-amber-50 p-3 rounded-lg border border-amber-200">
                <div className="flex items-start gap-2">
                  <Sparkles className="h-4 w-4 text-amber-600 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-amber-900 mb-1">Come funziona:</p>
                    <ul className="text-amber-800 space-y-1 text-xs">
                      <li>• I tuoi vocali saranno privati fino alla data di sblocco</li>
                      <li>• Solo gli sposi potranno ascoltarli dopo lo sblocco</li>
                      <li>• Crea un ricordo speciale per il loro giorno perfetto</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <UnifiedAuthDialog
        isOpen={showAuthDialog}
        onOpenChange={setShowAuthDialog}
        galleryId={galleryId}
        onAuthComplete={() => {
          setShowAuthDialog(false);
          // Aspetta un momento per permettere l'aggiornamento del localStorage
          setTimeout(() => {
            // Aggiorna i dati di autenticazione locali
            const email = localStorage.getItem('userEmail') || '';
            const name = localStorage.getItem('userName') || '';
            setCurrentUserEmail(email);
            setCurrentUserName(name);
            handleSubmit();
            if (onUploadComplete) {
              onUploadComplete();
            }
          }, 500);
        }}
        defaultTab="login"
      />
    </>
  );
}