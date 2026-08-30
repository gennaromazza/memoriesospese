export type WeddingStoryStatus = 'draft' | 'published';

export const WEDDING_STORY_LIMITS = {
  title: 140,
  excerpt: 500,
  story: 30_000,
  seoTitle: 70,
  seoDescription: 170,
} as const;

export interface WeddingStorySource {
  id: string;
  submissionId: string;
  fieldId: string;
  label: string;
  value?: unknown;
  clientName: string;
  category: 'story' | 'vendor';
  consentGranted: boolean;
  legacyImported?: boolean;
}

export interface WeddingSeoStory {
  id: string;
  galleryId: string;
  jobId: string;
  status: WeddingStoryStatus;
  slug: string;
  title: string;
  excerpt: string;
  story: string;
  seoTitle: string;
  seoDescription: string;
  selectedPhotoIds: string[];
  /** Foto usata come hero della pagina e copertina nelle liste editoriali. */
  coverPhotoId?: string;
  approvedSourceIds: string[];
  createdAt?: any;
  updatedAt?: any;
  publishedAt?: any;
}

export interface WeddingStoryPhoto {
  id: string;
  name: string;
  url: string;
  thumbnailUrl?: string;
  chapterId?: string | null;
  chapterTitle?: string;
}

export interface WeddingStoryVendor {
  name: string;
  role: string;
  url?: string;
}

export interface WeddingEditorialJobFacts {
  coupleNames: string[];
  coupleSurnames?: string[];
  eventName?: string;
  eventDate?: string;
  receptionVenue?: string;
  receptionCity?: string;
  receptionProvince?: string;
  receptionPlaceType?: string;
  ceremonyVenue?: string;
  ceremonyCity?: string;
  ceremonyProvince?: string;
  ceremonyPlaceType?: string;
  clientCities: string[];
}

export interface WeddingStoryEditorContext {
  story: WeddingSeoStory | null;
  gallery: {
    id: string;
    name: string;
    date?: string;
    location?: string;
    jobId?: string;
    jobType?: string;
  };
  sources: WeddingStorySource[];
  jobFacts?: WeddingEditorialJobFacts | null;
  warning?: string;
}

export interface PublicWeddingStory {
  slug: string;
  title: string;
  excerpt: string;
  story: string;
  seoTitle: string;
  seoDescription: string;
  publishedAt?: any;
  photos: WeddingStoryPhoto[];
  vendors: WeddingStoryVendor[];
}

/** Dati minimi, privi di informazioni riservate, per le liste editoriali pubbliche. */
export interface PublicWeddingStoryPreview {
  slug: string;
  title: string;
  excerpt: string;
  publishedAt?: any;
  coverImage?: string;
}
