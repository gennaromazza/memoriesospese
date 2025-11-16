// client/src/main.tsx
import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Router, Route } from "wouter";
import App from "./App";
import "./index.css";
import { StudioProvider } from "./context/StudioContext";
import QuotePublicViewPage from './pages/QuotePublicViewPage';
import QuoteSignedPortalPage from './pages/QuoteSignedPortalPage';
import ConsultationBooking from './pages/ConsultationBooking';
import CollaboratorAssignmentResponse from './pages/CollaboratorAssignmentResponse';
import ConsultationIndex from './pages/ConsultationIndex'; // Assuming this exists based on usage
import NotFound from './pages/NotFound'; // Assuming this exists based on usage


// Normalizza eventuali // nel path (es. /memoriesospese//gallery/ID)
(() => {
  const { pathname, search, hash } = window.location;
  const normalized = pathname.replace(/\/{2,}/g, "/");
  if (normalized !== pathname) {
    window.history.replaceState({}, "", normalized + search + hash);
  }
})();

// Basename per Wouter, SENZA slash finale: "/memoriesospese"
const basename = (import.meta.env.VITE_BASE_PATH || "/").replace(/\/+$/, "");

const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(
    <StrictMode>
      <StudioProvider>
        <Router base={basename}>
          <Route path="/consultations/book" component={ConsultationBooking} />
          <Route path="/consultations" component={ConsultationIndex} />
          <Route path="/collaboratori/assignment/:assignmentId/:action" component={CollaboratorAssignmentResponse} />
          <Route component={NotFound} />
        </Router>
      </StudioProvider>
    </StrictMode>,
  );
}