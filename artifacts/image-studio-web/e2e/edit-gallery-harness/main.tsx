import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import EditGalleryModal from "../../src/components/EditGalleryModal";
import { resetFakeStore } from "./stubs/firestore";

const fixtures = {
  legacy: { id: "legacy-gallery", name: "Legacy gallery", date: "2025-06-15", location: "", description: "" },
  withA: { id: "gallery-with-a", name: "Job gallery", code: "JOB123", date: "2025-06-15", location: "", description: "", jobId: "job-A", jobType: "wedding" },
  unlinked: { id: "unlinked-gallery", name: "Unlinked gallery", code: "UNLINKED", date: "2025-06-15", location: "", description: "" },
};
const jobs = [
  { id: "job-A", nomeEvento: "Fixture Job A", jobType: "wedding", clienteIds: [], galleryIds: [] },
  { id: "job-B", nomeEvento: "Fixture Job B", jobType: "portrait", clienteIds: [], galleryIds: [] },
];
function App() {
  const [gallery, setGallery] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<any>(null);
  useEffect(() => {
    const handler = (e: any) => setToast(e.detail);
    window.addEventListener("edit-gallery-toast", handler);
    return () => window.removeEventListener("edit-gallery-toast", handler);
  }, []);
  function launch(key: keyof typeof fixtures) {
    const data = structuredClone(fixtures[key]);
    resetFakeStore(data, jobs.map(job => ({ ...job, galleryIds: data.jobId === job.id ? [data.id] : [] })));
    setToast(null);
    setGallery(data);
    setOpen(true);
  }
  return <main>
    <h1>Isolated EditGalleryModal regression harness</h1>
    <button onClick={() => launch("legacy")}>Open legacy fixture</button>
    <button onClick={() => launch("withA")}>Open gallery linked to A</button>
    <button onClick={() => launch("unlinked")}>Open unlinked fixture</button>
    <button onClick={() => { if (window.__fakeStore) window.__fakeStore.failNextBatch = true; }}>Inject next batch failure</button>
    {toast && <div role="status" aria-label="Harness toast">{toast.title}: {toast.description}</div>}
    <EditGalleryModal key={gallery?.id || "none"} isOpen={open} onClose={() => setOpen(false)} gallery={gallery} />
  </main>;
}
createRoot(document.getElementById("root")!).render(<App />);