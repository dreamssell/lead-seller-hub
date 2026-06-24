import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { registerPWA } from "./pwa-register";
import { installApiTelemetry } from "./lib/apiTelemetry";

installApiTelemetry();

createRoot(document.getElementById("root")!).render(<App />);

registerPWA();
