// client/src/main.tsx
import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Router } from "wouter";
import App from "./App";
import "./index.css";
import { StudioProvider } from "./context/StudioContext";

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
          <App />
        </Router>
      </StudioProvider>
    </StrictMode>,
  );
}
