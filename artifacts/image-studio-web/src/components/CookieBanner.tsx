import { useState, useEffect } from 'react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { createUrl } from '@/lib/basePath';
import { Cookie, Settings, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

const COOKIE_CONSENT_KEY = 'image_studio_cookie_consent';
const COOKIE_PREFERENCES_KEY = 'image_studio_cookie_preferences';

interface CookiePreferences {
  necessary: boolean;
  analytics: boolean;
  marketing: boolean;
}

const defaultPreferences: CookiePreferences = {
  necessary: true,
  analytics: false,
  marketing: false,
};

export function getCookieConsent(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(COOKIE_CONSENT_KEY) === 'true';
}

export function getCookiePreferences(): CookiePreferences {
  if (typeof window === 'undefined') return defaultPreferences;
  const stored = localStorage.getItem(COOKIE_PREFERENCES_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      return defaultPreferences;
    }
  }
  return defaultPreferences;
}

export default function CookieBanner() {
  const [showBanner, setShowBanner] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [preferences, setPreferences] = useState<CookiePreferences>(defaultPreferences);

  useEffect(() => {
    const consent = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (!consent) {
      setShowBanner(true);
    } else {
      const storedPrefs = localStorage.getItem(COOKIE_PREFERENCES_KEY);
      if (storedPrefs) {
        try {
          setPreferences(JSON.parse(storedPrefs));
        } catch {
          setPreferences(defaultPreferences);
        }
      }
    }
  }, []);

  const acceptAll = () => {
    const allAccepted: CookiePreferences = {
      necessary: true,
      analytics: true,
      marketing: true,
    };
    localStorage.setItem(COOKIE_CONSENT_KEY, 'true');
    localStorage.setItem(COOKIE_PREFERENCES_KEY, JSON.stringify(allAccepted));
    setPreferences(allAccepted);
    setShowBanner(false);
  };

  const acceptNecessaryOnly = () => {
    const necessaryOnly: CookiePreferences = {
      necessary: true,
      analytics: false,
      marketing: false,
    };
    localStorage.setItem(COOKIE_CONSENT_KEY, 'true');
    localStorage.setItem(COOKIE_PREFERENCES_KEY, JSON.stringify(necessaryOnly));
    setPreferences(necessaryOnly);
    setShowBanner(false);
  };

  const savePreferences = () => {
    const safePreferences = {
      ...preferences,
      necessary: true,
    };
    localStorage.setItem(COOKIE_CONSENT_KEY, 'true');
    localStorage.setItem(COOKIE_PREFERENCES_KEY, JSON.stringify(safePreferences));
    setPreferences(safePreferences);
    setShowBanner(false);
    setShowSettings(false);
  };

  if (!showBanner) return null;

  return (
    <>
      <div 
        className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 shadow-lg p-4 md:p-6"
        data-testid="cookie-banner"
      >
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
            <div className="flex items-start gap-3 flex-1">
              <Cookie className="w-6 h-6 text-sage flex-shrink-0 mt-1" />
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">Utilizziamo i Cookie</h3>
                <p className="text-sm text-gray-600">
                  Questo sito utilizza cookie per migliorare la tua esperienza. I cookie necessari sono essenziali per il funzionamento del sito.
                  Puoi scegliere quali cookie accettare.{' '}
                  <Link href={createUrl('/cookie-policy')} className="text-sage hover:underline">
                    Leggi la Cookie Policy
                  </Link>
                </p>
              </div>
            </div>
            
            <div className="flex flex-wrap gap-2 w-full md:w-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSettings(true)}
                className="flex items-center gap-1"
                data-testid="cookie-settings-btn"
              >
                <Settings className="w-4 h-4" />
                Personalizza
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={acceptNecessaryOnly}
                data-testid="cookie-reject-btn"
              >
                Solo Necessari
              </Button>
              <Button
                size="sm"
                onClick={acceptAll}
                className="bg-sage hover:bg-sage/90"
                data-testid="cookie-accept-all-btn"
              >
                Accetta Tutti
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-sage" />
              Preferenze Cookie
            </DialogTitle>
            <DialogDescription>
              Gestisci le tue preferenze sui cookie. I cookie necessari non possono essere disattivati.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="font-medium">Cookie Necessari</Label>
                <p className="text-sm text-gray-500">
                  Essenziali per il funzionamento del sito (autenticazione, sicurezza, preferenze).
                </p>
              </div>
              <Switch checked={true} disabled />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="font-medium">Cookie Analitici</Label>
                <p className="text-sm text-gray-500">
                  Ci aiutano a capire come utilizzi il sito per migliorarlo.
                </p>
              </div>
              <Switch
                checked={preferences.analytics}
                onCheckedChange={(checked) => setPreferences(prev => ({ ...prev, analytics: checked }))}
                data-testid="cookie-analytics-switch"
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="font-medium">Cookie di Marketing</Label>
                <p className="text-sm text-gray-500">
                  Utilizzati per mostrarti contenuti pubblicitari pertinenti.
                </p>
              </div>
              <Switch
                checked={preferences.marketing}
                onCheckedChange={(checked) => setPreferences(prev => ({ ...prev, marketing: checked }))}
                data-testid="cookie-marketing-switch"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowSettings(false)}>
              Annulla
            </Button>
            <Button onClick={savePreferences} className="bg-sage hover:bg-sage/90" data-testid="cookie-save-preferences-btn">
              Salva Preferenze
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
