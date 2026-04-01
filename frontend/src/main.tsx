import { StrictMode } from "react";
import "./theme.css";
import "./index.css";
import { initTheme } from "./theme";

initTheme();
import { createRoot } from "react-dom/client";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
