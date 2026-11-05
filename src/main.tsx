import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

try {
  const th = localStorage.getItem("twopaths-theme");
  if (th) document.documentElement.setAttribute("data-theme", th);
} catch {
  /* ignore */
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
