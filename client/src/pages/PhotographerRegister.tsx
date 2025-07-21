import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { useToast } from '../hooks/use-toast';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Camera, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { createUrl } from '../lib/basePath';

export default function PhotographerRegister() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    studioName: '',
    phone: '',
    acceptTerms: false
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.password !== formData.confirmPassword) {
      toast({
        title: "Errore",
        description: "Le password non coincidono",
        variant: "destructive"
      });
      return;
    }

    if (formData.password.length < 6) {
      toast({
        title: "Errore", 
        description: "La password deve essere di almeno 6 caratteri",
        variant: "destructive"
      });
      return;
    }

    if (!formData.acceptTerms) {
      toast({
        title: "Errore",
        description: "Devi accettare i termini e condizioni",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);

    try {
      // Create Firebase Auth user
      const userCredential = await createUserWithEmailAndPassword(
        auth, 
        formData.email, 
        formData.password
      );

      const user = userCredential.user;

      // Update user profile
      await updateProfile(user, {
        displayName: `${formData.firstName} ${formData.lastName}`
      });

      // Create user document in Firestore
      await setDoc(doc(db, 'users', user.uid), {
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        studioName: formData.studioName,
        phone: formData.phone,
        role: 'photographer',
        userType: 'photographer',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // Create default subscription (Free plan)
      await setDoc(doc(db, 'users', user.uid, 'subscription', 'current'), {
        plan: 'free',
        active: true,
        expiresAt: null,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      toast({
        title: "Account creato con successo!",
        description: "Benvenuto in Memorie Sospese. Puoi iniziare a creare le tue gallerie."
      });

      // Redirect to dashboard or profile
      navigate(createUrl('/profile'));

    } catch (error: any) {
      console.error('Registration error:', error);
      
      let errorMessage = "Errore durante la registrazione";
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = "Email già in uso. Prova ad accedere invece.";
      } else if (error.code === 'auth/weak-password') {
        errorMessage = "Password troppo debole. Usa almeno 6 caratteri.";
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = "Email non valida.";
      }

      toast({
        title: "Errore",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-off-white via-sage-50 to-blue-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        {/* Back to Landing */}
        <div className="text-center">
          <Link href={createUrl('/landing')}>
            <Button variant="ghost" className="text-sage-600 hover:text-sage-700 mb-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Torna alla Landing
            </Button>
          </Link>
        </div>

        <Card className="border-sage-200 shadow-lg">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-gradient-to-r from-sage-600 to-blue-gray-600 rounded-full flex items-center justify-center mb-4">
              <Camera className="h-8 w-8 text-white" />
            </div>
            <CardTitle className="text-2xl font-bold text-blue-gray-900">
              Registrati come Fotografo
            </CardTitle>
            <p className="text-sage-600 mt-2">
              Crea il tuo account professionale per gestire gallerie matrimoniali
            </p>
          </CardHeader>
          
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="firstName">Nome *</Label>
                  <Input
                    id="firstName"
                    name="firstName"
                    type="text"
                    required
                    value={formData.firstName}
                    onChange={handleInputChange}
                    className="mt-1"
                    placeholder="Mario"
                  />
                </div>
                <div>
                  <Label htmlFor="lastName">Cognome *</Label>
                  <Input
                    id="lastName"
                    name="lastName"
                    type="text"
                    required
                    value={formData.lastName}
                    onChange={handleInputChange}
                    className="mt-1"
                    placeholder="Rossi"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="studioName">Nome Studio</Label>
                <Input
                  id="studioName"
                  name="studioName"
                  type="text"
                  value={formData.studioName}
                  onChange={handleInputChange}
                  className="mt-1"
                  placeholder="Studio Fotografico Rossi"
                />
              </div>

              <div>
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={handleInputChange}
                  className="mt-1"
                  placeholder="mario@esempio.it"
                />
              </div>

              <div>
                <Label htmlFor="phone">Telefono</Label>
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={handleInputChange}
                  className="mt-1"
                  placeholder="+39 123 456 7890"
                />
              </div>

              <div className="relative">
                <Label htmlFor="password">Password *</Label>
                <div className="relative mt-1">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    required
                    value={formData.password}
                    onChange={handleInputChange}
                    className="pr-10"
                    placeholder="Almeno 6 caratteri"
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 text-gray-400" />
                    ) : (
                      <Eye className="h-4 w-4 text-gray-400" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <Label htmlFor="confirmPassword">Conferma Password *</Label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  required
                  value={formData.confirmPassword}
                  onChange={handleInputChange}
                  className="mt-1"
                  placeholder="Ripeti la password"
                />
              </div>

              <div className="flex items-center">
                <input
                  id="acceptTerms"
                  name="acceptTerms"
                  type="checkbox"
                  checked={formData.acceptTerms}
                  onChange={handleInputChange}
                  className="h-4 w-4 text-sage-600 focus:ring-sage-500 border-gray-300 rounded"
                />
                <Label htmlFor="acceptTerms" className="ml-2 text-sm text-gray-600">
                  Accetto i{' '}
                  <Link href={createUrl('/terms')} className="text-sage-600 hover:text-sage-700 underline">
                    termini e condizioni
                  </Link>{' '}
                  e la{' '}
                  <Link href={createUrl('/privacy')} className="text-sage-600 hover:text-sage-700 underline">
                    privacy policy
                  </Link>
                </Label>
              </div>

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full bg-gradient-to-r from-sage-600 to-blue-gray-600 hover:from-sage-700 hover:to-blue-gray-700"
              >
                {isLoading ? 'Creazione account...' : 'Crea Account Fotografo'}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-sm text-gray-600">
                Hai già un account?{' '}
                <Link href={createUrl('/photographer-login')} className="text-sage-600 hover:text-sage-700 font-medium underline">
                  Accedi qui
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}