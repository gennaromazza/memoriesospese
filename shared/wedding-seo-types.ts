export type WeddingStoryStatus = 'draft' | 'published';

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
  eventName?: string;
  eventDate?: string;
  receptionVenue?: string;
  receptionCity?: string;
  ceremonyVenue?: string;
  ceremonyCity?: string;
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
