import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Button } from './ui/button';
import { Calendar } from 'lucide-react';
import { createUrl } from '@/lib/basePath';
import { useLocation } from 'wouter';

interface CampaignSlide {
  id: string;
  code: string;
  nome: string;
  url: string;
  dataInizio: Date;
  dataFine: Date;
}

export default function HeroSlideshow() {
  const [, navigate] = useLocation();
  const [campaigns, setCampaigns] = useState<CampaignSlide[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchActiveCampaigns() {
      try {
        // Carica campagne attive con immagine slider
        const campaignsRef = collection(db, 'booking_campaigns');
        const campaignsQuery = query(
          campaignsRef,
          where('attiva', '==', true)
        );
        const querySnapshot = await getDocs(campaignsQuery);

        if (!querySnapshot.empty) {
          const now = new Date();
          const activeCampaigns: CampaignSlide[] = [];

          querySnapshot.forEach((doc) => {
            const data = doc.data();
            
            // Skip se non ha immagine slider
            if (!data.immagineSlider) return;

            const dataInizio = data.dataInizio?.toDate ? data.dataInizio.toDate() : new Date(data.dataInizio);
            const dataFine = data.dataFine?.toDate ? data.dataFine.toDate() : new Date(data.dataFine);
            const giorniAnticipo = data.giorniAnticipoSlider || 0;

            // Calcola data inizio slider (con anticipo)
            const dataInizioSlider = new Date(dataInizio);
            dataInizioSlider.setDate(dataInizioSlider.getDate() - giorniAnticipo);

            // Mostra slider se oggi è >= dataInizioSlider e <= dataFine
            if (now >= dataInizioSlider && now <= dataFine) {
              activeCampaigns.push({
                id: doc.id,
                code: data.code,
                nome: data.nome,
                url: data.immagineSlider,
                dataInizio,
                dataFine,
              });
            }
          });

          setCampaigns(activeCampaigns);
        }

        setLoading(false);
      } catch (error) {
        console.error('Errore caricamento campagne slider:', error);
        setLoading(false);
      }
    }

    fetchActiveCampaigns();
  }, []);

  useEffect(() => {
    if (campaigns.length <= 1) return;

    const intervalId = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % campaigns.length);
    }, 6000); // Cambia immagine ogni 6 secondi

    return () => clearInterval(intervalId);
  }, [campaigns.length]);

  if (loading) {
    return null; // Non mostrare nulla durante il caricamento
  }

  if (campaigns.length === 0) {
    return null; // Non mostrare nulla se non ci sono campagne attive
  }

  const currentCampaign = campaigns[currentIndex];

  return (
    <div className="absolute inset-0 overflow-hidden">
      {campaigns.map((campaign, index) => (
        <div
          key={campaign.id}
          className={`absolute inset-0 transition-opacity duration-1000 ${
            index === currentIndex ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {/* Immagine di sfondo */}
          <img
            src={campaign.url}
            alt={campaign.nome}
            className="object-cover w-full h-full"
          />
          
          {/* Overlay scuro */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/60 to-black/40" />
          
          {/* Contenuto overlay (visibile solo per slide corrente) */}
          {index === currentIndex && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white p-8 animate-in fade-in duration-700">
              <div className="max-w-2xl text-center space-y-6">
                <h2 className="text-4xl md:text-6xl font-bold font-playfair drop-shadow-lg">
                  {campaign.nome}
                </h2>
                <Button
                  size="lg"
                  className="bg-white text-gray-900 hover:bg-gray-100 shadow-xl text-lg px-8 py-6"
                  onClick={() => navigate(createUrl(`/prenota/${campaign.code}`))}
                >
                  <Calendar className="h-5 w-5 mr-2" />
                  Prenota Ora
                </Button>
              </div>
            </div>
          )}
        </div>
      ))}
      
      {/* Indicatori (dots) */}
      {campaigns.length > 1 && (
        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 flex gap-2 z-10">
          {campaigns.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentIndex(index)}
              className={`w-3 h-3 rounded-full transition-all ${
                index === currentIndex
                  ? 'bg-white w-8'
                  : 'bg-white/50 hover:bg-white/75'
              }`}
              aria-label={`Vai alla campagna ${index + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}