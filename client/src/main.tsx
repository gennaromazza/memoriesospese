import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import { StudioProvider } from "./context/StudioContext";

const basename = import.meta.env.BASE_URL; // in dev “/”, in prod “/memoriesospese/”

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StudioProvider>
      <BrowserRouter basename={basename}>
        <App />
      </BrowserRouter>
    </StudioProvider>
  </StrictMode>
);
