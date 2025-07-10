import { useState, useEffect } from "react";
import { collection, getDocs } from "firebase/firestore";
import { useLocation } from "wouter";
import { db } from "../lib/firebase";
import { createUrl, createAbsoluteUrl } from "../lib/basePath";
import { formatDateString } from "../lib/dateFormatter";
import { Input } from "./ui/input";
import { Card, CardContent } from "./ui/card";
import { Search } from "lucide-react";

interface GallerySearchResult {
  id: string;
  name: string;
  code: string;
  date: string;
}

export default function GallerySearch() {
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<GallerySearchResult[]>([]);
  const [allGalleries, setAllGalleries] = useState<GallerySearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [, navigate] = useLocation();

  // Funzione che carica tutte le gallerie dal database
  const loadAllGalleries = async () => {
    setIsLoading(true);
    try {
      const galleriesCollection = collection(db, "galleries");
      const snapshot = await getDocs(galleriesCollection);
      
      // Trasformiamo i dati in un formato più semplice da utilizzare
      const galleries: GallerySearchResult[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        // Filtra solo le gallerie attive per gli utenti pubblici
        const isActive = data.active !== undefined ? data.active : true; // Default true per retrocompatibilità
        if (isActive) {
          galleries.push({
            id: doc.id,
            name: data.name || "",
            code: data.code || "",
            date: data.date || "",
          });
        }
      });
      
      // Salviamo tutte le gallerie nello state
      setAllGalleries(galleries);
      
      
    } catch (error) {
      
    } finally {
      setIsLoading(false);
    }
  };

  // Carica tutte le gallerie quando il componente viene montato
  useEffect(() => {
    loadAllGalleries();
  }, []);

  // Filtriamo i risultati in base al termine di ricerca
  useEffect(() => {
    if (searchTerm.length < 2) {
      // Se il termine di ricerca è troppo corto, non mostrare risultati
      setSearchResults([]);
      return;
    }

    // Dividiamo la ricerca in parole
    const searchWords = searchTerm.toLowerCase().split(/\s+/).filter(word => word.length > 0);
    
    // Filtriamo le gallerie che contengono tutte le parole nel nome
    const filteredGalleries = allGalleries.filter(gallery => {
      const galleryName = gallery.name.toLowerCase();
      
      // Verifichiamo che ogni parola sia contenuta nel nome della galleria
      return searchWords.every(word => galleryName.includes(word));
    });
    
    setSearchResults(filteredGalleries.slice(0, 10));
  }, [searchTerm, allGalleries]);

  const handleGallerySelect = (code: string) => {
    
    
    // Utilizziamo il router di wouter per la navigazione
    const galleryPath = `/gallery/${code}`;
    
    
    // Utilizziamo createUrl per costruire il URL corretto con il basePath
    const correctPath = createUrl(galleryPath);
    
    
    // Utilizziamo navigate di wouter con il path corretto
    navigate(correctPath);
  };

  return (
    <div className="w-full">
      <div className="relative">
        <div className="relative">
          <div className="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none">
            <Search className="h-4 w-4 text-gray-500" />
          </div>
          <Input
            type="text"
            placeholder="Cerca per nome degli sposi (es. Maria & Luca)"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full ps-10 px-4 py-2 border border-beige rounded-md focus:ring-sage focus:border-sage"
          />
        </div>
        {isLoading && (
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
            <svg className="animate-spin h-5 w-5 text-blue-gray" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>
        )}
      </div>

      {searchResults.length > 0 && (
        <Card className="mt-2 overflow-hidden">
          <CardContent className="p-0">
            <ul className="divide-y divide-gray-200">
              {searchResults.map((gallery) => (
                <li
                  key={gallery.id}
                  className="p-0 hover:bg-gray-50 cursor-pointer"
                >
                  <a 
                    href={createUrl(`/gallery/${gallery.code}`)}
                    className="block p-3 w-full h-full no-underline"
                    aria-label={`Visualizza la galleria ${gallery.name}`}
                    onClick={(e) => {
                      e.preventDefault();
                      handleGallerySelect(gallery.code);
                    }}
                  >
                    <div className="flex justify-between">
                      <span className="font-medium text-blue-gray">{gallery.name}</span>
                      <span className="text-sm text-gray-500">Data: {formatDateString(gallery.date)}</span>
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {searchTerm.length >= 2 && searchResults.length === 0 && !isLoading && (
        <p className="mt-2 text-sm text-gray-500">
          Nessun risultato trovato. Prova con un altro nome.
        </p>
      )}
    </div>
  );
}