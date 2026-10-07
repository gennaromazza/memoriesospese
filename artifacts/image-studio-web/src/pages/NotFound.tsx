import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { createUrl } from "@/lib/basePath";
import { Button } from "@/components/ui/button";
import { FloralCorner, FloralDivider } from '@/components/WeddingIllustrations';
import { WeddingImage } from '@/components/WeddingImages';
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";

import { useLocation } from "wouter";
export default function NotFound() {
  const [, navigate] = useLocation();

  // Funzione per tornare alla home page
  const handleGoHome = () => {
    navigate(createUrl("/"));
  };
  
  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <Navigation />
      
      <div className="flex-grow flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 relative">
        <FloralCorner className="w-32 h-32 opacity-40 absolute top-0 left-0" position="top-left" />
        <FloralCorner className="w-32 h-32 opacity-40 absolute bottom-0 right-0" position="bottom-right" />
        
        <Card className="w-full max-w-lg p-6 relative">
          <CardContent className="p-6 text-center">
            <div className="mx-auto w-32 h-32 mb-4">
              <WeddingImage type="heart-balloon" className="w-full h-auto mx-auto opacity-60" />
            </div>
            
            <h1 className="text-3xl font-playfair text-blue-gray mb-2">404 Pagina non trovata</h1>
            <FloralDivider className="w-32 h-8 mx-auto my-4" />
            
            <p className="mb-6 text-gray-600">
              La pagina che stai cercando non esiste o è stata spostata.
            </p>
            
            <Button 
              onClick={handleGoHome}
              className="bg-sage hover:bg-sage-600 text-white"
            >
              Torna alla home
            </Button>
          </CardContent>
        </Card>
      </div>
      
      <Footer />
    </div>
  );
}
