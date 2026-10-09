import { createRoot } from 'react-dom/client';
import WeddingSeoDraftPanel from '@/components/WeddingSeoDraftPanel';
import type { Gallery } from '@/lib/galleries';
import type { Photo } from '@/lib/photos';

const gallery = {
  id: 'e2e-wedding-cover',
  name: 'Matrimonio Anna e Luca',
  code: 'e2e-wedding-cover',
  jobType: 'matrimonio',
  date: '2026-06-20',
  location: 'Roma',
  photoCount: 2,
  active: true,
  chapters: [
    { id: 'chapter-cerimonia', titolo: 'Cerimonia', ordine: 0 },
    { id: 'chapter-ritratto', titolo: 'Ritratto', ordine: 1 },
  ],
} as Gallery;

const photos: Photo[] = [
  {
    id: 'photo-1',
    galleryId: gallery.id,
    name: 'cerimonia.jpg',
    url: 'https://images.example.test/wedding-e2e/photo-1.svg',
    thumbnailUrl: 'https://images.example.test/wedding-e2e/photo-1.svg',
    contentType: 'image/svg+xml',
    size: 1,
    uploaderUid: 'e2e',
    uploaderEmail: 'e2e@example.test',
    uploaderName: 'E2E',
    likeCount: 0,
    commentCount: 0,
    position: 0,
    createdAt: '2026-06-20T10:00:00.000Z',
  },
  {
    id: 'photo-2',
    galleryId: gallery.id,
    name: 'ritratto.jpg',
    url: 'https://images.example.test/wedding-e2e/photo-2.svg',
    thumbnailUrl: 'https://images.example.test/wedding-e2e/photo-2.svg',
    contentType: 'image/svg+xml',
    size: 1,
    uploaderUid: 'e2e',
    uploaderEmail: 'e2e@example.test',
    uploaderName: 'E2E',
    likeCount: 0,
    commentCount: 0,
    position: 1,
    createdAt: '2026-06-20T10:01:00.000Z',
  },
];

const duplicateNamePhotos: Photo[] = [
  { ...photos[0], name: 'momento.jpg', chapterId: 'chapter-cerimonia' },
  { ...photos[1], name: 'momento.jpg', chapterId: 'chapter-ritratto' },
];
const fixturePhotos = new URLSearchParams(window.location.search).has('same-name')
  ? duplicateNamePhotos
  : photos;

createRoot(document.getElementById('root')!).render(
  <WeddingSeoDraftPanel gallery={gallery} photos={fixturePhotos} />,
);
