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
      <nav className="bg-white shadow-sm">
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
              <span className="px-4 py-2 rounded-md text-blue-gray bg-light-mint font-medium">
                Galleria di <span>{galleryOwner}</span>
              </span>
              
              {/* Pulsante Pannello Admin per amministratori */}
              {isAdmin && (
                <Button
                  onClick={() => {
                    // Salva le informazioni della galleria corrente nel sessionStorage
                    if (galleryOwner) {
                      sessionStorage.setItem('adminReferrerGallery', JSON.stringify({
                        name: galleryOwner,
                        code: galleryCode,
                        from: 'gallery'
                      }));
                    }
                    navigate(createUrl("/admin/dashboard"));
                  }}
                  className="bg-blue-gray hover:bg-dark-sage text-white"
                  size="sm"
                >
                  <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="hidden sm:inline">Pannello Admin</span>
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
    <nav className="bg-off-white shadow-sm">
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
            <div className="ml-10 flex items-center space-x-6">
              <Link to={createUrl("/")} className="font-medium text-blue-gray hover:text-dark-sage transition">
                Home
              </Link>
              <a href="#about" className="font-medium text-blue-gray hover:text-dark-sage transition">Come Funziona</a>
              <a href="#contact" className="font-medium text-blue-gray hover:text-dark-sage transition">Contatti</a>
              
              {/* Sezione utente e admin */}
              <div className="hidden md:flex md:items-center md:ml-6 space-x-4">
                {userInfo.isAuthenticated && userInfo.email ? (
                  <div className="flex items-center gap-3">
                    {/* Pulsante Pannello Admin per amministratori */}
                    {isAdmin && (
                      <Button
                        onClick={() => navigate(createUrl("/admin/dashboard"))}
                        className="bg-blue-gray hover:bg-dark-sage text-white"
                        size="sm"
                      >
                        <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        Pannello Admin
                      </Button>
                    )}
                    <div className="flex items-center gap-2">
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
      <div className={`${isMenuOpen ? 'block' : 'hidden'} md:hidden bg-off-white`}>
        <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
          <Link to={createUrl("/")} className="block px-3 py-2 text-base font-medium text-blue-gray">
            Home
          </Link>
          <a href="#about" className="block px-3 py-2 text-base font-medium text-blue-gray">Come Funziona</a>
          <a href="#contact" className="block px-3 py-2 text-base font-medium text-blue-gray">Contatti</a>
          
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
                {/* Pulsante Pannello Admin per amministratori mobile */}
                {isAdmin && (
                  <button
                    onClick={() => {
                      // Salva le informazioni della galleria corrente nel sessionStorage per mobile
                      if (galleryOwner) {
                        sessionStorage.setItem('adminReferrerGallery', JSON.stringify({
                          name: galleryOwner,
                          code: galleryCode,
                          from: 'gallery'
                        }));
                      }
                      navigate(createUrl("/admin/dashboard"));
                      setIsMenuOpen(false);
                    }}
                    className="block w-full text-left px-3 py-2 rounded-md text-base font-medium text-white bg-blue-gray hover:bg-dark-sage"
                  >
                    <svg className="h-4 w-4 inline mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Pannello Admin
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