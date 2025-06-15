import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Upload, User, LogIn, UserPlus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { auth, storage, db } from '@/lib/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, serverTimestamp, doc, updateDoc, increment, getDocs, query, where, arrayUnion } from 'firebase/firestore';
import imageCompression from 'browser-image-compression';

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

      toast({
        title: "Upload completato!",
        description: `${uploadedPhotos.length} foto caricate con successo`,
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

  return (
    <Dialog open={isDialogOpen} onOpenChange={handleDialogClose}>
      <DialogTrigger asChild>
        <Button 
          variant="outline" 
          size="sm"
          className="bg-white hover:bg-gray-50 border-gray-300"
        >
          <Upload className="h-4 w-4 mr-2" />
          Carica foto
        </Button>
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-rose-600" />
            Carica le tue foto
          </DialogTitle>
          <DialogDescription>
            Condividi i tuoi ricordi di "{galleryName}"
          </DialogDescription>
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
              <div className="space-y-2">
                <Label htmlFor="name">Nome completo</Label>
                <Input
                  id="name"
                  placeholder="Es. Mario Rossi"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="mario@esempio.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Minimo 6 caratteri"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button 
                onClick={() => handleAuth(false)}
                disabled={isAuthenticating}
                className="w-full bg-rose-600 hover:bg-rose-700"
              >
                {isAuthenticating ? "Registrazione..." : "Registrati"}
              </Button>
            </TabsContent>
            
            <TabsContent value="login" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="login-email">Email</Label>
                <Input
                  id="login-email"
                  type="email"
                  placeholder="mario@esempio.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-password">Password</Label>
                <Input
                  id="login-password"
                  type="password"
                  placeholder="La tua password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button 
                onClick={() => handleAuth(true)}
                disabled={isAuthenticating}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                {isAuthenticating ? "Accesso..." : "Accedi"}
              </Button>
            </TabsContent>
          </Tabs>
        ) : (
          <div className="space-y-4">
            <div className="text-center py-2">
              <p className="text-sm text-gray-600">
                Ciao <span className="font-medium">{guestName}</span>! 
                Seleziona le foto da caricare.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="photo-upload">Seleziona foto</Label>
              <Input
                id="photo-upload"
                type="file"
                multiple
                accept="image/*"
                onChange={handleFileSelect}
                disabled={isUploading}
              />
              {selectedFiles.length > 0 && (
                <p className="text-sm text-gray-500">
                  {selectedFiles.length} foto selezionate
                </p>
              )}
            </div>

            {isUploading && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Caricamento in corso...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} className="w-full" />
              </div>
            )}

            <div className="flex gap-2">
              <Button
                onClick={handleUpload}
                disabled={selectedFiles.length === 0 || isUploading}
                className="flex-1 bg-rose-600 hover:bg-rose-700"
              >
                <Upload className="h-4 w-4 mr-2" />
                {isUploading ? "Caricamento..." : "Carica foto"}
              </Button>
              <Button
                variant="outline"
                onClick={handleDialogClose}
                disabled={isUploading}
              >
                Annulla
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}