import BlogManager from "@/components/admin/BlogManager";

/**
 * Harness usato esclusivamente dagli spec Playwright locali del Blog.
 * La route che lo monta è registrata solo dal dev server quando viene
 * esplicitamente attivata da VITE_BLOG_E2E_HARNESS.
 */
export default function BlogAdminE2EHarness() {
  return (
    <main className="min-h-screen bg-off-white p-6">
      <BlogManager />
    </main>
  );
}