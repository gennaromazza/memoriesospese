
# Collections and Variables Documentation

## Firestore Database Structure

### Galleries Collection: `galleries`
Main gallery documents:
- `id`: String (document ID)
- `name`: String (gallery name)
- `code`: String (unique gallery code for access)
- `date`: String (event date)
- `location`: String (event location)
- `description`: String (optional description)
- `password`: String (access password)
- `coverImageUrl`: String (optional cover image)
- `youtubeUrl`: String (optional YouTube video)
- `photoCount`: Number (total photos count)
- `active`: Boolean (gallery visibility status)
- `createdAt`: Timestamp
- `updatedAt`: Timestamp

### Photos Subcollection: `galleries/{galleryId}/photos`
**IMPORTANT**: Admin uploads save photos here, frontend reads from here
- `id`: String (document ID)
- `name`: String (file name)
- `url`: String (Firebase Storage URL)
- `size`: Number (file size in bytes)
- `contentType`: String (MIME type)
- `createdAt`: Timestamp
- `galleryId`: String (parent gallery reference)
- `uploadedBy`: String ('admin' | 'guest')
- `uploaderName`: String (optional, for guest uploads)
- `uploaderEmail`: String (optional, for guest uploads)

### Legacy Collections (Deprecated)
- `gallery-photos`: Legacy collection, no longer used for new uploads
- `photos`: Legacy global collection, no longer used

### Other Collections
- `likes`: User likes on photos/voice memos
- `comments`: User comments on photos/voice memos
- `voice-memos`: Audio messages from guests
- `password-requests`: Guest requests for gallery access
- `subscribers`: Email subscriptions for gallery updates

## Firebase Storage Structure

### Photos Storage: `gallery-photos/{galleryId}/`
Photo files organized by gallery ID:
- Original images compressed and optimized
- File naming: `{timestamp}_{originalName}`
- Supported formats: JPEG, PNG, WebP

### Cover Images: `galleries/covers/`
Gallery cover images:
- Naming pattern: `{galleryCode}_cover`

## Environment Variables

### Firebase Configuration
- `FIREBASE_PROJECT_ID`: Firebase project identifier
- `FIREBASE_CLIENT_EMAIL`: Service account email
- `FIREBASE_PRIVATE_KEY`: Service account private key
- `FIREBASE_STORAGE_BUCKET`: Storage bucket name

### Application Settings
- `VITE_BASE_PATH`: Base URL path ('/wedgallery/' for subdirectory)
- `VITE_FIREBASE_CONFIG`: Firebase client configuration
- `NODE_ENV`: Application environment (development/production)

### Email Configuration
- `SMTP_HOST`: Email server host
- `SMTP_PORT`: Email server port
- `SMTP_USER`: Email authentication username
- `SMTP_PASS`: Email authentication password

## Critical Fix - Photo Upload Flow

### Before Fix (Broken)
1. Admin uploads photos → Saved to `gallery-photos` collection
2. Gallery frontend reads → From `galleries/{galleryId}/photos` subcollection
3. **Result**: Photos not visible in gallery

### After Fix (Working)
1. Admin uploads photos → Saved to `galleries/{galleryId}/photos` subcollection
2. Gallery frontend reads → From `galleries/{galleryId}/photos` subcollection
3. **Result**: Photos visible immediately in gallery

### Upload Process
```
Admin Upload → Firebase Storage → galleries/{galleryId}/photos → Gallery Display
```

## Type Definitions

### PhotoData Interface
```typescript
interface PhotoData {
  id: string;
  name: string;
  url: string;
  contentType: string;
  size: number;
  createdAt: any;
  galleryId?: string;
  uploadedBy?: 'admin' | 'guest';
  uploaderName?: string;
  uploaderEmail?: string;
}
  position: number;
  chapterPosition?: number;
}
```

### PhotoWithChapter Type
```typescript
interface PhotoWithChapter {
  id: string;
  file: File;
  url: string;
  name: string;
  chapterId?: string;
  position: number;
  chapterPosition?: number;
  folderPath?: string;
}
```

### Chapter Type
```typescript
type Chapter = {
  id: string;
  title: string;
  description?: string;
  position: number;
}
```

### Gallery Type
```typescript
type Gallery = {
  id: string;
  name: string;
  code: string;
  password: string;
  date: string;
  location: string;
  photoCount: number;
  active: boolean;
  createdAt: Date;
  coverImageUrl?: string;
  youtubeUrl?: string;
  description?: string;
}
```

## Hook Usage

### useChapters Hook
Central hook for managing chapters and photo assignments:

```typescript
const {
  chapters,
  photos,
  setChapters,
  setPhotos,
  addChapter,
  removeChapter,
  updateChapter,
  moveChapter,
  assignPhotoToChapter,
  assignMultiplePhotosToChapter,
  processNewFolders
} = useChapters({
  initialChapters: [],
  initialPhotos: []
});
```

Key features:
- Chapter management (add, remove, update, reorder)
- Photo assignment to chapters
- Bulk photo operations
- Folder processing for automatic chapter creation
