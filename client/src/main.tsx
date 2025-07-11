import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { AuthProvider } from "./context/AuthContext";
import { StudioProvider } from "./context/StudioContext";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <StudioProvider>
        <App />
      </StudioProvider>
    </AuthProvider>
  </StrictMode>
);
