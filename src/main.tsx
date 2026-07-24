import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";
import { registerPWA } from "./pwa-register";
import { installApiTelemetry } from "./lib/apiTelemetry";
import { installGlobalErrorReporter } from "./lib/errorReporter";
import { ErrorBoundary } from "./components/ErrorBoundary";

installApiTelemetry();
installGlobalErrorReporter();

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <HelmetProvider>
      <App />
    </HelmetProvider>
  </ErrorBoundary>,
);

registerPWA();
