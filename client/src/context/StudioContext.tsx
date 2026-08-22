import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  DEFAULT_HOMEPAGE_CONTENT,
  resolveHomepageContent,
  type HomepageContent,
} from '@shared/homepage-content';

export interface StudioSettings {
  name: string;
  slogan: string;
  address: string;
  phone: string;
  email: string;
  websiteUrl: string;
  partitaIVA?: string;
  codiceFiscale?: string;
  /** Dati strutturati richiesti dal tracciato FatturaPA per il mittente. */
  fiscalVia?: string;
  fiscalCap?: string;
  fiscalComune?: string;
  fiscalProvincia?: string;
  regimeFiscale?: string;
  socialLinks: {
    facebook?: string;
    instagram?: string;
    twitter?: string;
  };
  about: string;
  logo?: string;
  whatsapp?: string;
  // Testi personalizzabili della Hero Section
  heroTitle: string;
  heroSubtitle: string;
  heroButtonText: string;
  // Testi personalizzabili della sezione WhatsApp
  whatsappTitle: string;
  whatsappSubtitle: string;
  whatsappText: string;
  whatsappButtonText: string;
  homepageContent?: HomepageContent;
  googleReviewUrl?: string;
}

const defaultSettings: StudioSettings = {
  name: 'Image Studio Fotografico',
  slogan: 'Catturiamo momenti, creiamo ricordi',
  address: '',
  phone: '',
  email: '',
  websiteUrl: '',
  partitaIVA: '',
  codiceFiscale: '',
  fiscalVia: '',
  fiscalCap: '',
  fiscalComune: '',
  fiscalProvincia: '',
  regimeFiscale: '',
  socialLinks: {
    facebook: '',
    instagram: '',
    twitter: ''
  },
  about: '',
  logo: '',
  whatsapp: '',
  // Valori predefiniti per i testi della Hero Section
  heroTitle: 'Catturiamo i momenti più preziosi',
  heroSubtitle: 'Ogni scatto racconta una storia unica',
  heroButtonText: 'Trova la tua galleria',
  // Valori predefiniti per i testi della sezione WhatsApp
  whatsappTitle: 'Contattaci su WhatsApp',
  whatsappSubtitle: 'Assistenza rapida e personalizzata',
  whatsappText: 'Per ricevere informazioni sui nostri servizi fotografici per matrimoni o per qualsiasi altra domanda, contattaci direttamente su WhatsApp. Riceverai una risposta rapida e personalizzata per le tue esigenze.',
  whatsappButtonText: 'Scrivici su WhatsApp',
  homepageContent: DEFAULT_HOMEPAGE_CONTENT,
};

interface StudioContextType {
  studioSettings: StudioSettings;
  loading: boolean;
  error: string | null;
}

const StudioContext = createContext<StudioContextType>({
  studioSettings: defaultSettings,
  loading: true,
  error: null
});

export const useStudio = () => useContext(StudioContext);

interface StudioProviderProps {
  children: ReactNode;
}

export function StudioProvider({ children }: StudioProviderProps) {
  const [studioSettings, setStudioSettings] = useState<StudioSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const settingsRef = doc(db, 'settings', 'studio');
    return onSnapshot(settingsRef, (snapshot) => {
      const settingsData = snapshot.exists() ? snapshot.data() as Partial<StudioSettings> : {};
      setStudioSettings({
        ...defaultSettings,
        ...settingsData,
        socialLinks: { ...defaultSettings.socialLinks, ...(settingsData.socialLinks || {}) },
        homepageContent: resolveHomepageContent(settingsData.homepageContent),
      });
      setError(null);
      setLoading(false);
    }, () => {
      setError('Impossibile caricare le impostazioni dello studio');
      setLoading(false);
    });
  }, []);

  return (
    <StudioContext.Provider value={{ studioSettings, loading, error }}>
      {children}
    </StudioContext.Provider>
  );
}
