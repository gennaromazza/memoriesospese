import React from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Sparkles } from 'lucide-react';
import { SUBSCRIPTION_PLANS, type PlanType } from '@shared/subscription-schema';

interface UpgradePromptProps {
  feature: string;
  requiredPlans: PlanType[];
  currentPlan?: PlanType;
  onClose?: () => void;
}

export function UpgradePrompt({ feature, requiredPlans, currentPlan = 'free', onClose }: UpgradePromptProps) {
  const [, navigate] = useLocation();
  
  const lowestRequiredPlan = requiredPlans.reduce((lowest, plan) => {
    const lowestPrice = SUBSCRIPTION_PLANS[lowest].price;
    const planPrice = SUBSCRIPTION_PLANS[plan].price;
    return planPrice < lowestPrice ? plan : lowest;
  }, requiredPlans[0]);

  const handleUpgrade = () => {
    navigate('/pricing');
    onClose?.();
  };

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-yellow-500" />
          Funzionalità Premium
        </CardTitle>
        <CardDescription>
          {feature} è disponibile nei piani {requiredPlans.map(p => SUBSCRIPTION_PLANS[p].name).join(' e ')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Sblocca questa funzionalità e molto altro passando al piano {SUBSCRIPTION_PLANS[lowestRequiredPlan].name} 
          a soli €{SUBSCRIPTION_PLANS[lowestRequiredPlan].price}/mese.
        </p>
        <div className="flex gap-2">
          <Button onClick={handleUpgrade} className="flex-1">
            Fai Upgrade Ora
          </Button>
          {onClose && (
            <Button variant="outline" onClick={onClose}>
              Annulla
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface FeatureBlockedProps {
  feature: string;
  requiredPlans: PlanType[];
  inline?: boolean;
}

export function FeatureBlocked({ feature, requiredPlans, inline = false }: FeatureBlockedProps) {
  const [, navigate] = useLocation();
  
  if (inline) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Sparkles className="h-4 w-4" />
        <span>{feature} disponibile nel piano {requiredPlans.map(p => SUBSCRIPTION_PLANS[p].name).join('/')}</span>
        <Button 
          variant="link" 
          size="sm" 
          className="h-auto p-0"
          onClick={() => navigate('/pricing')}
        >
          Fai upgrade
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
      <Sparkles className="mx-auto h-8 w-8 text-gray-400" />
      <h3 className="mt-2 text-sm font-medium text-gray-900">{feature}</h3>
      <p className="mt-1 text-sm text-gray-500">
        Disponibile nei piani {requiredPlans.map(p => SUBSCRIPTION_PLANS[p].name).join(' e ')}
      </p>
      <div className="mt-4">
        <Button 
          size="sm"
          onClick={() => navigate('/pricing')}
        >
          Fai Upgrade per Sbloccare
        </Button>
      </div>
    </div>
  );
}