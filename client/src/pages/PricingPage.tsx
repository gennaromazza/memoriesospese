import React, { useState } from 'react';
import { Check, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SUBSCRIPTION_PLANS, type PlanType } from '@shared/subscription-schema';
import { usePlanFeatures } from '@/hooks/use-plan-features';
import { useFirebaseAuth } from '@/context/FirebaseAuthContext';
import { createCheckoutSession } from '@/lib/stripe';
import { useLocation } from 'wouter';
import { toast } from 'sonner';

interface PlanCardProps {
  plan: typeof SUBSCRIPTION_PLANS[keyof typeof SUBSCRIPTION_PLANS];
  isCurrentPlan: boolean;
  onSubscribe: () => void;
  loading: boolean;
}

function PlanCard({ plan, isCurrentPlan, onSubscribe, loading }: PlanCardProps) {
  const features = plan.features;
  const isPopular = plan.id === 'pro';

  return (
    <Card className={`relative ${isPopular ? 'border-primary' : ''}`}>
      {isPopular && (
        <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">
          Più Popolare
        </Badge>
      )}
      
      <CardHeader>
        <CardTitle className="text-2xl">{plan.name}</CardTitle>
        <CardDescription className="text-3xl font-bold">
          €{plan.price}
          <span className="text-sm font-normal">/mese</span>
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <ul className="space-y-2">
          <li className="flex items-center gap-2">
            <Check className="h-4 w-4 text-green-600" />
            <span className="text-sm">
              {features.galleryLimit === 'unlimited' ? 'Gallerie illimitate' : `${features.galleryLimit} galleria/e`}
            </span>
          </li>
          
          <li className="flex items-center gap-2">
            <Check className="h-4 w-4 text-green-600" />
            <span className="text-sm">
              {features.maxPhotos === 'unlimited' ? 'Foto illimitate' : `Fino a ${features.maxPhotos.toLocaleString()} foto`}
            </span>
          </li>
          
          <li className="flex items-center gap-2">
            <Check className="h-4 w-4 text-green-600" />
            <span className="text-sm">Messaggi vocali con sblocco futuro</span>
          </li>
          
          <li className="flex items-center gap-2">
            {features.likes ? (
              <Check className="h-4 w-4 text-green-600" />
            ) : (
              <X className="h-4 w-4 text-gray-400" />
            )}
            <span className={`text-sm ${!features.likes ? 'text-gray-400' : ''}`}>
              Like e commenti
            </span>
          </li>
          
          <li className="flex items-center gap-2">
            {features.watermarkEnabled ? (
              <Check className="h-4 w-4 text-green-600" />
            ) : (
              <X className="h-4 w-4 text-gray-400" />
            )}
            <span className={`text-sm ${!features.watermarkEnabled ? 'text-gray-400' : ''}`}>
              Watermark personalizzato
            </span>
          </li>
          
          <li className="flex items-center gap-2">
            {features.domainCustom ? (
              <Check className="h-4 w-4 text-green-600" />
            ) : (
              <X className="h-4 w-4 text-gray-400" />
            )}
            <span className={`text-sm ${!features.domainCustom ? 'text-gray-400' : ''}`}>
              Dominio personalizzato
            </span>
          </li>
          
          <li className="flex items-center gap-2">
            {features.leadsExport ? (
              <Check className="h-4 w-4 text-green-600" />
            ) : (
              <X className="h-4 w-4 text-gray-400" />
            )}
            <span className={`text-sm ${!features.leadsExport ? 'text-gray-400' : ''}`}>
              Esportazione CSV contatti
            </span>
          </li>
          
          <li className="flex items-center gap-2">
            {features.downloadZip ? (
              <Check className="h-4 w-4 text-green-600" />
            ) : (
              <X className="h-4 w-4 text-gray-400" />
            )}
            <span className={`text-sm ${!features.downloadZip ? 'text-gray-400' : ''}`}>
              Download ZIP galleria
            </span>
          </li>
          
          {features.storageLimitGB && (
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-600" />
              <span className="text-sm">
                {features.storageLimitGB === 'unlimited' ? 'Storage illimitato' : `${features.storageLimitGB}GB storage`}
              </span>
            </li>
          )}
        </ul>
      </CardContent>
      
      <CardFooter>
        <Button 
          className="w-full" 
          variant={isCurrentPlan ? 'outline' : isPopular ? 'default' : 'secondary'}
          disabled={isCurrentPlan || loading}
          onClick={onSubscribe}
        >
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isCurrentPlan ? 'Piano Attuale' : plan.price === 0 ? 'Inizia Gratis' : 'Abbonati Ora'}
        </Button>
      </CardFooter>
    </Card>
  );
}

export default function PricingPage() {
  const { user } = useFirebaseAuth();
  const { planType, isActive } = usePlanFeatures();
  const [, navigate] = useLocation();
  const [loadingPlan, setLoadingPlan] = useState<PlanType | null>(null);

  const handleSubscribe = async (selectedPlan: PlanType) => {
    if (!user) {
      toast.error('Devi effettuare il login per abbonarti');
      navigate('/admin');
      return;
    }

    if (selectedPlan === 'free') {
      // Redirect to profile for free plan users
      toast.success('Piano gratuito attivato! Vai al tuo profilo per iniziare.');
      navigate('/profile');
      return;
    }

    setLoadingPlan(selectedPlan);

    try {
      const baseUrl = window.location.origin + import.meta.env.BASE_URL;
      await createCheckoutSession({
        successUrl: `${baseUrl}pricing?success=true&plan=${selectedPlan}`,
        cancelUrl: `${baseUrl}pricing?cancelled=true`,
        userId: user.uid,
        userEmail: user.email || '',
        planType: selectedPlan,
      });
    } catch (error) {
      console.error('Errore creazione checkout:', error);
      
      // In modalità sviluppo, simula successo
      if (import.meta.env.DEV) {
        toast.success(`Checkout simulato per piano ${selectedPlan}! (modalità sviluppo)`);
        // Simula il redirect di successo
        setTimeout(() => {
          navigate(`/pricing?success=true&plan=${selectedPlan}`);
        }, 1000);
      } else {
        toast.error('Errore durante la creazione del checkout');
      }
    } finally {
      setLoadingPlan(null);
    }
  };

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    
    // Handle success/cancel from Stripe
    if (params.get('success') === 'true') {
      const plan = params.get('plan') as PlanType;
      const sessionId = params.get('session_id');
      
      // In modalità sviluppo, simula il salvataggio dell'abbonamento
      if (import.meta.env.DEV && user && plan && sessionId?.includes('sim_')) {
        import('@/lib/firebase').then(({ db }) => {
          import('firebase/firestore').then(({ doc, setDoc, serverTimestamp }) => {
            const subscriptionRef = doc(db, 'users', user.uid, 'subscription', 'current');
            setDoc(subscriptionRef, {
              plan,
              active: true,
              stripeSessionId: sessionId,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              expiresAt: plan === 'free' ? null : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 anno
            }).then(() => {
              console.log('Abbonamento simulato salvato in Firestore');
            }).catch(error => {
              console.error('Errore salvataggio abbonamento simulato:', error);
            });
          });
        });
      }
      
      toast.success(`Abbonamento ${plan} attivato con successo!`);
      window.history.replaceState({}, '', '/pricing');
    } else if (params.get('cancelled') === 'true') {
      toast.info('Checkout annullato');
      window.history.replaceState({}, '', '/pricing');
    }
    
    // Handle welcome message for new users
    if (params.get('welcome') === 'true') {
      toast.success('Benvenuto! Inizia con il piano gratuito o scegli un upgrade.', {
        duration: 5000
      });
      window.history.replaceState({}, '', '/pricing');
    }
  }, [user]);

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
            Scegli il Piano Perfetto per Te
          </h1>
          <p className="mt-4 text-lg text-gray-600">
            Conserva i ricordi del tuo matrimonio con le funzionalità che ti servono
          </p>
          
          {import.meta.env.DEV && (
            <div className="mt-4">
              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                🧪 Modalità Sviluppo - Checkout Stripe Simulato
              </Badge>
            </div>
          )}
          
          {user && isActive && (
            <div className="mt-6">
              <Badge variant="outline" className="text-lg px-4 py-2">
                Piano attuale: {SUBSCRIPTION_PLANS[planType].name}
              </Badge>
            </div>
          )}
        </div>

        <div className="mt-12 grid gap-8 lg:grid-cols-4">
          {Object.values(SUBSCRIPTION_PLANS).map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              isCurrentPlan={user ? planType === plan.id && isActive : false}
              onSubscribe={() => handleSubscribe(plan.id)}
              loading={loadingPlan === plan.id}
            />
          ))}
        </div>

        <div className="mt-12 text-center">
          <p className="text-sm text-gray-600">
            Tutti i piani includono supporto tecnico e aggiornamenti gratuiti.
            <br />
            Cancella in qualsiasi momento dal tuo profilo.
          </p>
        </div>
      </div>
    </div>
  );
}