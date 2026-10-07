import { useState } from "react";
import BlogManager, {
  type BlogManagerProps,
} from "@/components/admin/BlogManager";
import { BlogPostStatus, type BlogPost } from "@shared/schema";

const LEGACY_POST_ID = "legacy-post-for-e2e";
const LEGACY_COVER_URL = "https://example.invalid/legacy-cover.jpg";
const LEGACY_COVER_PATH = "blog-covers/legacy-post-for-e2e/cover.jpg";
const LEGACY_CONTENT_IMAGE_PATH =
  "blog-content-images/legacy-post-for-e2e/content.jpg";
const LEGACY_CONTENT_IMAGE_URL = `https://example.invalid/${LEGACY_CONTENT_IMAGE_PATH}`;

const legacyPost: BlogPost = {
  id: LEGACY_POST_ID,
  title: "Articolo legacy da modificare",
  slug: "articolo-legacy-da-modificare",
  excerpt: "Un articolo importato da una versione precedente.",
  content: `<p>Testo storico</p><p><img src="${LEGACY_CONTENT_IMAGE_URL}"></p>`,
  coverImage: LEGACY_COVER_URL,
  coverImageAlt: "Copertina storica del matrimonio",
  coverImagePath: LEGACY_COVER_PATH,
  contentImagePaths: [LEGACY_CONTENT_IMAGE_PATH],
  status: BlogPostStatus.DRAFT,
  author: "Gennaro Mazzacane",
  tags: ["legacy"],
  createdAt: {} as BlogPost["createdAt"],
};

/**
 * Harness usato esclusivamente dagli spec Playwright locali del Blog.
 * La route che lo monta è registrata solo dal dev server quando viene
 * esplicitamente attivata da VITE_BLOG_E2E_HARNESS.
 */
export default function BlogAdminE2EHarness() {
  const [savedPayload, setSavedPayload] = useState<{
    mode: string;
    content: string;
    coverImage?: string;
    coverImageAlt?: string;
    coverImagePath?: string;
    contentImagePaths: string[];
  } | null>(null);

  const persistBlogPost: NonNullable<BlogManagerProps["persistBlogPost"]> =
    async ({ mode, data }) => {
      // Lascia al test il tempo di osservare l'avviso accessibilità prima che
      // BlogManager mostri il toast di successo (il toaster mantiene un solo
      // messaggio alla volta).
      await new Promise((resolve) => setTimeout(resolve, 250));
      setSavedPayload({
        mode,
        content: String(data.content || ""),
        coverImage:
          typeof data.coverImage === "string" ? data.coverImage : undefined,
        coverImageAlt:
          typeof data.coverImageAlt === "string"
            ? data.coverImageAlt
            : undefined,
        coverImagePath:
          typeof data.coverImagePath === "string"
            ? data.coverImagePath
            : undefined,
        contentImagePaths: Array.isArray(data.contentImagePaths)
          ? data.contentImagePaths.map(String)
          : [],
      });
    };

  return (
    <main className="min-h-screen bg-off-white p-6">
      <BlogManager
        persistBlogPost={persistBlogPost}
        isBlogSlugUnique={async () => true}
        loadBlogPosts={async () => [legacyPost]}
      />
      <output data-testid="e2e-save-payload" className="hidden">
        {savedPayload ? JSON.stringify(savedPayload) : ""}
      </output>
    </main>
  );
}