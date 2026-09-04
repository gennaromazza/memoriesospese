import { useState } from "react";
import BlogManager, {
  type BlogManagerProps,
} from "@/components/admin/BlogManager";

/**
 * Harness usato esclusivamente dagli spec Playwright locali del Blog.
 * La route che lo monta è registrata solo dal dev server quando viene
 * esplicitamente attivata da VITE_BLOG_E2E_HARNESS.
 */
export default function BlogAdminE2EHarness() {
  const [savedPayload, setSavedPayload] = useState<{
    mode: string;
    content: string;
    coverImageAlt?: string;
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
        coverImageAlt:
          typeof data.coverImageAlt === "string"
            ? data.coverImageAlt
            : undefined,
      });
    };

  return (
    <main className="min-h-screen bg-off-white p-6">
      <BlogManager
        persistBlogPost={persistBlogPost}
        isBlogSlugUnique={async () => true}
      />
      <output data-testid="e2e-save-payload" className="hidden">
        {savedPayload ? JSON.stringify(savedPayload) : ""}
      </output>
    </main>
  );
}