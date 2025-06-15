import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface WeddingAnimationProps {
  onAnimationComplete: () => void;
  skip?: boolean;
}

// Funzione di utilità per forzare l'animazione a comparire (per debug)


export default function WeddingAnimation({ onAnimationComplete, skip = false }: WeddingAnimationProps) {
  
  const [showAnimation, setShowAnimation] = useState(true);
  
  // Se skip è true, salta l'animazione immediatamente
  useEffect(() => {
    if (skip) {
      setShowAnimation(false);
      onAnimationComplete();
    }
  }, [skip, onAnimationComplete]);

  const handleAnimationComplete = () => {
    // Alla fine dell'animazione, nascondi il componente e notifica il parent
    setTimeout(() => {
      setShowAnimation(false);
      onAnimationComplete();
    }, 300);
  };

  return (
    <AnimatePresence>
      {showAnimation && (
        <motion.div 
          className="fixed inset-0 bg-white flex flex-col items-center justify-center z-50"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="w-full max-w-md px-6">
            <motion.div
              className="w-full h-full"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
            >
              <WeddingCoupleSVG />
            </motion.div>
            
            <motion.div
              className="w-full text-center mt-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 1.5 }}
            >
              <h2 className="text-2xl font-playfair text-blue-gray mb-2">Benvenuto nella Galleria</h2>
              <p className="text-sage">Momenti speciali da custodire per sempre</p>
            </motion.div>
            
            <motion.div
              className="mt-8 w-full flex justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 2 }}
            >
              <button 
                onClick={handleAnimationComplete}
                className="px-6 py-2 bg-sage text-white rounded-md hover:bg-sage-600 transition-colors"
              >
                Visualizza le foto
              </button>
            </motion.div>
          </div>
          
          {/* Animazione coriandoli/riso che cade */}
          <RiceConfetti />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const RiceConfetti = () => {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Generiamo 30 elementi di riso/coriandoli */}
      {[...Array(30)].map((_, i) => {
        // Valori casuali per l'animazione
        const size = Math.random() * 8 + 4; // dimensione tra 4-12px
        const xPos = Math.random() * 100; // posizione x iniziale (%)
        const delay = Math.random() * 1.5; // ritardo tra 0-1.5s
        const duration = Math.random() * 3 + 3; // durata tra 3-6s
        const rotation = Math.random() * 360; // rotazione casuale

        return (
          <motion.div
            key={i}
            className="absolute rounded-full bg-white shadow-md"
            style={{
              width: `${size}px`,
              height: `${size}px`,
              left: `${xPos}%`,
              top: '-5%',
              rotate: `${rotation}deg`
            }}
            initial={{ y: '-10%', opacity: 0 }}
            animate={{ 
              y: '105%', 
              opacity: [0, 1, 0.8, 0],
              x: Math.random() > 0.5 ? '10%' : '-10%'
            }}
            transition={{ 
              duration: duration,
              delay: delay + 0.8, // inizia l'animazione dopo l'apparizione degli sposi
              ease: "easeIn",
              repeat: 0
            }}
          />
        );
      })}
    </div>
  );
};

// SVG dell'illustrazione degli sposi che si baciano
const WeddingCoupleSVG = () => (
  <svg viewBox="0 0 400 450" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto">
    {/* Sfondo decorativo */}
    <path d="M200 440c110 0 180-80 180-170s-60-170-180-170S20 180 20 270s90 170 180 170z" 
          fill="#f3f4f6" fillOpacity="0.3" />
    
    {/* Sposo - corpo */}
    <motion.g
      initial={{ x: -50, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 1, delay: 0.3 }}
    >
      <path d="M130 290c0 0 10-55 10-90s-5-90 15-90c15 0 25 20 25 50s-5 100-5 130" 
            fill="#424b5a" />
      <path d="M155 290v-60c0-30-5-60 10-60s20 5 20 30v90" 
            fill="#424b5a" />
      <rect x="125" y="290" width="70" height="100" rx="10" fill="#424b5a" />
    </motion.g>
    
    {/* Sposa - abito */}
    <motion.g
      initial={{ x: 50, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 1, delay: 0.3 }}
    >
      <path d="M210 290c0 0-10-55-10-90s5-80-15-80c-15 0-25 20-25 50s5 100 5 120" 
            fill="#f7f7f7" />
      <path d="M195 290v-60c0-30 5-60-10-60s-20 5-20 30v90" 
            fill="#f7f7f7" />
      <path d="M205 290h-80c0 0 10 100 40 100s40-80 40-100z" fill="#f7f7f7" />
    </motion.g>
    
    {/* Volti che si avvicinano con animazione */}
    <motion.g
      initial={{ x: -30, y: 10, rotate: -5 }}
      animate={{ x: -10, y: 0, rotate: 0 }}
      transition={{ duration: 1.2, delay: 0.6 }}
    >
      {/* Volto sposo */}
      <circle cx="145" cy="160" r="30" fill="#e6d0b5" />
      <path d="M135 155a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" fill="#333" />
      <path d="M152 155a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" fill="#333" />
      <path d="M140 170c5 2 10 2 15 0" fill="none" stroke="#333" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M130 145c0 0 5-15 20-10" fill="none" stroke="#333" strokeWidth="1" />
    </motion.g>
    
    <motion.g
      initial={{ x: 30, y: 10, rotate: 5 }}
      animate={{ x: 10, y: 0, rotate: 0 }}
      transition={{ duration: 1.2, delay: 0.6 }}
    >
      {/* Volto sposa */}
      <circle cx="195" cy="160" r="30" fill="#e6d0b5" />
      <path d="M185 155a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" fill="#333" />
      <path d="M202 155a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" fill="#333" />
      <path d="M190 170c5 2 10 2 15 0" fill="none" stroke="#333" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M190 140c0 0 15-10 25 0" fill="none" stroke="#333" strokeWidth="1" />
      
      {/* Velo della sposa */}
      <path d="M215 160c10-20 5-40-25-50" fill="none" stroke="#f7f7f7" strokeWidth="5" />
      <path d="M215 165c15-15 20-40 0-60" fill="none" stroke="#f7f7f7" strokeWidth="5" />
    </motion.g>
    
    {/* Cuore sopra le teste - appare con un'animazione di scala */}
    <motion.path
      d="M170 110c5-10 15-10 20 0c5-10 15-10 20 0c5 10-10 15-20 25c-10-10-25-15-20-25z"
      fill="#e994a0"
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.8, delay: 1.5 }}
    />
    
    {/* Fiori decorativi */}
    <motion.g
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.8, delay: 1.8 }}
    >
      <circle cx="110" cy="200" r="8" fill="#d1a7c7" />
      <circle cx="112" cy="192" r="8" fill="#d1a7c7" />
      <circle cx="118" cy="198" r="8" fill="#d1a7c7" />
      <circle cx="105" cy="195" r="8" fill="#d1a7c7" />
      <circle cx="113" cy="205" r="8" fill="#d1a7c7" />
      <circle cx="112" cy="197" r="4" fill="#f3e3b5" />
    </motion.g>
    
    <motion.g
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.8, delay: 2 }}
    >
      <circle cx="230" cy="220" r="8" fill="#d1a7c7" />
      <circle cx="232" cy="212" r="8" fill="#d1a7c7" />
      <circle cx="238" cy="218" r="8" fill="#d1a7c7" />
      <circle cx="225" cy="215" r="8" fill="#d1a7c7" />
      <circle cx="233" cy="225" r="8" fill="#d1a7c7" />
      <circle cx="232" cy="217" r="4" fill="#f3e3b5" />
    </motion.g>
  </svg>
);