import { useEffect } from 'react';
import PhotobooksManager from '@/components/photobook/PhotobooksManager';
import type { Gallery } from '@/lib/galleries';
import type { Job } from '@shared/jobs-types';

const JOB_ID = 'job-with-late-galleries';
const FIRST_GALLERY_ID = 'gallery-first-linked';
const SECOND_GALLERY_ID = 'gallery-second-linked';

const jobWithLinkedGalleries = {
  id: JOB_ID,
  nomeEvento: 'Matrimonio con gallerie in ritardo',
  clientNames: ['Cliente Test'],
  clientiIds: ['client-test'],
  galleryIds: [FIRST_GALLERY_ID, SECOND_GALLERY_ID],
} as Job;

const linkedGalleries = [
  {
    id: FIRST_GALLERY_ID,
    name: 'Prima galleria collegata',
    code: 'FIRST-LINKED',
    photoCount: 10,
    active: true,
    jobId: JOB_ID,
  },
  {
    id: SECOND_GALLERY_ID,
    name: 'Seconda galleria collegata',
    code: 'SECOND-LINKED',
    photoCount: 20,
    active: true,
    jobId: JOB_ID,
  },
] as Gallery[];

declare global {
  interface Window {
    __photobookE2EReleaseGalleries?: () => void;
  }
}

/**
 * Harness dev-only per verificare nel browser il riallineamento asincrono
 * Job → galleria usando il vero PhotobooksManager.
 */
export default function PhotobookJobGalleryE2EHarness() {
  useEffect(() => () => {
    delete window.__photobookE2EReleaseGalleries;
  }, []);

  return (
    <main className="min-h-screen bg-off-white p-6">
      <PhotobooksManager
        loadJobs={async () => [jobWithLinkedGalleries]}
        loadGalleries={() =>
          new Promise<Gallery[]>((resolve) => {
            window.__photobookE2EReleaseGalleries = () => {
              delete window.__photobookE2EReleaseGalleries;
              resolve(linkedGalleries);
            };
          })
        }
      />
    </main>
  );
}