import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface StudioSettings {
  name: string;
  slogan: string;
  address: string;
  phone: string;
  email: string;
  websiteUrl: string;
  partitaIVA?: string;
  codiceFiscale?: string;
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
  whatsappButtonText: 'Scrivici su WhatsApp'
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
    async function fetchStudioSettings() {
      try {
        setLoading(true);
        const settingsDoc = doc(db, "settings", "studio");
        const settingsSnapshot = await getDoc(settingsDoc);
        
        if (settingsSnapshot.exists()) {
          const settingsData = settingsSnapshot.data() as Partial<StudioSettings>;
          // Merge diretto dei dati di Firebase con i default
          setStudioSettings({
            ...defaultSettings,
            ...settingsData
          });
        }
      } catch (err) {
        
        setError("Impossibile caricare le impostazioni dello studio");
      } finally {
        setLoading(false);
      }
    }
    
    fetchStudioSettings();
  }, []);

  return (
    <StudioContext.Provider value={{ studioSettings, loading, error }}>
      {children}
    </StudioContext.Provider>
  );
}