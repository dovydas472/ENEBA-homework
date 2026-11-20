import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Global styles first: tokens.css defines the variables, global.css uses them.
// They must come before App so component CSS Modules can override the base styles.
import "./styles/tokens.css";
import "./styles/global.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
