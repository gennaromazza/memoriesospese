import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Upload, User, LogIn, UserPlus, Camera, Heart, Sparkles, Share2, ImageIcon, KeyRound, Mail } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { auth, storage, db } from '@/lib/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, sendPasswordResetEmail } from 'firebase/auth';
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
  // Dati per recupero password
  const [resetEmail, setResetEmail] = useState('');
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);

  const { toast } = useToast();
  const { user, userProfile, isAuthenticated } = useAuth();

  const resetForm = () => {
    setGuestName('');
    setEmail('');
    setPassword('');
    setSelectedFiles([]);
    setUploadProgress(0);
    setResetEmail('');
    setResetEmailSent(false);
  };

  const handlePasswordReset = async () => {
    if (!resetEmail) {
      toast({
        title: "Errore",
        description: "Inserisci la tua email per recuperare la password",
        variant: "destructive"
      });
      return;
    }

    setIsResettingPassword(true);

    try {
      // Usa Firebase direttamente per inviare l'email di reset
      await sendPasswordResetEmail(auth, resetEmail);

      setResetEmailSent(true);
      toast({
        title: "Email inviata!",
        description: "Controlla la tua casella email per le istruzioni di reset",
        variant: "default"
      });
    } catch (error: any) {
      let errorMessage = "Errore nell'invio dell'email di reset";

      if (error.code === 'auth/user-not-found') {
        errorMessage = "Nessun account trovato con questa email";
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = "Indirizzo email non valido";
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage = "Troppi tentativi. Riprova più tardi";
      }

      toast({
        title: "Errore",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setIsResettingPassword(false);
    }
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

    const currentUserEmail = user?.email || '';
    const currentUserName = userProfile?.displayName || user?.displayName || '';

    // Verifica autenticazione prima del caricamento
    if (!isAuthenticated || !currentUserEmail || !currentUserName) {
      toast({
        title: "Non sei autenticato",
        description: "Per favore, effettua il login per caricare le foto",
        variant: "destructive",
      });
      return;
    }

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
            className="bg-[#7c80ae] hover:bg-[#6b6f9c] text-white border-0 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 px-4 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-base"
            onClick={handleDialogOpen}
          >
            <Camera className="h-4 w-4 sm:h-5 sm:w-5 mr-1.5 sm:mr-2" />
            <span className="font-medium hidden xs:inline">Condividi i tuoi ricordi</span>
            <span className="font-medium xs:hidden">Carica foto</span>
            <Sparkles className="h-3 w-3 sm:h-4 sm:w-4 ml-1.5 sm:ml-2 animate-pulse" />
          </Button>

          {/* Tooltip con guida - nascosto su mobile */}
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-blue-gray-800 text-white text-xs rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap z-50 hidden sm:block max-w-xs">
            <div className="flex items-center gap-2 mb-1">
              <Heart className="h-3 w-3 text-sage-300" />
              <span className="font-medium text-[#7c80ae]">Aggiungi le tue foto!</span>
            </div>
            <div className="text-xs text-[#7c80ae] bg-[#f7dfba]">
              • Accesso veloce<br/>
              • Carica multiple foto<br/>
              • Condividi con tutti
            </div>
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-2 h-2 bg-blue-gray-800 rotate-45"></div>
          </div>
        </div>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader className="text-center pb-4 sm:pb-6">
          <div className="mx-auto w-12 h-12 sm:w-16 sm:h-16 bg-gradient-to-r from-sage-500 to-blue-gray-500 rounded-full flex items-center justify-center mb-3 sm:mb-4">
            <Camera className="h-6 w-6 sm:h-8 sm:w-8 text-white" />
          </div>
          <DialogTitle className="text-xl sm:text-2xl font-bold text-blue-gray-900">
            Condividi i tuoi ricordi
          </DialogTitle>
          <DialogDescription className="text-blue-gray-600 mt-1 sm:mt-2 text-sm sm:text-base px-2">
            Aggiungi le tue foto della "{galleryName}" e condividile con tutti gli ospiti
          </DialogDescription>

          {/* Info badges */}
          <div className="flex flex-wrap justify-center gap-1.5 sm:gap-2 mt-3 sm:mt-4">
            <div className="flex items-center gap-1 bg-sage-50 text-sage-700 px-2 sm:px-3 py-1 rounded-full text-xs">
              <Share2 className="h-3 w-3" />
              <span className="hidden xs:inline">Visibili a tutti</span>
              <span className="xs:hidden">Condivise</span>
            </div>
            <div className="flex items-center gap-1 bg-blue-gray-50 text-blue-gray-700 px-2 sm:px-3 py-1 rounded-full text-xs">
              <ImageIcon className="h-3 w-3" />
              <span className="hidden xs:inline">Più foto insieme</span>
              <span className="xs:hidden">Multiple</span>
            </div>
            <div className="flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2 sm:px-3 py-1 rounded-full text-xs">
              <Sparkles className="h-3 w-3" />
              <span className="hidden xs:inline">Gratis e veloce</span>
              <span className="xs:hidden">Veloce</span>
            </div>
          </div>
        </DialogHeader>

        {!user ? (
          <Tabs defaultValue="register" className="w-full">
            <TabsList className="grid w-full grid-cols-3 h-auto">
              <TabsTrigger value="register" className="flex items-center gap-1 sm:gap-2 py-2 px-2 sm:px-3 text-xs sm:text-sm">
                <UserPlus className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden xs:inline">Registrati</span>
                <span className="xs:hidden">Nuovo</span>
              </TabsTrigger>
              <TabsTrigger value="login" className="flex items-center gap-1 sm:gap-2 py-2 px-2 sm:px-3 text-xs sm:text-sm">
                <LogIn className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden xs:inline">Accedi</span>
                <span className="xs:hidden">Login</span>
              </TabsTrigger>
              <TabsTrigger value="reset" className="flex items-center gap-1 sm:gap-2 py-2 px-2 sm:px-3 text-xs sm:text-sm">
                <KeyRound className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden xs:inline">Password?</span>
                <span className="xs:hidden">Reset</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="register" className="space-y-3 sm:space-y-4 mt-3 sm:mt-4">
              <div className="bg-gradient-to-r from-sage-50 to-blue-gray-50 p-3 sm:p-4 rounded-lg mb-3 sm:mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <UserPlus className="h-3 w-3 sm:h-4 sm:w-4 text-sage-600" />
                  <span className="text-xs sm:text-sm font-medium text-sage-900">Nuovo utente? Registrati velocemente!</span>
                </div>
                <p className="text-xs text-sage-700">
                  Crea il tuo account per iniziare a condividere foto immediatamente
                </p>
              </div>

              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="name" className="text-blue-gray-700 font-medium text-sm">Nome completo</Label>
                <Input
                  id="name"
                  placeholder="Es. Mario Rossi"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  className="border-gray-300 focus:border-sage-500 focus:ring-sage-500 text-sm sm:text-base h-10 sm:h-11"
                />
              </div>
              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="email" className="text-blue-gray-700 font-medium text-sm">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="mario@esempio.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="border-gray-300 focus:border-sage-500 focus:ring-sage-500 text-sm sm:text-base h-10 sm:h-11"
                />
              </div>
              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="password" className="text-blue-gray-700 font-medium text-sm">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Minimo 6 caratteri"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="border-gray-300 focus:border-sage-500 focus:ring-sage-500 text-sm sm:text-base h-10 sm:h-11"
                />
              </div>
              <Button 
                onClick={() => handleAuth(false)}
                disabled={isAuthenticating}
                className="w-full bg-gradient-to-r from-sage-600 to-blue-gray-600 hover:from-sage-700 hover:to-blue-gray-700 text-white font-medium py-2.5 sm:py-3 shadow-lg hover:shadow-xl transition-all duration-300 text-sm sm:text-base"
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

            <TabsContent value="login" className="space-y-3 sm:space-y-4 mt-3 sm:mt-4">
              <div className="bg-gradient-to-r from-blue-gray-50 to-sage-50 p-3 sm:p-4 rounded-lg mb-3 sm:mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <LogIn className="h-3 w-3 sm:h-4 sm:w-4 text-blue-gray-600" />
                  <span className="text-xs sm:text-sm font-medium text-blue-gray-900">Hai già un account? Accedi subito!</span>
                </div>
                <p className="text-xs text-blue-gray-700">
                  Inserisci le tue credenziali per continuare a condividere foto
                </p>
              </div>

              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="login-email" className="text-blue-gray-700 font-medium text-sm">Email</Label>
                <Input
                  id="login-email"
                  type="email"
                  placeholder="mario@esempio.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="border-gray-300 focus:border-blue-gray-500 focus:ring-blue-gray-500 text-sm sm:text-base h-10 sm:h-11"
                />
              </div>
              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="login-password" className="text-blue-gray-700 font-medium text-sm">Password</Label>
                <Input
                  id="login-password"
                  type="password"
                  placeholder="La tua password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="border-gray-300 focus:border-blue-gray-500 focus:ring-blue-gray-500 text-sm sm:text-base h-10 sm:h-11"
                />
              </div>
              <Button 
                onClick={() => handleAuth(true)}
                disabled={isAuthenticating}
                className="w-full bg-gradient-to-r from-blue-gray-600 to-sage-600 hover:from-blue-gray-700 hover:to-sage-700 text-white font-medium py-2.5 sm:py-3 shadow-lg hover:shadow-xl transition-all duration-300 text-sm sm:text-base"
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

            <TabsContent value="reset" className="space-y-3 sm:space-y-4 mt-3 sm:mt-4">
              {!resetEmailSent ? (
                <>
                  <div className="bg-gradient-to-r from-amber-50 to-orange-50 p-3 sm:p-4 rounded-lg mb-3 sm:mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <KeyRound className="h-3 w-3 sm:h-4 sm:w-4 text-amber-600" />
                      <span className="text-xs sm:text-sm font-medium text-amber-900">Password dimenticata?</span>
                    </div>
                    <p className="text-xs text-amber-700">
                      Inserisci la tua email e ti invieremo le istruzioni per reimpostare la password
                    </p>
                  </div>

                  <div className="space-y-1.5 sm:space-y-2">
                    <Label htmlFor="reset-email" className="text-blue-gray-700 font-medium text-sm">Email</Label>
                    <Input
                      id="reset-email"
                      type="email"
                      placeholder="mario@esempio.com"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      className="border-gray-300 focus:border-amber-500 focus:ring-amber-500 text-sm sm:text-base h-10 sm:h-11"
                    />
                  </div>

                  <Button 
                    onClick={handlePasswordReset}
                    disabled={isResettingPassword || !resetEmail}
                    className="w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white font-medium py-2.5 sm:py-3 shadow-lg hover:shadow-xl transition-all duration-300 text-sm sm:text-base"
                  >
                    {isResettingPassword ? (
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Invio email...
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4" />
                        Invia email di reset
                      </div>
                    )}
                  </Button>
                </>
              ) : (
                <div className="text-center space-y-4">
                  <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                    <Mail className="h-8 w-8 text-green-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">Email inviata!</h3>
                    <p className="text-sm text-gray-600 mb-4">
                      Abbiamo inviato le istruzioni per reimpostare la password a:
                    </p>
                    <p className="font-medium text-gray-900 mb-4">{resetEmail}</p>
                    <p className="text-xs text-gray-500">
                      Controlla anche nella cartella spam se non vedi l'email
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setResetEmailSent(false);
                      setResetEmail('');
                    }}
                    className="w-full"
                  >
                    Invia a un'altra email
                  </Button>
                </div>
              )}
            </TabsContent>
          </Tabs>
        ) : (
          <div className="space-y-4 sm:space-y-6">
            {/* Benvenuto personalizzato */}
            <div className="bg-gradient-to-r from-sage-50 to-emerald-50 p-3 sm:p-4 rounded-lg border border-sage-200">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-sage-500 rounded-full flex items-center justify-center">
                  <User className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                </div>
                <div>
                  <p className="font-medium text-sage-900 text-sm sm:text-base">
                    Ciao <span className="text-sage-700">{userProfile?.displayName || user?.displayName}</span>!
                  </p>
                  <p className="text-xs sm:text-sm text-sage-700">
                    Sei pronto per condividere i tuoi ricordi speciali
                  </p>
                </div>
              </div>
            </div>

            {/* Sezione caricamento file */}
            <div className="space-y-3 sm:space-y-4">
              <div className="flex items-center gap-2 mb-2 sm:mb-3">
                <ImageIcon className="h-4 w-4 sm:h-5 sm:w-5 text-blue-gray-600" />
                <Label htmlFor="photo-upload" className="text-base sm:text-lg font-medium text-blue-gray-900">
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
                <div className={`border-2 border-dashed rounded-lg p-4 sm:p-6 lg:p-8 text-center transition-all duration-300 ${
                  selectedFiles.length > 0 
                    ? 'border-sage-400 bg-sage-50' 
                    : 'border-gray-300 bg-gray-50 hover:border-sage-400 hover:bg-sage-50'
                }`}>
                  {selectedFiles.length === 0 ? (
                    <div className="space-y-2 sm:space-y-3">
                      <Camera className="mx-auto h-8 w-8 sm:h-10 sm:w-10 lg:h-12 lg:w-12 text-gray-400" />
                      <div>
                        <p className="text-sm sm:text-base lg:text-lg font-medium text-gray-900">
                          Clicca per selezionare le foto
                        </p>
                        <p className="text-xs sm:text-sm text-gray-500">
                          Puoi selezionare più foto contemporaneamente
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2 sm:space-y-3">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-6 h-6 sm:w-8 sm:h-8 bg-sage-500 rounded-full flex items-center justify-center">
                          <ImageIcon className="h-3 w-3 sm:h-4 sm:w-4 text-white" />
                        </div>
                        <span className="text-sm sm:text-base lg:text-lg font-medium text-sage-900">
                          {selectedFiles.length} foto selezionate
                        </span>
                      </div>
                      <p className="text-xs sm:text-sm text-sage-700">
                        Perfetto! Clicca "Carica foto" per condividerle
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Progress bar con animazioni */}
            {isUploading && (
              <div className="bg-sage-50 p-3 sm:p-4 rounded-lg border border-sage-200">
                <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
                  <div className="w-5 h-5 sm:w-6 sm:h-6 border-2 border-sage-600 border-t-transparent rounded-full animate-spin"></div>
                  <span className="font-medium text-sage-900 text-sm sm:text-base">Caricamento in corso...</span>
                  <span className="ml-auto text-sage-700 font-bold text-sm sm:text-base">{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} className="w-full h-1.5 sm:h-2" />
                <p className="text-xs sm:text-sm text-sage-700 mt-2">
                  Le tue foto stanno per essere condivise con tutti gli ospiti
                </p>
              </div>
            )}

            {/* Pulsanti azione */}
            <div className="flex gap-2 sm:gap-3">
              <Button
                onClick={handleUpload}
                disabled={selectedFiles.length === 0 || isUploading}
                className="flex-1 bg-gradient-to-r from-sage-600 to-blue-gray-600 hover:from-sage-700 hover:to-blue-gray-700 text-white font-medium py-2.5 sm:py-3 shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
              >
                {isUploading ? (
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <div className="w-3 h-3 sm:w-4 sm:h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span className="hidden xs:inline">Caricamento...</span>
                    <span className="xs:hidden">Upload...</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <Upload className="h-3 w-3 sm:h-4 sm:w-4" />
                    <span className="hidden xs:inline">
                      Carica {selectedFiles.length > 0 ? `${selectedFiles.length} foto` : 'foto'}
                    </span>
                    <span className="xs:hidden">Carica</span>
                  </div>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={handleDialogClose}
                disabled={isUploading}
                className="px-3 sm:px-6 border-gray-300 hover:bg-gray-50 text-sm sm:text-base py-2.5 sm:py-3"
              >
                {isUploading ? (
                  <span className="xs:hidden">Wait...</span>
                ) : (
                  <span className="xs:hidden">Close</span>
                )}
                <span className="hidden xs:inline">
                  {isUploading ? 'Attendere...' : 'Annulla'}
                </span>
              </Button>
            </div>

            {/* Suggerimenti utili */}
            {!isUploading && selectedFiles.length === 0 && (
              <div className="bg-amber-50 p-3 rounded-lg border border-amber-200">
                <div className="flex items-start gap-2">
                  <Sparkles className="h-3 w-3 sm:h-4 sm:w-4 text-amber-600 mt-0.5" />
                  <div className="text-xs sm:text-sm">
                    <p className="font-medium text-amber-900 mb-1">Suggerimenti:</p>
                    <ul className="text-amber-800 space-y-1 text-xs">
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