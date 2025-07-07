import { createContext, useContext, ReactNode, useState } from 'react';

interface StudioContextType {
  isStudioMode: boolean;
  setIsStudioMode: (mode: boolean) => void;
}

const StudioContext = createContext<StudioContextType | undefined>(undefined);

export function StudioProvider({ children }: { children: ReactNode }) {
  const [isStudioMode, setIsStudioMode] = useState(false);

  return (
    <StudioContext.Provider value={{ isStudioMode, setIsStudioMode }}>
      {children}
    </StudioContext.Provider>
  );
}

export function useStudioContext() {
  const context = useContext(StudioContext);
  if (context === undefined) {
    throw new Error('useStudioContext must be used within a StudioProvider');
  }
  return context;
}