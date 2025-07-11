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
  socialLinks: {
    facebook?: string;
    instagram?: string;
    twitter?: string;
  };
  about: string;
  logo?: string;
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
  name: 'Memorie Sospese',
  slogan: 'Catturiamo momenti, creiamo ricordi',
  address: '',
  phone: '',
  email: '',
  websiteUrl: '',
  socialLinks: {
    facebook: '',
    instagram: '',
    twitter: ''
  },
  about: '',
  logo: '',
  // Valori predefiniti per i testi della Hero Section
  heroTitle: 'I momenti più belli del loro giorno speciale',
  heroSubtitle: 'Rivivi le emozioni condivise al matrimonio attraverso immagini professionali, facilmente accessibili con la password ricevuta dagli sposi.',
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
          setStudioSettings(prev => ({
            ...defaultSettings,
            ...prev,
            ...Object.entries(settingsData).reduce((acc, [key, value]) => ({
              ...acc,
              [key]: value ?? defaultSettings[key as keyof StudioSettings]
            }), {})
          }));
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