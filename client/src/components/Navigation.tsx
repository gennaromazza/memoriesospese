import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { useStudio } from "../context/StudioContext";
import { useFirebaseAuth } from "../context/FirebaseAuthContext";
import { Menu, X, User, LogOut, Instagram } from "lucide-react";
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

              {/* Pulsante Pannello Admin - solo per admin */}
              {isAdmin && (
                <Button
                  onClick={() => navigate(createUrl('/admin'))}
                  className="bg-blue-gray hover:bg-blue-gray/90 text-white"
                  size="sm"
                >
                  <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  <span className="hidden sm:inline">Pannello Admin</span>
                  <span className="sm:hidden">Admin</span>
                </Button>
              )}

              {/* Pulsante Richiedi Password - solo per non-admin */}
              {galleryCode && !isAdmin && (
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
    <nav className="fixed top-0 w-full z-50 bg-white/90 backdrop-blur-lg border-b border-sage/10 shadow-sm">
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
                  iMaGe <span className="text-sage">Studio</span>
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
              <Link to={createUrl("/portfolio")} className="relative font-medium text-blue-gray hover:text-sage px-4 py-2 rounded-xl transition-all duration-300 group">
                <span className="relative z-10">Portfolio</span>
                <span className="absolute inset-0 bg-gradient-to-r from-sage/0 via-sage/5 to-sage/0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></span>
              </Link>
              <Link to={createUrl("/storie")} className="relative font-medium text-blue-gray hover:text-sage px-4 py-2 rounded-xl transition-all duration-300 group">
                <span className="relative z-10">La Mia Storia</span>
                <span className="absolute inset-0 bg-gradient-to-r from-sage/0 via-sage/5 to-sage/0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></span>
              </Link>
              <Link to={createUrl("/blog")} className="relative font-medium text-blue-gray hover:text-sage px-4 py-2 rounded-xl transition-all duration-300 group">
                <span className="relative z-10">Blog</span>
                <span className="absolute inset-0 bg-gradient-to-r from-sage/0 via-sage/5 to-sage/0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></span>
              </Link>
              <Link to={createUrl("/vision")} className="relative font-medium text-blue-gray hover:text-sage px-4 py-2 rounded-xl transition-all duration-300 group">
                <span className="relative z-10">iMaGe Vision</span>
                <span className="absolute inset-0 bg-gradient-to-r from-sage/0 via-sage/5 to-sage/0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></span>
              </Link>
              <Link to={createUrl("/consulenze")} className="relative font-medium text-blue-gray hover:text-sage px-4 py-2 rounded-xl transition-all duration-300 group">
                <span className="relative z-10">Contattami</span>
                <span className="absolute inset-0 bg-gradient-to-r from-sage/0 via-sage/5 to-sage/0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></span>
              </Link>
              <Link to={createUrl("/prenota")} className="relative font-medium text-blue-gray hover:text-sage px-4 py-2 rounded-xl transition-all duration-300 group">
                <span className="relative z-10">Prenota Ora</span>
                <span className="absolute inset-0 bg-gradient-to-r from-sage/0 via-sage/5 to-sage/0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></span>
              </Link>
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
          <Link to={createUrl("/portfolio")} className="block px-4 py-3 text-base font-medium text-blue-gray hover:text-sage hover:bg-gradient-to-r hover:from-sage/5 hover:to-sage/10 rounded-xl transition-all duration-300">
            Portfolio
          </Link>
          <Link to={createUrl("/storie")} className="block px-4 py-3 text-base font-medium text-blue-gray hover:text-sage hover:bg-gradient-to-r hover:from-sage/5 hover:to-sage/10 rounded-xl transition-all duration-300">
            La Mia Storia
          </Link>
          <Link to={createUrl("/blog")} className="block px-4 py-3 text-base font-medium text-blue-gray hover:text-sage hover:bg-gradient-to-r hover:from-sage/5 hover:to-sage/10 rounded-xl transition-all duration-300">
            Blog
          </Link>
          <Link to={createUrl("/vision")} className="block px-4 py-3 text-base font-medium text-blue-gray hover:text-sage hover:bg-gradient-to-r hover:from-sage/5 hover:to-sage/10 rounded-xl transition-all duration-300">
            iMaGe Vision
          </Link>
          <Link to={createUrl("/consulenze")} className="block px-4 py-3 text-base font-medium text-blue-gray hover:text-sage hover:bg-gradient-to-r hover:from-sage/5 hover:to-sage/10 rounded-xl transition-all duration-300">
            Contattami
          </Link>
          <Link to={createUrl("/prenota")} className="block px-4 py-3 text-base font-medium text-blue-gray hover:text-sage hover:bg-gradient-to-r hover:from-sage/5 hover:to-sage/10 rounded-xl transition-all duration-300">
            Prenota Ora
          </Link>

          {/* Link Social Media Mobile */}
          <div className="border-t border-sage/10 pt-3 mt-3">
            {studioSettings.socialLinks?.instagram && (
              <a
                href={(() => {
                  const normalized = studioSettings.socialLinks.instagram
                    .replace(/^https?:\/\/(www\.)?instagram\.com\//, '')
                    .replace(/^@/, '')
                    .replace(/\/$/, '')
                    .replace(/[?#].*$/, '');
                  return normalized
                    ? `https://www.instagram.com/${normalized}`
                    : (studioSettings.socialLinks.instagram.startsWith('http')
                        ? studioSettings.socialLinks.instagram
                        : `https://www.instagram.com/${studioSettings.socialLinks.instagram}`);
                })()}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-3 text-base font-medium text-blue-gray hover:text-sage hover:bg-gradient-to-r hover:from-sage/5 hover:to-sage/10 rounded-xl transition-all duration-300"
              >
                <Instagram className="h-5 w-5" />
                Instagram
              </a>
            )}
            <a
              href="https://www.facebook.com/gennaromazzacanefotografo/?locale=it_IT"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-3 text-base font-medium text-blue-gray hover:text-sage hover:bg-gradient-to-r hover:from-sage/5 hover:to-sage/10 rounded-xl transition-all duration-300"
            >
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
              Facebook
            </a>
            <a
              href="https://share.google/SW1hp2vnc9Csiwfkc"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-3 text-base font-medium text-blue-gray hover:text-sage hover:bg-gradient-to-r hover:from-sage/5 hover:to-sage/10 rounded-xl transition-all duration-300"
            >
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Recensioni Google
            </a>
          </div>

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