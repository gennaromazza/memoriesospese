import WeddingSeoDraftPanel from "@/components/WeddingSeoDraftPanel";
import type { Gallery } from "@/lib/galleries";

const gallery = {
  id: "e2e-real-wedding-fallback",
  name: "Andrea e Justine",
  code: "E2E-REAL-WEDDING",
  date: "2026-06-12",
  location: "Aversa",
  photoCount: 0,
  active: true,
  jobId: "e2e-wedding-job",
  jobType: "matrimonio",
} as Gallery;

/**
 * Harness dev-only per verificare nel browser il pannello Real Wedding.
 * Le API editoriali vengono intercettate dallo spec Playwright: nessun
 * documento Firebase e nessun provider IA reale sono coinvolti.
 */
export default function WeddingSeoDraftE2EHarness() {
  return (
    <main className="min-h-screen bg-off-white p-6">
      <WeddingSeoDraftPanel gallery={gallery} photos={[]} />
    </main>
  );
}