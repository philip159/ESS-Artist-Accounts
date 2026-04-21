import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Supabase uses a browser lock to synchronise auth-token access across tabs.
// When two tabs compete simultaneously the losing tab throws a benign
// "lock was released because another request stole it" rejection.
// This is harmless — the winning tab holds a valid session — but the Vite
// dev overlay treats it as a fatal error. Suppress it globally so the UX
// stays clean in both dev and production.
window.addEventListener("unhandledrejection", (event) => {
  const msg = event.reason?.message ?? String(event.reason ?? "");
  if (msg.includes("lock") && msg.toLowerCase().includes("stole")) {
    event.preventDefault();
  }
});

createRoot(document.getElementById("root")!).render(<App />);
