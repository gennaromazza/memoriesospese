import { useState, FormEvent } from "react";
import { useLocation } from 'wouter';
import { collection, query, where, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { trackPasswordRequest } from '@/lib/analytics';
import { useStudio } from '@/context/StudioContext';
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import GallerySearch from "@/components/GallerySearch";
import HeroSlideshow from "@/components/HeroSlideshow";
import { FloralCorner, FloralDivider, BackgroundDecoration } from '@/components/WeddingIllustrations';
import { WeddingImage, DecorativeImage } from '@/components/WeddingImages';

export default function Home() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedGallery, setSelectedGallery] = useState<any>(null);
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { studioSettings } = useStudio();
  
  // Form data state
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    relation: '',
    gallerySearch: ''
  });
  
  // Handle input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    
    // If changing gallery search, search for galleries
    if (name === 'gallerySearch' && value.length >= 3) {
      searchGalleries(value);
    } else if (name === 'gallerySearch' && value.length < 3) {
      setSearchResults([]);
      setSelectedGallery(null);
    }
  };
  
  // Search galleries by name
  const searchGalleries = async (searchTerm: string) => {
    if (searchTerm.length < 3) return;
    
    try {
      const galleryRef = collection(db, 'galleries');
      const q = query(galleryRef, where('active', '==', true));
      const querySnapshot = await getDocs(q);
      
      // Filter galleries based on search term
      const results: any[] = [];
      querySnapshot.forEach(doc => {
        const data = doc.data();
        const galleryName = data.name.toLowerCase();
        const searchTermLower = searchTerm.toLowerCase();
        
        // Check if gallery name contains search term
        if (galleryName.includes(searchTermLower)) {
          results.push({
            id: doc.id,
            ...data
          });
        }
      });
      
      setSearchResults(results);
    } catch (error) {
      console.error('Error searching galleries:', error);
    }
  };
  
  // Handle gallery selection
  const handleGallerySelect = (gallery: any) => {
    setSelectedGallery(gallery);
    setFormData(prev => ({ ...prev, gallerySearch: gallery.name }));
    setSearchResults([]);
  };
  
  // Submit form to request password
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    
    if (!selectedGallery) {
      toast({
        title: 'Errore',
        description: 'Seleziona una galleria valida.',
        variant: 'destructive'
      });
      return;
    }
    
    if (!formData.firstName || !formData.lastName || !formData.email || !formData.relation) {
      toast({
        title: 'Errore',
        description: 'Compila tutti i campi richiesti.',
        variant: 'destructive'
      });
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      // Salva la richiesta in Firestore
      const passwordRequestsRef = collection(db, "passwordRequests");
      await addDoc(passwordRequestsRef, {
        galleryId: selectedGallery.id,
        galleryCode: selectedGallery.code,
        galleryName: selectedGallery.name,
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        relation: formData.relation,
        status: 'completed',
        createdAt: serverTimestamp()
      });
      
      // Track password request in analytics
      trackPasswordRequest(selectedGallery.code);
      
      // Show success message
      toast({
        title: 'Richiesta ricevuta',
        description: 'Password visualizzata. Le tue informazioni sono state salvate.',
      });
      
      // Redirect to password result page
      navigate(`/password-result/${selectedGallery.id}`);
    } catch (error) {
      console.error('Error saving password request:', error);
      toast({
        title: 'Errore',
        description: 'Si è verificato un errore nell\'invio della richiesta. Riprova più tardi.',
        variant: 'destructive'
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <div className="min-h-screen">
      <Navigation />

      {/* Hero Section */}
      <div className="relative bg-light-mint">
        <HeroSlideshow />
        <div className="absolute inset-0 bg-gradient-to-r from-blue-gray/30 to-transparent"></div>
        <div className="relative max-w-7xl mx-auto py-24 px-4 sm:py-32 sm:px-6 lg:px-8">
          <div className="relative z-10 backdrop-blur-sm bg-white/5 p-6 sm:p-8 rounded-lg shadow-lg inline-block">
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl font-playfair animate-slide-up drop-shadow-md">
              I momenti più belli <br />del loro giorno speciale
            </h1>
            <p className="mt-6 text-xl text-white max-w-2xl font-sans animate-slide-up drop-shadow" style={{ animationDelay: "100ms" }}>
              Rivivi le emozioni condivise al matrimonio attraverso immagini professionali, facilmente accessibili con la password ricevuta dagli sposi.
            </p>
            <div className="mt-10 animate-slide-up" style={{ animationDelay: "200ms" }}>
              <a href="#access-gallery" className="px-8 py-3 bg-sage text-white font-medium rounded-md shadow-md hover:bg-dark-sage transition-all hover:shadow-lg inline-block">
                Trova la tua galleria
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Access Gallery Form */}
      <section id="access-gallery" className="py-16 bg-off-white relative">
        {/* Decorazioni a tema matrimonio con le immagini fornite */}
        <div className="absolute left-0 top-0 w-40 h-40 opacity-20 pointer-events-none">
          <WeddingImage type="heart-balloon" className="w-full h-auto" alt="Decorazione palloncino a cuore" />
        </div>
        <div className="absolute right-0 bottom-0 w-40 h-40 opacity-20 pointer-events-none">
          <WeddingImage type="wedding-cake" className="w-full h-auto" alt="Decorazione torta nuziale" />
        </div>
        
        <div className="max-w-md mx-auto animate-fade-in relative z-10">
          <div className="bg-white shadow-lg rounded-lg overflow-hidden border border-sage/10">
            {/* Header decorativo con anelli matrimoniali */}
            <div className="relative h-12 bg-gradient-to-r from-sage/30 via-sage/40 to-sage/30 flex items-center justify-center">
              <div className="absolute -bottom-10 left-1/2 transform -translate-x-1/2 h-20 w-20">
                <DecorativeImage type="standing" className="w-full h-auto" alt="Decorazione sposi" />
              </div>
            </div>
            
            <div className="px-8 pt-12 pb-8">
              <h2 className="text-center text-2xl font-bold text-blue-gray font-playfair mb-3">
                Accedi alle Foto del Matrimonio
              </h2>
              <p className="text-center text-gray-600 mb-8 italic">
                Inserisci il nome degli sposi che hai celebrato
              </p>
              
              <div className="space-y-6">
                <div className="mt-1 bg-off-white p-4 rounded-lg shadow-inner">
                  <GallerySearch />
                </div>
                
                <div className="relative flex items-center py-5">
                  <div className="flex-grow border-t border-beige"></div>
                  <span className="flex-shrink mx-4 text-gray-500 bg-white px-2">oppure</span>
                  <div className="flex-grow border-t border-beige"></div>
                </div>
                
                <div className="text-center">
                  <p className="text-sm text-gray-600 mb-4 font-medium">
                    Gli sposi non ti hanno ancora inviato la password?
                  </p>
                  <a 
                    href="#request-password" 
                    className="inline-block px-6 py-2.5 rounded-md border border-sage text-sage hover:bg-sage hover:text-white transition-all duration-200 shadow-sm hover:shadow font-medium"
                  >
                    Richiedi il tuo accesso
                  </a>
                </div>
              </div>
            </div>
            
            {/* Footer decorativo */}
            <div className="h-2 bg-gradient-to-r from-sage/30 via-sage/40 to-sage/30"></div>
          </div>
        </div>
      </section>

      {/* Request Password Section */}
      <section id="request-password" className="py-16 bg-cream relative overflow-hidden">
        {/* Decorazioni a tema matrimonio */}
        <FloralCorner position="top-left" className="absolute top-0 left-0 w-40 h-40 opacity-20 pointer-events-none" />
        <FloralCorner position="bottom-right" className="absolute bottom-0 right-0 w-40 h-40 opacity-20 pointer-events-none" />
        <BackgroundDecoration className="absolute inset-0 w-full h-full opacity-15 pointer-events-none" />
        
        <div className="max-w-xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="relative">
            <h2 className="text-center text-3xl font-bold text-blue-gray font-playfair mb-2">
              Richiedi il Tuo Invito Digitale
            </h2>
            <p className="text-center text-gray-600 mb-8">
              Gli sposi ti invieranno la password per accedere ai ricordi del loro giorno speciale
            </p>
            
            {/* Elemento decorativo con immagine */}
            <div className="absolute w-full flex justify-center -top-16 opacity-20 pointer-events-none">
              <div className="w-40 h-40">
                <WeddingImage type="flower-bouquet" className="w-full h-auto" alt="Decorazione floreale" />
              </div>
            </div>
          </div>
          
          <div className="bg-white shadow-lg rounded-lg p-8 space-y-6 border border-sage/10">
            <div className="flex items-center justify-center mb-4">
              <div className="h-20 w-20">
                <WeddingImage type="heart-balloon" className="w-full h-auto" alt="Decorazione con palloncino a cuore" />
              </div>
            </div>
            
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 gap-y-6 sm:grid-cols-2 sm:gap-x-8">
                <div className="sm:col-span-2 relative">
                  <label htmlFor="gallerySearch" className="block text-sm font-medium text-blue-gray">
                    Nome Galleria/Sposi
                  </label>
                  <div className="mt-1">
                    <input
                      type="text"
                      id="gallerySearch"
                      name="gallerySearch"
                      placeholder="Es. Maria & Luca"
                      value={formData.gallerySearch}
                      onChange={handleInputChange}
                      className="w-full border-beige rounded-md py-3 px-4 focus:ring-sage focus:border-sage"
                      autoComplete="off"
                    />
                    <p className="mt-1 text-xs text-gray-500">Inserisci il nome degli sposi o della galleria</p>
                  </div>
                  
                  {/* Search results dropdown */}
                  {searchResults.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white shadow-lg rounded-md border border-gray-200 max-h-60 overflow-auto">
                      <ul className="py-1">
                        {searchResults.map(gallery => (
                          <li 
                            key={gallery.id}
                            className="px-4 py-2 hover:bg-gray-100 cursor-pointer flex justify-between"
                            onClick={() => handleGallerySelect(gallery)}
                          >
                            <span className="font-medium">{gallery.name}</span>
                            <span className="text-sm text-gray-500">Data: {gallery.date}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <div>
                  <label htmlFor="firstName" className="block text-sm font-medium text-blue-gray">
                    Nome
                  </label>
                  <div className="mt-1">
                    <input
                      type="text"
                      id="firstName"
                      name="firstName"
                      value={formData.firstName}
                      onChange={handleInputChange}
                      className="w-full border-beige rounded-md py-3 px-4 focus:ring-sage focus:border-sage"
                    />
                  </div>
                </div>
                
                <div>
                  <label htmlFor="lastName" className="block text-sm font-medium text-blue-gray">
                    Cognome
                  </label>
                  <div className="mt-1">
                    <input
                      type="text"
                      id="lastName"
                      name="lastName"
                      value={formData.lastName}
                      onChange={handleInputChange}
                      className="w-full border-beige rounded-md py-3 px-4 focus:ring-sage focus:border-sage"
                    />
                  </div>
                </div>
                
                <div className="sm:col-span-2">
                  <label htmlFor="email" className="block text-sm font-medium text-blue-gray">
                    Email
                  </label>
                  <div className="mt-1">
                    <input
                      type="email"
                      id="email"
                      name="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      className="w-full border-beige rounded-md py-3 px-4 focus:ring-sage focus:border-sage"
                    />
                  </div>
                </div>
                
                <div className="sm:col-span-2">
                  <label htmlFor="relation" className="block text-sm font-medium text-blue-gray">
                    Relazione con gli sposi
                  </label>
                  <div className="mt-1">
                    <select
                      id="relation"
                      name="relation"
                      value={formData.relation}
                      onChange={handleInputChange}
                      className="w-full border-beige rounded-md py-3 px-4 focus:ring-sage focus:border-sage"
                    >
                      <option value="">Seleziona...</option>
                      <option value="family">Famiglia</option>
                      <option value="friend">Amico/a</option>
                      <option value="colleague">Collega</option>
                      <option value="other">Altro</option>
                    </select>
                  </div>
                </div>
                
                <div className="sm:col-span-2">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full inline-flex items-center justify-center px-6 py-3 border border-transparent rounded-md shadow-sm text-base font-medium text-white bg-blue-gray hover:bg-dark-sage focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sage btn-primary disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Invio in corso...
                      </>
                    ) : (
                      'Richiedi Password'
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </section>

      {/* Separatore decorativo */}
      <div className="w-full flex justify-center py-2 bg-off-white">
        <FloralDivider className="w-full h-12" />
      </div>

      {/* About Section */}
      <section id="about" className="py-16 bg-white relative overflow-hidden">
        {/* Illustrazione degli sposi */}
        <div className="absolute left-1/2 top-0 transform -translate-x-1/2 w-64 h-64 opacity-15 pointer-events-none">
          <WeddingImage type="standing" className="w-full h-auto" alt="Illustrazione degli sposi" />
        </div>
        
        {/* Decorazioni floreali agli angoli */}
        <FloralCorner position="top-left" className="absolute top-0 left-0 w-32 h-32 opacity-20 pointer-events-none" />
        <FloralCorner position="bottom-right" className="absolute bottom-0 right-0 w-32 h-32 opacity-20 pointer-events-none" />
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="lg:text-center">
            <h2 className="text-base text-terracotta font-semibold tracking-wide uppercase">
              La Fotografia Che Crea Ricordi
            </h2>
            <div className="relative">
              <div className="absolute left-1/2 -top-10 transform -translate-x-1/2 w-40 h-10 flex justify-center opacity-30">
                <DecorativeImage type="flower-bouquet" className="w-full h-auto transform rotate-180" alt="Decorazione floreale" />
              </div>
              <p className="mt-2 text-3xl leading-8 font-bold tracking-tight text-blue-gray sm:text-4xl font-playfair">
                {studioSettings.name}
              </p>
            </div>
            <p className="mt-2 text-xl text-terracotta lg:mx-auto font-medium">
              {studioSettings.slogan}
            </p>
            <p className="mt-6 max-w-3xl text-lg text-gray-600 lg:mx-auto">
              {studioSettings.about}
            </p>
          </div>

          {/* Informazioni di contatto */}
          <div className="mt-16 bg-off-white rounded-lg p-8 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <h3 className="text-lg font-medium text-terracotta mb-4">Contattaci</h3>
                
                <div className="space-y-3">
                  {studioSettings.address && (
                    <div className="flex items-start">
                      <div className="h-7 w-7 mr-2">
                        <DecorativeImage type="wedding-cake" className="w-full h-auto opacity-80" alt="Icona indirizzo" />
                      </div>
                      <span className="text-gray-600">{studioSettings.address}</span>
                    </div>
                  )}
                  
                  {studioSettings.phone && (
                    <div className="flex items-start">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-sage mr-3 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                      <span className="text-gray-600">{studioSettings.phone}</span>
                    </div>
                  )}
                  
                  {studioSettings.email && (
                    <div className="flex items-start">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-sage mr-3 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      <span className="text-gray-600">{studioSettings.email}</span>
                    </div>
                  )}
                </div>
              </div>
              
              <div>
                <h3 className="text-lg font-medium text-terracotta mb-4">Social Media</h3>
                <div className="flex space-x-4">
                  {studioSettings.socialLinks.facebook && (
                    <a href={studioSettings.socialLinks.facebook} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800">
                      <svg className="h-8 w-8" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path fillRule="evenodd" d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z" clipRule="evenodd" />
                      </svg>
                    </a>
                  )}
                  
                  {studioSettings.socialLinks.instagram && (
                    <a href={studioSettings.socialLinks.instagram} target="_blank" rel="noopener noreferrer" className="text-pink-600 hover:text-pink-800">
                      <svg className="h-8 w-8" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path fillRule="evenodd" d="M12.315 2c2.43 0 2.784.013 3.808.06 1.064.049 1.791.218 2.427.465a4.902 4.902 0 011.772 1.153 4.902 4.902 0 011.153 1.772c.247.636.416 1.363.465 2.427.048 1.067.06 1.407.06 4.123v.08c0 2.643-.012 2.987-.06 4.043-.049 1.064-.218 1.791-.465 2.427a4.902 4.902 0 01-1.153 1.772 4.902 4.902 0 01-1.772 1.153c-.636.247-1.363.416-2.427.465-1.067.048-1.407.06-4.123.06h-.08c-2.643 0-2.987-.012-4.043-.06-1.064-.049-1.791-.218-2.427-.465a4.902 4.902 0 01-1.772-1.153 4.902 4.902 0 01-1.153-1.772c-.247-.636-.416-1.363-.465-2.427-.047-1.024-.06-1.379-.06-3.808v-.63c0-2.43.013-2.784.06-3.808.049-1.064.218-1.791.465-2.427a4.902 4.902 0 011.153-1.772A4.902 4.902 0 015.45 2.525c.636-.247 1.363-.416 2.427-.465C8.901 2.013 9.256 2 11.685 2h.63zm-.081 1.802h-.468c-2.456 0-2.784.011-3.807.058-.975.045-1.504.207-1.857.344-.467.182-.8.398-1.15.748-.35.35-.566.683-.748 1.15-.137.353-.3.882-.344 1.857-.047 1.023-.058 1.351-.058 3.807v.468c0 2.456.011 2.784.058 3.807.045.975.207 1.504.344 1.857.182.466.399.8.748 1.15.35.35.683.566 1.15.748.353.137.882.3 1.857.344 1.054.048 1.37.058 4.041.058h.08c2.597 0 2.917-.01 3.96-.058.976-.045 1.505-.207 1.858-.344.466-.182.8-.398 1.15-.748.35-.35.566-.683.748-1.15.137-.353.3-.882.344-1.857.048-1.055.058-1.37.058-4.041v-.08c0-2.597-.01-2.917-.058-3.96-.045-.976-.207-1.505-.344-1.858a3.097 3.097 0 00-.748-1.15 3.098 3.098 0 00-1.15-.748c-.353-.137-.882-.3-1.857-.344-1.023-.047-1.351-.058-3.807-.058zM12 6.865a5.135 5.135 0 110 10.27 5.135 5.135 0 010-10.27zm0 1.802a3.333 3.333 0 100 6.666 3.333 3.333 0 000-6.666zm5.338-3.205a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4z" clipRule="evenodd" />
                      </svg>
                    </a>
                  )}
                  
                  {studioSettings.socialLinks.twitter && (
                    <a href={studioSettings.socialLinks.twitter} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-600">
                      <svg className="h-8 w-8" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84" />
                      </svg>
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
          
          <div className="mt-16">
            <div className="space-y-10 md:space-y-0 md:grid md:grid-cols-3 md:gap-x-8 md:gap-y-10">
              {/* Feature 1 */}
              <div className="relative group">
                <div className="absolute h-14 w-14">
                  <DecorativeImage type="heart-balloon" className="w-full h-auto" alt="Icona palloncino a cuore" />
                </div>
                <div className="ml-16">
                  <h3 className="text-lg leading-6 font-medium text-blue-gray font-playfair">
                    Accesso riservato agli invitati
                  </h3>
                  <p className="mt-2 text-base text-gray-500">
                    Solo gli ospiti del matrimonio hanno accesso alle gallerie, mantenendo i ricordi privati e speciali.
                  </p>
                </div>

              </div>

              {/* Feature 2 */}
              <div className="relative group">
                <div className="absolute h-14 w-14">
                  <DecorativeImage type="wedding-cake" className="w-full h-auto" alt="Icona torta nuziale" />
                </div>
                <div className="ml-16">
                  <h3 className="text-lg leading-6 font-medium text-blue-gray font-playfair">
                    Ricordi in alta qualità
                  </h3>
                  <p className="mt-2 text-base text-gray-500">
                    Rivivi ogni emozione del matrimonio con immagini professionali che catturano l'essenza di ogni momento.
                  </p>
                </div>

              </div>

              {/* Feature 3 */}
              <div className="relative group">
                <div className="absolute h-14 w-14">
                  <DecorativeImage type="standing" className="w-full h-auto" alt="Icona sposi" />
                </div>
                <div className="ml-16">
                  <h3 className="text-lg leading-6 font-medium text-blue-gray font-playfair">
                    Condivisione tra invitati
                  </h3>
                  <p className="mt-2 text-base text-gray-500">
                    Condividi facilmente l'indirizzo della galleria con altri ospiti del matrimonio o richiedi la password agli sposi.
                  </p>
                </div>

              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Separatore decorativo */}
      <div className="w-full flex justify-center py-2 bg-white">
        <FloralDivider className="w-full h-12" />
      </div>

      {/* Contact Section */}
      <section id="contact" className="bg-mint py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-lg mx-auto md:max-w-none md:grid md:grid-cols-2 md:gap-8">
            <div>
              <h2 className="text-2xl font-bold text-blue-gray font-playfair sm:text-3xl">
                Contattaci
              </h2>
              <div className="mt-3">
                <p className="text-lg text-gray-500">
                  Hai domande o desideri maggiori informazioni sui nostri servizi? Contattaci, siamo qui per aiutarti.
                </p>
              </div>
              <div className="mt-9">
                {studioSettings.phone && (
                  <div className="flex">
                    <div className="flex-shrink-0 h-7 w-7">
                      <DecorativeImage type="heart-balloon" className="w-full h-auto opacity-80" alt="Icona contatto" />
                    </div>
                    <div className="ml-3 text-base text-gray-500">
                      <p>{studioSettings.phone}</p>
                    </div>
                  </div>
                )}
                
                {studioSettings.email && (
                  <div className="mt-6 flex">
                    <div className="flex-shrink-0 h-7 w-7">
                      <DecorativeImage type="standing" className="w-full h-auto opacity-80" alt="Icona contatto" />
                    </div>
                    <div className="ml-3 text-base text-gray-500">
                      <p>{studioSettings.email}</p>
                    </div>
                  </div>
                )}
                
                {studioSettings.address && (
                  <div className="mt-6 flex">
                    <div className="flex-shrink-0">
                      <svg className="h-6 w-6 text-sage" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                    <div className="ml-3 text-base text-gray-500">
                      <p>{studioSettings.address}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            <div className="mt-12 sm:mt-16 md:mt-0">
              <h2 className="text-2xl font-bold text-blue-gray font-playfair sm:text-3xl">
                Contattaci su WhatsApp
              </h2>
              
              <div className="mt-9 bg-white p-6 rounded-lg shadow-sm border border-sage/20">
                <div className="flex items-center mb-6">
                  <div className="flex-shrink-0 h-12 w-12">
                    <DecorativeImage type="heart-balloon" className="w-full h-auto" alt="WhatsApp" />
                  </div>
                  <div className="ml-4">
                    <h3 className="text-lg font-medium text-terracotta">Assistenza rapida e personalizzata</h3>
                    <p className="text-gray-500">Siamo disponibili per ogni tua domanda</p>
                  </div>
                </div>
                
                <p className="text-gray-600 mb-6">
                  Per ricevere informazioni sui nostri servizi fotografici per matrimoni o per qualsiasi altra domanda, contattaci direttamente su WhatsApp. Riceverai una risposta rapida e personalizzata per le tue esigenze.
                </p>
                
                {studioSettings.phone && (
                  <a 
                    href={`https://wa.me/${studioSettings.phone.replace(/\s+/g, '').replace(/^\+/, '')}`}
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center w-full px-6 py-3 border border-transparent rounded-md shadow-sm text-base font-medium text-white bg-blue-gray hover:bg-dark-sage focus:outline-none btn-primary"
                  >
                    <span className="mr-2">Scrivici su WhatsApp</span>
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0
                      11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
