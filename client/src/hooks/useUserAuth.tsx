import { useState, useEffect } from 'react';

interface UserAuth {
  userEmail: string | null;
  userName: string | null;
  isAuthenticated: boolean;
}

export function useUserAuth(galleryId?: string): UserAuth {
  const [userAuth, setUserAuth] = useState<UserAuth>({
    userEmail: null,
    userName: null,
    isAuthenticated: false
  });

  useEffect(() => {
    // Check if user is authenticated for this gallery
    const checkAuth = () => {
      if (!galleryId) return;

      // Check gallery access
      const isGalleryAuth = localStorage.getItem(`gallery_auth_${galleryId}`) === 'true';
      
      if (isGalleryAuth) {
        // Try to get user data from localStorage or prompt for it
        let storedUserEmail = localStorage.getItem(`user_email_${galleryId}`);
        let storedUserName = localStorage.getItem(`user_name_${galleryId}`);
        
        // If no stored user data, we'll need to prompt for it
        if (!storedUserEmail || !storedUserName) {
          // This will be handled by the component that uses the hook
          setUserAuth({
            userEmail: null,
            userName: null,
            isAuthenticated: false
          });
          return;
        }

        setUserAuth({
          userEmail: storedUserEmail,
          userName: storedUserName,
          isAuthenticated: true
        });
      } else {
        setUserAuth({
          userEmail: null,
          userName: null,
          isAuthenticated: false
        });
      }
    };

    checkAuth();
  }, [galleryId]);

  return userAuth;
}

// Function to set user authentication data
export function setUserAuthData(galleryId: string, email: string, name: string) {
  localStorage.setItem(`user_email_${galleryId}`, email);
  localStorage.setItem(`user_name_${galleryId}`, name);
}

// Function to clear user authentication data
export function clearUserAuthData(galleryId: string) {
  localStorage.removeItem(`user_email_${galleryId}`);
  localStorage.removeItem(`user_name_${galleryId}`);
}