import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Upload, User, LogIn, UserPlus, Camera, Heart, Sparkles, Share2, ImageIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { auth, storage, db } from '@/lib/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, serverTimestamp, doc, updateDoc, increment, getDocs, query, where, arrayUnion } from 'firebase/firestore';
import imageCompression from 'browser-image-compression';
import { notifySubscribers, createGalleryUrl } from '@/lib/notificationService';

interface GuestUploadProps {
  galleryId: string;
  galleryName: string;
  onPhotosUploaded?: (count: number) => void;
}

export default function GuestUpload({ galleryId, galleryName, onPhotosUploaded }: GuestUploadProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  // Dati per autenticazione
  const [guestName, setGuestName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  const { toast } = useToast();

  const resetForm = () => {
    setGuestName('');
    setEmail('');
    setPassword('');
    setSelectedFiles([]);
    setIsAuthenticated(false);
    setUploadProgress(0);
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      const fileArray = Array.from(files);
      const imageFiles = fileArray.filter(file => file.type.startsWith('image/'));
      setSelectedFiles(imageFiles);
    }
  };

  const compressImage = async (file: File): Promise<File> => {
    const options = {
      maxSizeMB: 1,
      maxWidthOrHeight: 1920,
      useWebWorker: true,
    };

    try {
      return await imageCompression(file, options);
    } catch (error) {
      console.error('Errore nella compressione:', error);
      return file;
    }
  };

  const handleAuth = async (isLogin: boolean = false) => {
    if (!email.trim() || !password.trim() || (!isLogin && !guestName.trim())) {
      toast({
        title: "Campi mancanti",
        description: "Compila tutti i campi richiesti",
        variant: "destructive",
      });
      return;
    }

    setIsAuthenticating(true);

    try {
      if (isLogin) {
        // Login esistente
        await signInWithEmailAndPassword(auth, email, password);
        // Ottieni il nome dal profilo esistente
        const user = auth.currentUser;
        if (user?.displayName) {
          setGuestName(user.displayName);
        }

        // Aggiorna lastLoginAt per utenti esistenti
        if (user) {
          const userQuery = collection(db, 'users');
          const userDocs = await getDocs(query(userQuery, where('uid', '==', user.uid)));
          
          if (!userDocs.empty) {
            const userDoc = userDocs.docs[0];
            await updateDoc(userDoc.ref, {
              lastLoginAt: serverTimestamp(),
              galleries: arrayUnion(galleryId) // Aggiungi la galleria se non presente
            });
          }
        }
      } else {
        // Registrazione nuovo utente
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCredential.user, {
          displayName: guestName.trim()
        });

        // Salva i dati dell'utente in Firestore per l'admin
        const userData = {
          uid: userCredential.user.uid,
          name: guestName.trim(),
          email: userCredential.user.email,
          createdAt: serverTimestamp(),
          lastLoginAt: serverTimestamp(),
          role: 'guest',
          galleries: [galleryId] // Array delle gallerie a cui ha accesso
        };

        await addDoc(collection(db, 'users'), userData);
      }

      setIsAuthenticated(true);
      toast({
        title: "Autenticazione completata",
        description: `Benvenuto! Ora puoi caricare le tue foto.`,
      });

    } catch (error: any) {
      console.error('Errore autenticazione:', error);
      let message = "Si è verificato un errore durante l'autenticazione";
      
      if (error.code === 'auth/email-already-in-use') {
        message = "Questa email è già registrata. Prova ad accedere invece di registrarti.";
      } else if (error.code === 'auth/weak-password') {
        message = "La password deve essere di almeno 6 caratteri";
      } else if (error.code === 'auth/invalid-email') {
        message = "Email non valida";
      } else if (error.code === 'auth/user-not-found') {
        message = "Utente non trovato. Prova a registrarti.";
      } else if (error.code === 'auth/wrong-password') {
        message = "Password errata";
      }

      toast({
        title: "Errore di autenticazione",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) {
      toast({
        title: "Nessuna foto selezionata",
        description: "Seleziona almeno una foto da caricare",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const uploadedPhotos = [];
      const totalFiles = selectedFiles.length;
      const currentUser = auth.currentUser;

      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        
        // Comprimi l'immagine
        const compressedFile = await compressImage(file);
        
        // Upload su Firebase Storage
        const fileName = `guest-${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${compressedFile.name}`;
        const storageRef = ref(storage, `galleries/${galleryId}/guests/${fileName}`);
        
        const snapshot = await uploadBytes(storageRef, compressedFile);
        const downloadURL = await getDownloadURL(snapshot.ref);

        // Salva i metadati in Firestore
        const photoData = {
          name: compressedFile.name,
          url: downloadURL,
          size: compressedFile.size,
          contentType: compressedFile.type,
          createdAt: serverTimestamp(),
          uploadedBy: 'guest',
          uploaderName: currentUser?.displayName || guestName.trim(),
          uploaderRole: 'guest',
          uploaderEmail: currentUser?.email,
          uploaderUid: currentUser?.uid
        };

        await addDoc(collection(db, 'galleries', galleryId, 'photos'), photoData);
        uploadedPhotos.push(photoData);

        // Aggiorna il progresso
        setUploadProgress(Math.round(((i + 1) / totalFiles) * 100));
      }

      // Aggiorna il conteggio delle foto nella galleria
      const galleryRef = doc(db, 'galleries', galleryId);
      await updateDoc(galleryRef, {
        photoCount: increment(uploadedPhotos.length),
        updatedAt: serverTimestamp()
      });

      // Invia notifiche email ai subscribers
      try {
        const galleryUrl = createGalleryUrl(galleryId);
        const uploaderDisplayName = currentUser?.displayName || guestName.trim();
        
        await notifySubscribers({
          galleryId,
          galleryName,
          newPhotosCount: uploadedPhotos.length,
          uploaderName: uploaderDisplayName,
          galleryUrl
        });
      } catch (notifyError) {
        console.warn('Errore invio notifiche:', notifyError);
        // Non bloccare l'upload per errori di notifica
      }

      toast({
        title: "Upload completato!",
        description: `${uploadedPhotos.length} foto caricate con successo. I subscribers sono stati notificati.`,
      });

      // Reset del form
      setSelectedFiles([]);
      setIsDialogOpen(false);
      resetForm();
      
      if (onPhotosUploaded) {
        onPhotosUploaded(uploadedPhotos.length);
      }

    } catch (error) {
      console.error('Errore nell\'upload:', error);
      toast({
        title: "Errore nell'upload",
        description: "Si è verificato un errore durante il caricamento delle foto",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDialogClose = () => {
    setIsDialogOpen(false);
    resetForm();
  };

  const handleDialogOpen = () => {
    setIsDialogOpen(true);
  };

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <div className="relative group">
          <Button 
            variant="outline" 
            size="lg"
            className="bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 px-6 py-3"
            onClick={handleDialogOpen}
          >
            <Camera className="h-5 w-5 mr-2" />
            <span className="font-medium">Condividi i tuoi ricordi</span>
            <Sparkles className="h-4 w-4 ml-2 animate-pulse" />
          </Button>
          
          {/* Tooltip con guida */}
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-4 py-3 bg-gray-900 text-white text-sm rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap z-50">
            <div className="flex items-center gap-2 mb-1">
              <Heart className="h-4 w-4 text-rose-400" />
              <span className="font-medium">Aggiungi le tue foto alla galleria!</span>
            </div>
            <div className="text-xs text-gray-300">
              • Registrati o accedi in pochi secondi<br/>
              • Carica più foto contemporaneamente<br/>
              • Le foto saranno visibili a tutti gli ospiti
            </div>
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-2 h-2 bg-gray-900 rotate-45"></div>
          </div>
        </div>
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="text-center pb-6">
          <div className="mx-auto w-16 h-16 bg-gradient-to-r from-rose-500 to-pink-500 rounded-full flex items-center justify-center mb-4">
            <Camera className="h-8 w-8 text-white" />
          </div>
          <DialogTitle className="text-2xl font-bold text-gray-900">
            Condividi i tuoi ricordi
          </DialogTitle>
          <DialogDescription className="text-gray-600 mt-2">
            Aggiungi le tue foto della "{galleryName}" e condividile con tutti gli ospiti
          </DialogDescription>
          
          {/* Info badges */}
          <div className="flex flex-wrap justify-center gap-2 mt-4">
            <div className="flex items-center gap-1 bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs">
              <Share2 className="h-3 w-3" />
              Visibili a tutti
            </div>
            <div className="flex items-center gap-1 bg-green-50 text-green-700 px-3 py-1 rounded-full text-xs">
              <ImageIcon className="h-3 w-3" />
              Più foto insieme
            </div>
            <div className="flex items-center gap-1 bg-purple-50 text-purple-700 px-3 py-1 rounded-full text-xs">
              <Sparkles className="h-3 w-3" />
              Gratis e veloce
            </div>
          </div>
        </DialogHeader>

        {!isAuthenticated ? (
          <Tabs defaultValue="register" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="register" className="flex items-center gap-2">
                <UserPlus className="h-4 w-4" />
                Registrati
              </TabsTrigger>
              <TabsTrigger value="login" className="flex items-center gap-2">
                <LogIn className="h-4 w-4" />
                Accedi
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="register" className="space-y-4 mt-4">
              <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-4 rounded-lg mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <UserPlus className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-900">Nuovo utente? Registrati in 30 secondi!</span>
                </div>
                <p className="text-xs text-blue-700">
                  Crea il tuo account per iniziare a condividere foto immediatamente
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="name" className="text-gray-700 font-medium">Nome completo</Label>
                <Input
                  id="name"
                  placeholder="Es. Mario Rossi"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  className="border-gray-300 focus:border-rose-500 focus:ring-rose-500"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-gray-700 font-medium">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="mario@esempio.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="border-gray-300 focus:border-rose-500 focus:ring-rose-500"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-gray-700 font-medium">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Minimo 6 caratteri"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="border-gray-300 focus:border-rose-500 focus:ring-rose-500"
                />
              </div>
              <Button 
                onClick={() => handleAuth(false)}
                disabled={isAuthenticating}
                className="w-full bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-700 hover:to-pink-700 text-white font-medium py-3 shadow-lg hover:shadow-xl transition-all duration-300"
              >
                {isAuthenticating ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Registrazione...
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <UserPlus className="h-4 w-4" />
                    Crea account e inizia
                  </div>
                )}
              </Button>
            </TabsContent>
            
            <TabsContent value="login" className="space-y-4 mt-4">
              <div className="bg-gradient-to-r from-green-50 to-blue-50 p-4 rounded-lg mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <LogIn className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium text-green-900">Hai già un account? Accedi subito!</span>
                </div>
                <p className="text-xs text-green-700">
                  Inserisci le tue credenziali per continuare a condividere foto
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="login-email" className="text-gray-700 font-medium">Email</Label>
                <Input
                  id="login-email"
                  type="email"
                  placeholder="mario@esempio.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-password" className="text-gray-700 font-medium">Password</Label>
                <Input
                  id="login-password"
                  type="password"
                  placeholder="La tua password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
              <Button 
                onClick={() => handleAuth(true)}
                disabled={isAuthenticating}
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium py-3 shadow-lg hover:shadow-xl transition-all duration-300"
              >
                {isAuthenticating ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Accesso...
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <LogIn className="h-4 w-4" />
                    Accedi e carica foto
                  </div>
                )}
              </Button>
            </TabsContent>
          </Tabs>
        ) : (
          <div className="space-y-6">
            {/* Benvenuto personalizzato */}
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-4 rounded-lg border border-green-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center">
                  <User className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="font-medium text-green-900">
                    Ciao <span className="text-green-700">{guestName}</span>! 👋
                  </p>
                  <p className="text-sm text-green-700">
                    Sei pronto per condividere i tuoi ricordi speciali
                  </p>
                </div>
              </div>
            </div>

            {/* Sezione caricamento file */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-3">
                <ImageIcon className="h-5 w-5 text-gray-600" />
                <Label htmlFor="photo-upload" className="text-lg font-medium text-gray-900">
                  Seleziona le tue foto
                </Label>
              </div>
              
              {/* Area drag & drop stilizzata */}
              <div className="relative">
                <Input
                  id="photo-upload"
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleFileSelect}
                  disabled={isUploading}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <div className={`border-2 border-dashed rounded-lg p-8 text-center transition-all duration-300 ${
                  selectedFiles.length > 0 
                    ? 'border-green-400 bg-green-50' 
                    : 'border-gray-300 bg-gray-50 hover:border-rose-400 hover:bg-rose-50'
                }`}>
                  {selectedFiles.length === 0 ? (
                    <div className="space-y-3">
                      <Camera className="mx-auto h-12 w-12 text-gray-400" />
                      <div>
                        <p className="text-lg font-medium text-gray-900">
                          Clicca per selezionare le foto
                        </p>
                        <p className="text-sm text-gray-500">
                          Puoi selezionare più foto contemporaneamente
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                          <ImageIcon className="h-4 w-4 text-white" />
                        </div>
                        <span className="text-lg font-medium text-green-900">
                          {selectedFiles.length} foto selezionate
                        </span>
                      </div>
                      <p className="text-sm text-green-700">
                        Perfetto! Clicca "Carica foto" per condividerle
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Progress bar con animazioni */}
            {isUploading && (
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  <span className="font-medium text-blue-900">Caricamento in corso...</span>
                  <span className="ml-auto text-blue-700 font-bold">{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} className="w-full h-2" />
                <p className="text-sm text-blue-700 mt-2">
                  Le tue foto stanno per essere condivise con tutti gli ospiti
                </p>
              </div>
            )}

            {/* Pulsanti azione */}
            <div className="flex gap-3">
              <Button
                onClick={handleUpload}
                disabled={selectedFiles.length === 0 || isUploading}
                className="flex-1 bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-700 hover:to-pink-700 text-white font-medium py-3 shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUploading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Caricamento...
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Upload className="h-4 w-4" />
                    Carica {selectedFiles.length > 0 ? `${selectedFiles.length} foto` : 'foto'}
                  </div>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={handleDialogClose}
                disabled={isUploading}
                className="px-6 border-gray-300 hover:bg-gray-50"
              >
                {isUploading ? 'Attendere...' : 'Annulla'}
              </Button>
            </div>

            {/* Suggerimenti utili */}
            {!isUploading && selectedFiles.length === 0 && (
              <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-200">
                <div className="flex items-start gap-2">
                  <Sparkles className="h-4 w-4 text-yellow-600 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-yellow-900 mb-1">Suggerimenti:</p>
                    <ul className="text-yellow-800 space-y-1 text-xs">
                      <li>• Seleziona più foto insieme per risparmiare tempo</li>
                      <li>• Le foto saranno automaticamente ottimizzate</li>
                      <li>• Tutti gli ospiti potranno vederle e scaricarle</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}