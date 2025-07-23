import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { StudioProvider } from "./context/StudioContext";

const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(
    <StrictMode>
      <StudioProvider>
        <App />
      </StudioProvider>
    </StrictMode>
  );
}