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
    <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-lg border-b border-sage/10 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20">
          <div className="flex-shrink-0 flex items-center">
            <Link to={createUrl("/")} className="flex items-center group">
              {studioSettings.logo ? (
                <img 
                  src={studioSettings.logo} 
                  alt={`${studioSettings.name} Logo`} 
                  className="h-12 w-auto transition-transform duration-300 group-hover:scale-105"
                />
              ) : (
                <h1 className="text-blue-gray font-playfair font-bold text-2xl cursor-pointer transition-colors duration-300 group-hover:text-sage">
                  {studioSettings.name || "Memorie Sospese"}
                </h1>
              )}
            </Link>
          </div>
          <div className="hidden md:block">
            <div className="ml-10 flex items-center space-x-1">
              <Link to={createUrl("/")} className="relative font-medium text-blue-gray hover:text-sage px-4 py-2 rounded-xl transition-all duration-300 group">
                <span className="relative z-10">Home</span>
                <span className="absolute inset-0 bg-gradient-to-r from-sage/0 via-sage/5 to-sage/0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></span>
              </Link>
              <Link to={createUrl("/prenota")} className="relative font-medium text-blue-gray hover:text-sage px-4 py-2 rounded-xl transition-all duration-300 group">
                <span className="relative z-10">Prenotazioni</span>
                <span className="absolute inset-0 bg-gradient-to-r from-sage/0 via-sage/5 to-sage/0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></span>
              </Link>
              <a href="#contact" className="relative font-medium text-blue-gray hover:text-sage px-4 py-2 rounded-xl transition-all duration-300 group">
                <span className="relative z-10">Contatti</span>
                <span className="absolute inset-0 bg-gradient-to-r from-sage/0 via-sage/5 to-sage/0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></span>
              </a>
              <Link
                href="/blog"
                className="text-blue-gray hover:text-sage transition"
              >
                Blog
              </Link>
              <Link
                href="/consulenze"
                className="text-blue-gray hover:text-sage transition"
              >
                Consulenze
              </Link>
              <a
                href="/#recensioni"
                className="text-blue-gray hover:text-sage transition"
              >
                Recensioni
              </a>
              <a
                href="https://www.facebook.com/gennaromazzacanefotografo/?locale=it_IT"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-gray hover:text-sage transition"
              >
                Facebook
              </a>

              <div className="w-px h-6 bg-sage/20 mx-3"></div>

              {/* Sezione utente e admin */}
              <div className="hidden md:flex md:items-center md:ml-2 space-x-2">
                {userInfo.isAuthenticated && userInfo.email ? (
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-sage/5 to-sage/10 rounded-full border border-sage/20 shadow-sm">
                      <UserAvatar 
                        userEmail={userInfo.email}
                        userName={userInfo.displayName}
                        userProfileImageUrl={userInfo.profileImageUrl}
                        size="sm"
                      />
                      <span className="text-sm font-semibold text-blue-gray">
                        {userInfo.displayName || 'Ospite'}
                      </span>
                    </div>
                    {isAdmin && (
                      <Link
                        to={createUrl("/admin/dashboard")}
                        className="px-4 py-2 rounded-xl text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 transition-all duration-300 font-medium"
                        data-testid="link-admin-dashboard"
                      >
                        Pannello Admin
                      </Link>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(createUrl("/profile"))}
                      className="text-blue-gray hover:text-sage hover:bg-sage/5 transition-all duration-300"
                    >
                      <User className="h-4 w-4" />
                      <span className="ml-2">Profilo</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleLogout}
                      className="text-blue-gray hover:text-terracotta hover:bg-terracotta/5 transition-all duration-300"
                    >
                      <LogOut className="h-4 w-4" />
                      <span className="ml-2">Esci</span>
                    </Button>
                  </div>
                ) : (
                  <Link to={createUrl("/admin")} className="px-5 py-2.5 rounded-xl text-white bg-gradient-to-r from-sage to-dark-sage hover:from-dark-sage hover:to-sage shadow-md hover:shadow-lg transition-all duration-300 font-medium">
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
      <div className={`${isMenuOpen ? 'block' : 'hidden'} md:hidden bg-white/95 backdrop-blur-lg border-t border-sage/10 shadow-lg`}>
        <div className="px-3 pt-3 pb-4 space-y-2">
          <Link to={createUrl("/")} className="block px-4 py-3 text-base font-medium text-blue-gray hover:text-sage hover:bg-gradient-to-r hover:from-sage/5 hover:to-sage/10 rounded-xl transition-all duration-300">
            Home
          </Link>
          <Link to={createUrl("/prenota")} className="block px-4 py-3 text-base font-medium text-blue-gray hover:text-sage hover:bg-gradient-to-r hover:from-sage/5 hover:to-sage/10 rounded-xl transition-all duration-300">
            Prenotazioni
          </Link>
          <a href="#contact" className="block px-4 py-3 text-base font-medium text-blue-gray hover:text-sage hover:bg-gradient-to-r hover:from-sage/5 hover:to-sage/10 rounded-xl transition-all duration-300">Contatti</a>
          <Link
                href="/blog"
                className="block px-4 py-3 text-base font-medium text-blue-gray hover:text-sage hover:bg-gradient-to-r hover:from-sage/5 hover:to-sage/10 rounded-xl transition-all duration-300"
              >
                Blog
              </Link>
              <Link
                href="/consulenze"
                className="block px-4 py-3 text-base font-medium text-blue-gray hover:text-sage hover:bg-gradient-to-r hover:from-sage/5 hover:to-sage/10 rounded-xl transition-all duration-300"
              >
                Consulenze
              </Link>
              <a
                href="https://share.google/SW1hp2vnc9Csiwfkc"
                target="_blank"
                rel="noopener noreferrer"
                className="block px-4 py-3 text-base font-medium text-blue-gray hover:text-sage hover:bg-gradient-to-r hover:from-sage/5 hover:to-sage/10 rounded-xl transition-all duration-300"
              >
                Recensioni
              </a>

          {/* Sezione utente mobile */}
          {userInfo.isAuthenticated && userInfo.email ? (
            <div className="border-t border-sage/10 pt-4 pb-3 mt-2">
              <div className="flex items-center px-4 py-3 bg-gradient-to-r from-sage/5 to-sage/10 rounded-xl mb-3">
                <UserAvatar 
                  userEmail={userInfo.email}
                  userName={userInfo.displayName}
                  userProfileImageUrl={userInfo.profileImageUrl}
                  size="md"
                />
                <div className="ml-3">
                  <div className="text-base font-semibold text-blue-gray">{userInfo.displayName || 'Ospite'}</div>
                  <div className="text-sm font-medium text-gray-600">{userInfo.email}</div>
                </div>
              </div>
              <div className="space-y-2">
                {/* Pulsante Admin mobile - solo per admin */}
                {isAdmin && (
                  <Link
                    to={createUrl("/admin/dashboard")}
                    className="block w-full text-center px-4 py-3 rounded-xl text-base font-medium text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-md hover:shadow-lg transition-all duration-300"
                    onClick={() => setIsMenuOpen(false)}
                    data-testid="link-admin-dashboard-mobile"
                  >
                    Pannello Admin
                  </Link>
                )}
                {/* Pulsante Richiedi Password mobile */}
                {galleryCode && (
                  <button
                    onClick={() => {
                      navigate(createUrl(`/request-password/${galleryCode}`));
                      setIsMenuOpen(false);
                    }}
                    className="block w-full text-left px-4 py-3 rounded-xl text-base font-medium text-white bg-gradient-to-r from-terracotta to-terracotta/90 hover:from-terracotta/90 hover:to-terracotta shadow-sm hover:shadow-md transition-all duration-300"
                  >
                    <svg className="h-4 w-4 inline mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    </svg>
                    Richiedi Password
                  </button>
                )}
                <Link
                  to={createUrl("/profile")}
                  className="block px-4 py-3 rounded-xl text-base font-medium text-blue-gray hover:text-sage hover:bg-gradient-to-r hover:from-sage/5 hover:to-sage/10 transition-all duration-300"
                >
                  <User className="h-4 w-4 inline mr-2" />
                  Il Mio Profilo
                </Link>
                <button
                  onClick={handleLogout}
                  className="block w-full text-left px-4 py-3 rounded-xl text-base font-medium text-blue-gray hover:text-terracotta hover:bg-gradient-to-r hover:from-terracotta/5 hover:to-terracotta/10 transition-all duration-300"
                >
                  <LogOut className="h-4 w-4 inline mr-2" />
                  Esci
                </button>
              </div>
            </div>
          ) : (
            <Link to={createUrl("/admin")} className="block px-4 py-3 text-base font-medium text-white bg-gradient-to-r from-sage to-dark-sage hover:from-dark-sage hover:to-sage rounded-xl shadow-md hover:shadow-lg transition-all duration-300 text-center mt-2">
              Admin
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}