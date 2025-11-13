import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { useStudio } from "../context/StudioContext";
import { useFirebaseAuth } from "../context/FirebaseAuthContext";
import { Menu, X, User, LogOut } from "lucide-react";
import { createUrl, createAbsoluteUrl } from "@/lib/basePath";
import authService from "../services/authService";
import { useLogout } from "../hooks/useLogout";
import { useUserInfo } from "../hooks/useUserInfo";
import { useIsAdmin } from "../hooks/useIsAdmin";
import UserAvatar from "./UserAvatar";
import { Button } from "@/components/ui/button";

interface NavigationProps {
  isAdminNav?: boolean;
  galleryOwner?: string;
  galleryCode?: string;
}

export default function Navigation({ isAdminNav = false, galleryOwner, galleryCode }: NavigationProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [location, navigate] = useLocation();
  const { studioSettings } = useStudio();
  const { isAuthenticated, user, userProfile } = useFirebaseAuth();
  const { handleLogout } = useLogout();
  const userInfo = useUserInfo();
  const isAdmin = useIsAdmin();

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
              <div className="ml-6 flex items-center space-x-4">
              <a 
                href={createUrl("/")}
                className="text-white text-sm hover:text-sage"
              >
                Vai al sito
              </a>
            </div>
            </div>
            <div className="flex items-center">
              <button 
                onClick={handleLogout}
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
      <nav className="bg-white shadow-sm mobile-gallery-nav">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <div className="flex-shrink-0 flex items-center">
              <Link href={createUrl("/")} className="flex items-center">
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
            <div className="ml-4 flex items-center md:ml-6 gap-4">
              <span className="hidden sm:inline-block px-4 py-2 rounded-md text-blue-gray bg-light-mint font-medium">
                Galleria di <span>{galleryOwner}</span>
              </span>

              {/* Pulsante Richiedi Password */}
              {galleryCode && (
                <Button
                  onClick={() => navigate(createUrl(`/request-password/${galleryCode}`))}
                  className="bg-terracotta hover:bg-terracotta-dark text-white"
                  size="sm"
                >
                  <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                  <span className="hidden sm:inline">Richiedi Password</span>
                </Button>
              )}

              {/* Sezione utente con avatar, profilo e logout */}
              {userInfo.isAuthenticated && userInfo.email && (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <UserAvatar 
                      userEmail={userInfo.email}
                      userName={userInfo.displayName}
                      userProfileImageUrl={userInfo.profileImageUrl}
                      size="sm"
                    />
                    <span className="text-sm font-medium hidden lg:block text-blue-gray">
                      {userInfo.displayName || 'Ospite'}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate(createUrl("/profile"))}
                    className="text-blue-gray hover:text-sage"
                  >
                    <User className="h-4 w-4" />
                    <span className="hidden sm:inline ml-2">Profilo</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleLogout}
                    className="text-blue-gray hover:text-sage"
                  >
                    <LogOut className="h-4 w-4" />
                    <span className="hidden sm:inline ml-2">Esci</span>
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>
    );
  }

  // Default navigation bar (home page)
  return (
    <nav className="sticky top-0 z-50 bg-off-white/80 backdrop-blur-md border-b border-beige/20 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20">
          <div className="flex-shrink-0 flex items-center">
            <Link to={createUrl("/")} className="flex items-center">
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
            <div className="ml-10 flex items-center space-x-2">
              <Link to={createUrl("/")} className="font-medium text-blue-gray hover:bg-light-mint/50 px-3 py-2 rounded-lg transition-all">
                Home
              </Link>
              <Link to={createUrl("/prenota")} className="font-medium text-blue-gray hover:bg-light-mint/50 px-3 py-2 rounded-lg transition-all">
                Prenotazioni
              </Link>
              <a href="#contact" className="font-medium text-blue-gray hover:bg-light-mint/50 px-3 py-2 rounded-lg transition-all">Contatti</a>
              
              <div className="w-px h-6 bg-beige/30 mx-2"></div>

              {/* Sezione utente e admin */}
              <div className="hidden md:flex md:items-center md:ml-6 space-x-4">
                {userInfo.isAuthenticated && userInfo.email ? (
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-light-mint/30 rounded-full">
                      <UserAvatar 
                        userEmail={userInfo.email}
                        userName={userInfo.displayName}
                        userProfileImageUrl={userInfo.profileImageUrl}
                        size="sm"
                      />
                      <span className="text-sm font-medium text-blue-gray">
                        {userInfo.displayName || 'Ospite'}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(createUrl("/profile"))}
                      className="text-blue-gray hover:text-dark-sage"
                    >
                      <User className="h-4 w-4" />
                      <span className="ml-2">Profilo</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleLogout}
                      className="text-blue-gray hover:text-dark-sage"
                    >
                      <LogOut className="h-4 w-4" />
                      <span className="ml-2">Esci</span>
                    </Button>
                  </div>
                ) : (
                  <Link to={createUrl("/admin")} className="px-4 py-2 rounded-md text-off-white bg-blue-gray hover:bg-dark-sage transition">
                    Admin
                  </Link>
                )}
              </div>
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
      <div className={`${isMenuOpen ? 'block' : 'hidden'} md:hidden bg-off-white/95 backdrop-blur-md border-t border-beige/20`}>
        <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
          <Link to={createUrl("/")} className="block px-3 py-2 text-base font-medium text-blue-gray hover:bg-light-mint/50 rounded-lg transition-all">
            Home
          </Link>
          <Link to={createUrl("/prenota")} className="block px-3 py-2 text-base font-medium text-blue-gray hover:bg-light-mint/50 rounded-lg transition-all">
            Prenotazioni
          </Link>
          <a href="#contact" className="block px-3 py-2 text-base font-medium text-blue-gray hover:bg-light-mint/50 rounded-lg transition-all">Contatti</a>

          {/* Sezione utente mobile */}
          {userInfo.isAuthenticated && userInfo.email ? (
            <div className="border-t border-gray-200 pt-4 pb-3">
              <div className="flex items-center px-5">
                <UserAvatar 
                  userEmail={userInfo.email}
                  userName={userInfo.displayName}
                  userProfileImageUrl={userInfo.profileImageUrl}
                  size="md"
                />
                <div className="ml-3">
                  <div className="text-base font-medium text-blue-gray">{userInfo.displayName || 'Ospite'}</div>
                  <div className="text-sm font-medium text-gray-500">{userInfo.email}</div>
                </div>
              </div>
              <div className="mt-3 px-2 space-y-1">
                {/* Pulsante Richiedi Password mobile */}
                {galleryCode && (
                  <button
                    onClick={() => {
                      navigate(createUrl(`/request-password/${galleryCode}`));
                      setIsMenuOpen(false);
                    }}
                    className="block w-full text-left px-3 py-2 rounded-md text-base font-medium text-white bg-terracotta hover:bg-terracotta-dark"
                  >
                    <svg className="h-4 w-4 inline mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    </svg>
                    Richiedi Password
                  </button>
                )}
                <Link
                  to={createUrl("/profile")}
                  className="block px-3 py-2 rounded-md text-base font-medium text-blue-gray hover:bg-gray-50"
                >
                  <User className="h-4 w-4 inline mr-2" />
                  Il Mio Profilo
                </Link>
                <button
                  onClick={handleLogout}
                  className="block w-full text-left px-3 py-2 rounded-md text-base font-medium text-blue-gray hover:bg-gray-50"
                >
                  <LogOut className="h-4 w-4 inline mr-2" />
                  Esci
                </button>
              </div>
            </div>
          ) : (
            <Link to={createUrl("/admin")} className="block px-3 py-2 text-base font-medium text-blue-gray">
              Admin
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}