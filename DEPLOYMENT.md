# Wedding Gallery - Deployment Guide

## Overview
This is a Firebase-based wedding photo gallery application designed to be deployed in the `/wedgallery/` subdirectory of your web server.

## Prerequisites
- Firebase project with Firestore, Storage, and Authentication enabled
- Web hosting with Apache and mod_rewrite support
- Node.js for building the application

## Firebase Setup

### 1. Create Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or use existing one
3. Enable the following services:
   - **Firestore Database** (in production mode)
   - **Storage** (with appropriate security rules)
   - **Authentication** (for admin login if needed)

### 2. Configure Firebase Security Rules

#### Firestore Rules
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Galleries collection - public read, no write
    match /galleries/{document} {
      allow read: if true;
      allow write: if false;
    }
    
    // Photos subcollection - public read, no write
    match /galleries/{galleryId}/photos/{photoId} {
      allow read: if true;
      allow write: if false;
    }
    
    // Slideshow images - public read, no write
    match /slideshow/{document} {
      allow read: if true;
      allow write: if false;
    }
    
    // Password requests - allow creation only
    match /passwordRequests/{document} {
      allow read: if false;
      allow create: if true;
      allow update, delete: if false;
    }
  }
}
```

#### Storage Rules
```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Gallery photos - public read, no write
    match /galleries/{galleryId}/{allPaths=**} {
      allow read: if true;
      allow write: if false;
    }
    
    // Slideshow images - public read, no write
    match /slideshow/{allPaths=**} {
      allow read: if true;
      allow write: if false;
    }
  }
}
```

### 3. Get Firebase Configuration
1. Go to Project Settings → General
2. In "Your apps" section, add a web app
3. Copy the configuration object values

## Local Development Setup

### 1. Environment Configuration
Copy `.env.example` to `.env` and fill in your Firebase configuration:

```bash
cp .env.example .env
```

Edit `.env` with your Firebase project details:
```
VITE_FIREBASE_API_KEY=your_api_key_here
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef123456
VITE_FIREBASE_MEASUREMENT_ID=G-ABCDEF1234
VITE_ADMIN_PASSWORD=your_secure_admin_password
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Run Development Server
```bash
npm run dev
```

## Production Deployment

### 1. Build for Production
```bash
chmod +x build.sh
./build.sh
```

This creates a `dist` folder with all production files.

### 2. Upload to Server
1. Upload all contents of `dist/` to your server's `/wedgallery/` directory
2. Ensure the `.htaccess` file is uploaded and has correct permissions (644)
3. Verify directory structure:
   ```
   /your-domain/wedgallery/
   ├── index.html
   ├── assets/
   ├── .htaccess
   └── [other build files]
   ```

### 3. Server Configuration
Ensure your Apache server has:
- mod_rewrite enabled
- AllowOverride All for the directory
- Proper file permissions (644 for files, 755 for directories)

### 4. Test Deployment
Visit `https://yourdomain.com/wedgallery/` and verify:
- Application loads correctly
- Routing works (direct URL access to pages)
- Firebase connection is established
- Images and assets load properly

## Admin Panel Access
- URL: `https://yourdomain.com/wedgallery/admin`
- Password: Set in `VITE_ADMIN_PASSWORD` environment variable

## Troubleshooting

### Common Issues

1. **404 Errors on Direct URL Access**
   - Check `.htaccess` file is present and properly configured
   - Verify mod_rewrite is enabled on server
   - Ensure RewriteBase matches your subdirectory path

2. **Firebase Connection Issues**
   - Verify all environment variables are set correctly
   - Check Firebase project settings match your configuration
   - Ensure Firestore and Storage are enabled

3. **Asset Loading Problems**
   - Verify base path configuration in Vite matches deployment path
   - Check that all assets were uploaded correctly
   - Ensure proper file permissions

4. **Admin Access Issues**
   - Verify VITE_ADMIN_PASSWORD is set correctly
   - Check browser console for authentication errors

### Debugging
1. Open browser developer tools
2. Check Console for JavaScript errors
3. Check Network tab for failed requests
4. Verify Firebase configuration in browser storage

## Security Notes
- Keep your Firebase API keys secure
- Regularly review Firebase security rules
- Monitor Firebase usage and costs
- Use strong admin passwords
- Keep dependencies updated

## Support
For technical issues:
1. Check browser console for errors
2. Verify Firebase configuration
3. Test with Firebase emulator locally
4. Review server logs for Apache errors