// client/src/main.tsx
import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Router } from "wouter";
import App from "./App";
import "./index.css";

// Normalizza eventuali // nel path (es. /memoriesospese//gallery/ID)
(() => {
  const { pathname, search, hash } = window.location;
  const normalized = pathname.replace(/\/{2,}/g, "/");
  if (normalized !== pathname) {
    window.history.replaceState({}, "", normalized + search + hash);
  }
})();

// Usa lo stesso valore già normalizzato da vite.config.ts per asset e router.
// In questo modo una configurazione incoerente non può produrre una SPA bianca
// sui deep link.
const basename = (__VITE_BASE_PATH__ || "/").replace(/\/+$/, "");

const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(
    <StrictMode>
      <Router base={basename}>
        <App />
      </Router>
    </StrictMode>,
  );
}
