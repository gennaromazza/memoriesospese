import React from 'react';

export const CoupleIllustration: React.FC<{ className?: string }> = ({ className = 'w-full h-full' }) => {
  return (
    <svg viewBox="0 0 400 400" className={className} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="blushGradient" cx="0.5" cy="0.5" r="0.5" fx="0.5" fy="0.5">
          <stop offset="0%" stopColor="#f8a9a3" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#f8a9a3" stopOpacity="0" />
        </radialGradient>
      </defs>
      
      {/* Sfondo con fiori e foglie */}
      <g className="background">
        {/* Foglie e fiori a sinistra */}
        <path d="M70,290 C60,270 50,260 30,250 C50,250 70,260 80,280 Z" fill="#D2E2D1" />
        <path d="M60,300 C50,280 30,270 10,270 C30,280 50,290 70,310 Z" fill="#E2D2C1" />
        <path d="M40,320 C30,300 10,290 0,300 C10,310 30,320 50,330 Z" fill="#D2E2D1" />
        <circle cx="30" cy="270" r="8" fill="#E9BEB6" />
        <circle cx="15" cy="300" r="10" fill="#E9BEB6" />
        
        {/* Foglie e fiori a destra */}
        <path d="M330,290 C340,270 350,260 370,250 C350,250 330,260 320,280 Z" fill="#D2E2D1" />
        <path d="M340,300 C350,280 370,270 390,270 C370,280 350,290 330,310 Z" fill="#E2D2C1" />
        <path d="M360,320 C370,300 390,290 400,300 C390,310 370,320 350,330 Z" fill="#D2E2D1" />
        <circle cx="370" cy="270" r="8" fill="#E9BEB6" />
        <circle cx="385" cy="300" r="10" fill="#E9BEB6" />
      </g>
      
      {/* Sposo */}
      <g className="groom">
        {/* Corpo sposo */}
        <rect x="140" y="180" width="50" height="110" rx="25" fill="#4A4A4A" />
        
        {/* Camicia sposo */}
        <rect x="150" y="180" width="30" height="60" rx="15" fill="white" />
        <circle cx="165" cy="215" r="3" fill="#4A4A4A" />
        <circle cx="165" cy="200" r="3" fill="#4A4A4A" />
        <circle cx="165" cy="230" r="3" fill="#4A4A4A" />
        
        {/* Papillon */}
        <path d="M155,180 L175,180 L165,190 Z" fill="#4A4A4A" />
        <circle cx="165" cy="180" r="5" fill="#4A4A4A" />
        
        {/* Testa sposo */}
        <circle cx="165" cy="150" r="30" fill="#FBE8DB" />
        
        {/* Capelli sposo */}
        <path d="M145,140 Q150,120 165,125 Q180,120 185,140 L185,150 Q165,160 145,150 Z" fill="#996633" />
        
        {/* Occhi sposo (chiusi, sorridenti) */}
        <path d="M155,145 Q160,140 165,145" stroke="#4A4A4A" strokeWidth="1.5" fill="none" />
        <path d="M175,145 Q170,140 165,145" stroke="#4A4A4A" strokeWidth="1.5" fill="none" />
        
        {/* Sorriso sposo */}
        <path d="M155,160 Q165,170 175,160" stroke="#4A4A4A" strokeWidth="1.5" fill="none" />
        
        {/* Guance sposo */}
        <circle cx="150" cy="155" r="7" fill="url(#blushGradient)" />
        <circle cx="180" cy="155" r="7" fill="url(#blushGradient)" />
      </g>
      
      {/* Sposa */}
      <g className="bride">
        {/* Abito sposa */}
        <path d="M235,190 Q215,250 215,290 L285,290 Q285,250 265,190 Q250,180 235,190 Z" fill="white" stroke="#F5F5F5" strokeWidth="1" />
        
        {/* Testa sposa */}
        <circle cx="250" cy="150" r="30" fill="#FBE8DB" />
        
        {/* Capelli sposa */}
        <path d="M225,150 Q225,110 250,110 Q275,110 275,150 Q280,180 250,180 Q220,180 225,150 Z" fill="#A67C52" />
        
        {/* Fiori nei capelli */}
        <circle cx="270" cy="120" r="8" fill="#E9BEB6" />
        <circle cx="265" cy="115" r="6" fill="#F2DAD3" />
        <circle cx="275" cy="125" r="5" fill="#F2DAD3" />
        <path d="M255,115 L260,110 M255,112 L263,113" stroke="#D2E2D1" strokeWidth="1" />
        <path d="M280,130 L285,135 M282,127 L287,130" stroke="#D2E2D1" strokeWidth="1" />
        
        {/* Occhi sposa (chiusi, sorridenti) */}
        <path d="M240,145 Q245,140 250,145" stroke="#4A4A4A" strokeWidth="1.5" fill="none" />
        <path d="M260,145 Q255,140 250,145" stroke="#4A4A4A" strokeWidth="1.5" fill="none" />
        
        {/* Sorriso sposa */}
        <path d="M240,160 Q250,170 260,160" stroke="#4A4A4A" strokeWidth="1.5" fill="none" />
        
        {/* Guance sposa */}
        <circle cx="235" cy="155" r="7" fill="url(#blushGradient)" />
        <circle cx="265" cy="155" r="7" fill="url(#blushGradient)" />
        
        {/* Bouquet */}
        <ellipse cx="215" cy="210" rx="15" ry="20" fill="#D2E2D1" />
        <circle cx="210" cy="205" r="8" fill="#E9BEB6" />
        <circle cx="220" cy="200" r="7" fill="#E9BEB6" />
        <circle cx="215" cy="215" r="9" fill="#E9BEB6" />
        <path d="M215,230 L215,210" stroke="#4A4A4A" strokeWidth="1" />
      </g>
      
      {/* Decorazioni */}
      <g className="decorations">
        <circle cx="100" cy="100" r="3" fill="#E9BEB6" opacity="0.6" />
        <circle cx="150" cy="80" r="2" fill="#E9BEB6" opacity="0.6" />
        <circle cx="300" cy="100" r="3" fill="#E9BEB6" opacity="0.6" />
        <circle cx="250" cy="80" r="2" fill="#E9BEB6" opacity="0.6" />
        <circle cx="120" cy="200" r="4" fill="#E9BEB6" opacity="0.4" />
        <circle cx="280" cy="200" r="4" fill="#E9BEB6" opacity="0.4" />
        <circle cx="200" cy="120" r="3" fill="#E9BEB6" opacity="0.5" />
        
        {/* Piccole foglie */}
        <path d="M100,150 C105,145 110,145 115,150" stroke="#D2E2D1" strokeWidth="1" fill="none" />
        <path d="M300,150 C295,145 290,145 285,150" stroke="#D2E2D1" strokeWidth="1" fill="none" />
        <path d="M200,90 C205,85 210,85 215,90" stroke="#D2E2D1" strokeWidth="1" fill="none" />
      </g>
      
      {/* Mani che si tengono */}
      <path d="M185,220 Q200,215 215,220" stroke="#FBE8DB" strokeWidth="8" fill="none" strokeLinecap="round" />
      
      {/* Piccolo cuore sopra */}
      <path d="M200,100 L205,95 Q215,85 205,85 Q195,85 195,95 L200,100 Z" fill="#E9BEB6" opacity="0.7" />
    </svg>
  );
};

export const FloralCorner: React.FC<{ className?: string, position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' }> = 
  ({ className = 'w-40 h-40', position = 'top-left' }) => {
  
  let transform = '';
  switch(position) {
    case 'top-right':
      transform = 'scale(-1, 1)';
      break;
    case 'bottom-left':
      transform = 'scale(1, -1)';
      break;
    case 'bottom-right':
      transform = 'scale(-1, -1)';
      break;
    default:
      transform = '';
  }
  
  return (
    <svg viewBox="0 0 100 100" className={className} style={{ transform }} xmlns="http://www.w3.org/2000/svg">
      {/* Ramo principale */}
      <path d="M10,10 Q30,30 50,50" stroke="#D2E2D1" strokeWidth="1.5" fill="none" />
      
      {/* Foglie */}
      <path d="M20,15 Q25,10 30,15 Q25,20 20,15 Z" fill="#E2D2C1" />
      <path d="M30,25 Q35,20 40,25 Q35,30 30,25 Z" fill="#D2E2D1" />
      <path d="M40,35 Q45,30 50,35 Q45,40 40,35 Z" fill="#E2D2C1" />
      
      {/* Fiori */}
      <circle cx="15" cy="20" r="5" fill="#E9BEB6" />
      <circle cx="35" cy="30" r="4" fill="#E9BEB6" />
      <circle cx="25" cy="40" r="6" fill="#E9BEB6" />
      
      {/* Dettagli fiori */}
      <circle cx="15" cy="20" r="2" fill="#F2DAD3" />
      <circle cx="35" cy="30" r="1.5" fill="#F2DAD3" />
      <circle cx="25" cy="40" r="2.5" fill="#F2DAD3" />
      
      {/* Piccoli elementi decorativi */}
      <circle cx="10" cy="10" r="1" fill="#E9BEB6" />
      <circle cx="45" cy="45" r="1" fill="#E9BEB6" />
      <circle cx="20" cy="30" r="0.8" fill="#E9BEB6" />
    </svg>
  );
};

export const FloralDivider: React.FC<{ className?: string }> = ({ className = 'w-full h-16' }) => {
  return (
    <svg viewBox="0 0 400 50" className={className} xmlns="http://www.w3.org/2000/svg">
      {/* Linea centrale */}
      <path d="M50,25 L350,25" stroke="#E2D2C1" strokeWidth="1" strokeDasharray="3,3" />
      
      {/* Elementi floreali */}
      <g transform="translate(200, 25)">
        {/* Fiore centrale */}
        <circle cx="0" cy="0" r="10" fill="#E9BEB6" opacity="0.7" />
        <circle cx="0" cy="0" r="5" fill="#F2DAD3" />
        
        {/* Foglie */}
        <path d="M-20,-5 Q-10,0 -20,5" stroke="#D2E2D1" strokeWidth="1.5" fill="none" />
        <path d="M20,-5 Q10,0 20,5" stroke="#D2E2D1" strokeWidth="1.5" fill="none" />
        
        {/* Piccoli fiori */}
        <circle cx="-40" cy="0" r="5" fill="#E9BEB6" opacity="0.6" />
        <circle cx="40" cy="0" r="5" fill="#E9BEB6" opacity="0.6" />
        
        {/* Decorazioni */}
        <circle cx="-80" cy="0" r="3" fill="#E9BEB6" opacity="0.5" />
        <circle cx="80" cy="0" r="3" fill="#E9BEB6" opacity="0.5" />
        <path d="M-120,-5 Q-110,0 -120,5" stroke="#E2D2C1" strokeWidth="1" fill="none" />
        <path d="M120,-5 Q110,0 120,5" stroke="#E2D2C1" strokeWidth="1" fill="none" />
        
        {/* Piccole foglie */}
        <path d="M-60,-3 Q-55,0 -60,3" stroke="#D2E2D1" strokeWidth="1" fill="none" />
        <path d="M60,-3 Q55,0 60,3" stroke="#D2E2D1" strokeWidth="1" fill="none" />
        <path d="M-100,-3 Q-95,0 -100,3" stroke="#D2E2D1" strokeWidth="1" fill="none" />
        <path d="M100,-3 Q95,0 100,3" stroke="#D2E2D1" strokeWidth="1" fill="none" />
      </g>
    </svg>
  );
};

export const HeartFrameWithRings: React.FC<{ className?: string }> = ({ className = 'w-full h-full' }) => {
  return (
    <svg viewBox="0 0 100 100" className={className} xmlns="http://www.w3.org/2000/svg">
      {/* Cuore */}
      <path d="M50,20 L55,15 Q65,5 75,15 Q85,25 75,40 L50,65 L25,40 Q15,25 25,15 Q35,5 45,15 L50,20 Z" 
        fill="none" stroke="#E9BEB6" strokeWidth="1" />
      
      {/* Anelli intrecciati */}
      <circle cx="40" cy="40" r="10" fill="none" stroke="#E2D2C1" strokeWidth="2" />
      <circle cx="60" cy="40" r="10" fill="none" stroke="#D2E2D1" strokeWidth="2" />
      
      {/* Decorazioni floreali */}
      <circle cx="50" cy="15" r="3" fill="#E9BEB6" opacity="0.6" />
      <path d="M25,35 Q20,30 25,25" stroke="#D2E2D1" strokeWidth="1" fill="none" />
      <path d="M75,35 Q80,30 75,25" stroke="#D2E2D1" strokeWidth="1" fill="none" />
      
      {/* Foglie sul fondo */}
      <path d="M40,65 Q45,70 50,65" stroke="#D2E2D1" strokeWidth="1" fill="none" />
      <path d="M60,65 Q55,70 50,65" stroke="#D2E2D1" strokeWidth="1" fill="none" />
    </svg>
  );
};

export const BackgroundDecoration: React.FC<{ className?: string }> = ({ className = 'w-full h-full' }) => {
  return (
    <svg viewBox="0 0 400 400" className={className} xmlns="http://www.w3.org/2000/svg" opacity="0.15">
      {/* Pattern di foglie e fiori */}
      <g>
        {Array.from({ length: 20 }).map((_, i) => {
          const x = Math.random() * 400;
          const y = Math.random() * 400;
          const size = 3 + Math.random() * 7;
          return <circle key={`dot-${i}`} cx={x} cy={y} r={size} fill="#E9BEB6" opacity={0.3 + Math.random() * 0.3} />;
        })}
        
        {Array.from({ length: 15 }).map((_, i) => {
          const x = Math.random() * 400;
          const y = Math.random() * 400;
          const rotation = Math.random() * 360;
          return (
            <g key={`leaf-${i}`} transform={`translate(${x}, ${y}) rotate(${rotation})`}>
              <path d="M0,0 Q5,-10 0,-15 Q-5,-10 0,0 Z" fill="#D2E2D1" opacity={0.3 + Math.random() * 0.3} />
            </g>
          );
        })}
        
        {Array.from({ length: 10 }).map((_, i) => {
          const x = Math.random() * 400;
          const y = Math.random() * 400;
          const rotation = Math.random() * 360;
          return (
            <g key={`branch-${i}`} transform={`translate(${x}, ${y}) rotate(${rotation})`}>
              <path d="M0,0 Q10,-10 20,-5" stroke="#E2D2C1" strokeWidth="1" fill="none" opacity={0.3 + Math.random() * 0.3} />
            </g>
          );
        })}
      </g>
    </svg>
  );
};