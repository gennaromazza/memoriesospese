import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { useStudio } from "@/context/StudioContext";

interface NavigationProps {
  isAdminNav?: boolean;
  galleryOwner?: string;
}

export default function Navigation({ isAdminNav = false, galleryOwner }: NavigationProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [location] = useLocation();
  const { currentUser, signOut } = useAuth();
  const { studioSettings } = useStudio();

  const handleSignOut = async () => {
    try {
      await signOut();
      window.location.href = "/";
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  // Admin navigation bar
  if (isAdminNav) {
    return (
      <nav className="bg-blue-gray">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <h1 className="text-off-white font-playfair font-semibold text-2xl">Admin Dashboard</h1>
              </div>
            </div>
            <div className="flex items-center">
              <button 
                onClick={handleSignOut}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-gray bg-opacity-20 hover:bg-opacity-30"
              >
                Esci
              </button>
            </div>
          </div>
        </div>
      </nav>
    );
  }

  // Gallery navigation bar (when viewing a specific gallery)
  if (galleryOwner) {
    return (
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <div className="flex-shrink-0 flex items-center">
              <Link href="/" className="flex items-center">
                {studioSettings.logo ? (
                  <img 
                    src={studioSettings.logo} 
                    alt={`${studioSettings.name} Logo`} 
                    className="h-12 w-auto"
                  />
                ) : (
                  <h1 className="text-blue-gray font-playfair font-semibold text-2xl cursor-pointer">
                    {studioSettings.name || "Memorie Sospese"}
                  </h1>
                )}
              </Link>
            </div>
            <div className="ml-4 flex items-center md:ml-6">
              <span className="px-4 py-2 rounded-md text-blue-gray bg-light-mint font-medium">
                Galleria di <span>{galleryOwner}</span>
              </span>
              <Link href="/">
                <button className="ml-4 btn-primary px-4 py-2">
                  Esci
                </button>
              </Link>
            </div>
          </div>
        </div>
      </nav>
    );
  }

  // Default navigation bar (home page)
  return (
    <nav className="bg-off-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20">
          <div className="flex-shrink-0 flex items-center">
            <Link href="/" className="flex items-center">
              {studioSettings.logo ? (
                <img 
                  src={studioSettings.logo} 
                  alt={`${studioSettings.name} Logo`} 
                  className="h-12 w-auto"
                />
              ) : (
                <h1 className="text-blue-gray font-playfair font-semibold text-2xl cursor-pointer">
                  {studioSettings.name || "Memorie Sospese"}
                </h1>
              )}
            </Link>
          </div>
          <div className="hidden md:block">
            <div className="ml-10 flex items-center space-x-6">
              <Link href="/" className="font-medium text-blue-gray hover:text-dark-sage transition">
                Home
              </Link>
              <a href="#about" className="font-medium text-blue-gray hover:text-dark-sage transition">Come Funziona</a>
              <a href="#contact" className="font-medium text-blue-gray hover:text-dark-sage transition">Contatti</a>
              <Link href="/admin" className="px-4 py-2 rounded-md text-off-white bg-blue-gray hover:bg-dark-sage transition">
                Admin
              </Link>
            </div>
          </div>
          <div className="md:hidden flex items-center">
            <button 
              onClick={() => setIsMenuOpen(!isMenuOpen)} 
              className="text-blue-gray"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>
      </div>
      
      {/* Mobile menu */}
      <div className={`${isMenuOpen ? 'block' : 'hidden'} md:hidden bg-off-white`}>
        <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
          <Link href="/" className="block px-3 py-2 text-base font-medium text-blue-gray">
            Home
          </Link>
          <a href="#about" className="block px-3 py-2 text-base font-medium text-blue-gray">Come Funziona</a>
          <a href="#contact" className="block px-3 py-2 text-base font-medium text-blue-gray">Contatti</a>
          <Link href="/admin" className="block px-3 py-2 text-base font-medium text-blue-gray">
            Admin
          </Link>
        </div>
      </div>
    </nav>
  );
}
