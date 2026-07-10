import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { GlobalStateProvider } from "@/contexts/GlobalStateContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import { VoipProvider } from "@/contexts/VoipContext";
import { WavoipWebphoneProvider } from "@/contexts/WavoipWebphoneContext";
import { VideoCallProvider } from "@/contexts/VideoCallContext";

// Rotas leves / críticas — carregamento imediato
import Dashboard from "./pages/Dashboard";
import AuthCallbackPage from "./pages/AuthCallbackPage";
import NotFound from "./pages/NotFound";
import { CookieConsentBanner } from "./components/CookieConsentBanner";

// Lazy — cada página vira um chunk sob demanda
const ToolsPage = lazy(() => import("./pages/ToolsPage"));
const ChatPage = lazy(() => import("./pages/ChatPage"));
const CallsPage = lazy(() => import("./pages/CallsPage"));
const TicketsPage = lazy(() => import("./pages/TicketsPage"));
const TeamPage = lazy(() => import("./pages/TeamPage"));
const AIAgentsPage = lazy(() => import("./pages/AIAgentsPage"));
const EditAgentPage = lazy(() => import("./pages/EditAgentPage"));
const ReportsPage = lazy(() => import("./pages/ReportsPage"));
const PipelinePage = lazy(() => import("./pages/PipelinePage"));
const DeveloperPage = lazy(() => import("./pages/DeveloperPage"));
const WavoipPage = lazy(() => import("./components/settings/WavoipConfigTab"));
const AccountSettingsPage = lazy(() => import("./pages/AccountSettingsPage"));
const APIKeysPage = lazy(() => import("./pages/APIKeysPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const WhatsAppPage = lazy(() => import("./pages/WhatsAppPage"));
const VideoCallsPage = lazy(() => import("./pages/VideoCallsPage"));
const AutomationsPage = lazy(() => import("./pages/AutomationsPage"));
const CadastrosPage = lazy(() => import("./pages/CadastrosPage"));
const CEODashboardPage = lazy(() => import("./pages/CEODashboardPage"));
const BackendStatusPage = lazy(() => import("./pages/BackendStatusPage"));
const SubLoginPage = lazy(() => import("./pages/SubLoginPage"));
const DocumentationPage = lazy(() => import("./pages/DocumentationPage"));
const PublicStatusPage = lazy(() => import("./pages/PublicStatusPage"));
const VideoJoinPage = lazy(() => import("./pages/VideoJoinPage"));
const SignaturePortalPage = lazy(() => import("./pages/SignaturePortalPage"));
const SignaturesPage = lazy(() => import("./pages/SignaturesPage"));
const ThreeCxDashboardPage = lazy(() => import("./pages/ThreeCxDashboardPage"));
const LeadsCapturePage = lazy(() => import("./pages/ceo/LeadsCapturePage"));
const CallsPerformancePage = lazy(() => import("./pages/ceo/CallsPerformancePage"));
const SignaturesPerformancePage = lazy(() => import("./pages/ceo/SignaturesPerformancePage"));
const OutrosPage = lazy(() => import("./pages/OutrosPage"));
const LandingBuilderPage = lazy(() => import("./pages/LandingBuilderPage"));
const LandingPreviewPage = lazy(() => import("./pages/LandingPreviewPage"));
const PublicLandingPage = lazy(() => import("./pages/PublicLandingPage"));
const InternalTelemetryPage = lazy(() => import("./pages/InternalTelemetryPage"));
const RoleLabelAuditPage = lazy(() => import("./pages/RoleLabelAuditPage"));
const BotFlowsPage = lazy(() => import("./pages/BotFlowsPage"));
const OwnerDashboardPage = lazy(() => import("./pages/OwnerDashboardPage"));
const AccessHealthPage = lazy(() => import("./pages/owner/AccessHealthPage"));
const AuditTrailPage = lazy(() => import("./pages/owner/AuditTrailPage"));
const PlatformHealthPage = lazy(() => import("./pages/owner/PlatformHealthPage"));
const CompanyDetailPage = lazy(() => import("./pages/owner/CompanyDetailPage"));
const InternalCommsPage = lazy(() => import("./pages/InternalCommsPage"));
const InternalCommsAuditPage = lazy(() => import("./pages/owner/InternalCommsAuditPage"));

/**
 * React Query com defaults calibrados para reduzir refetches redundantes.
 * - staleTime 30s: dados considerados frescos por meio minuto (evita duplo fetch quando componentes montam em cadeia).
 * - gcTime 5min: cache mantido por 5 minutos após queries ficarem inativas (navegação rápida entre páginas reaproveita cache).
 * - refetchOnWindowFocus false: evita rajadas de requests ao alternar abas.
 * - retry 1: falhas transitórias tentam 1x; erros persistentes falham rápido para o usuário ver o feedback.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const RouteFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <GlobalStateProvider>
        <TooltipProvider>
        <Toaster />
        <Sonner />
        {/* Banner LGPD desativado temporariamente — componente preservado em src/components/CookieConsentBanner.tsx */}
        {false && <CookieConsentBanner />}
        <BrowserRouter>
          <AuthProvider>
            <VoipProvider>
            <WavoipWebphoneProvider>
            <VideoCallProvider>
            <Suspense fallback={<RouteFallback />}>
            <Routes>
              {/* Rota pública — recebe tokens da página externa */}
              <Route path="/auth/callback" element={<AuthCallbackPage />} />
              <Route path="/s/:subId/login" element={<SubLoginPage />} />
              <Route path="/status-view" element={<PublicStatusPage />} />
              <Route path="/video/join/:roomId" element={<VideoJoinPage />} />
              <Route path="/sign/:token" element={<SignaturePortalPage />} />
              <Route path="/p/:slug" element={<PublicLandingPage />} />

              {/* Rotas protegidas */}
              <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/ferramentas" element={<ProtectedRoute><ToolsPage /></ProtectedRoute>} />
              <Route path="/chat" element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
              <Route path="/calls" element={<ProtectedRoute><CallsPage /></ProtectedRoute>} />
              <Route path="/tickets" element={<ProtectedRoute><TicketsPage /></ProtectedRoute>} />
              <Route path="/team" element={<ProtectedRoute><TeamPage /></ProtectedRoute>} />
              <Route path="/ai-agents" element={<ProtectedRoute><AIAgentsPage /></ProtectedRoute>} />
              <Route path="/ai-agents/:id/editar" element={<ProtectedRoute><EditAgentPage /></ProtectedRoute>} />
              <Route path="/reports" element={<ProtectedRoute><ReportsPage /></ProtectedRoute>} />
              <Route path="/pipeline" element={<ProtectedRoute><PipelinePage /></ProtectedRoute>} />
              <Route path="/signatures" element={<ProtectedRoute pageKey="signatures"><SignaturesPage /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute><AccountSettingsPage /></ProtectedRoute>} />
              <Route path="/developer" element={<ProtectedRoute pageKey="developer"><DeveloperPage /></ProtectedRoute>} />
              <Route path="/api-keys" element={<ProtectedRoute><APIKeysPage /></ProtectedRoute>} />
              <Route path="/wavoip" element={<ProtectedRoute pageKey="wavoip"><WavoipPage standalone={true} /></ProtectedRoute>} />
              <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
              <Route path="/whatsapp" element={<ProtectedRoute><WhatsAppPage /></ProtectedRoute>} />
              {/* Meeting é recurso premium — liberado apenas ao dono da plataforma. */}
              <Route path="/video" element={<ProtectedRoute ownerOnly><VideoCallsPage /></ProtectedRoute>} />
              <Route path="/automations" element={<ProtectedRoute><AutomationsPage /></ProtectedRoute>} />
              <Route path="/3cx" element={<ProtectedRoute><ThreeCxDashboardPage /></ProtectedRoute>} />
              <Route path="/cadastros" element={<ProtectedRoute><CadastrosPage /></ProtectedRoute>} />
              <Route path="/ceo" element={<ProtectedRoute pageKey="ceo"><CEODashboardPage /></ProtectedRoute>} />
              <Route path="/ceo/leads-capture" element={<ProtectedRoute pageKey="ceo"><LeadsCapturePage /></ProtectedRoute>} />
              <Route path="/ceo/calls" element={<ProtectedRoute pageKey="ceo"><CallsPerformancePage /></ProtectedRoute>} />
              <Route path="/ceo/signatures" element={<ProtectedRoute pageKey="ceo"><SignaturesPerformancePage /></ProtectedRoute>} />

              <Route path="/outros" element={<ProtectedRoute pageKey="outros"><OutrosPage /></ProtectedRoute>} />
              <Route path="/outros/:id/editar" element={<ProtectedRoute pageKey="outros"><LandingBuilderPage /></ProtectedRoute>} />
              <Route path="/outros/:id/preview" element={<ProtectedRoute pageKey="outros"><LandingPreviewPage /></ProtectedRoute>} />
              <Route path="/status" element={<ProtectedRoute ownerOnly><BackendStatusPage /></ProtectedRoute>} />
              <Route path="/documentation" element={<ProtectedRoute pageKey="documentation"><DocumentationPage /></ProtectedRoute>} />
              <Route path="/internal/telemetry" element={<ProtectedRoute ownerOnly><InternalTelemetryPage /></ProtectedRoute>} />
              <Route path="/internal/role-label-audit" element={<ProtectedRoute ownerOnly><RoleLabelAuditPage /></ProtectedRoute>} />
              <Route path="/bot-flows" element={<ProtectedRoute><BotFlowsPage /></ProtectedRoute>} />
              <Route path="/owner" element={<ProtectedRoute ownerOnly><OwnerDashboardPage /></ProtectedRoute>} />
              <Route path="/owner/access-health" element={<ProtectedRoute ownerOnly><AccessHealthPage /></ProtectedRoute>} />
              <Route path="/owner/audit-trail" element={<ProtectedRoute ownerOnly><AuditTrailPage /></ProtectedRoute>} />
              <Route path="/owner/platform-health" element={<ProtectedRoute ownerOnly><PlatformHealthPage /></ProtectedRoute>} />
              <Route path="/owner/company/:id" element={<ProtectedRoute ownerOnly><CompanyDetailPage /></ProtectedRoute>} />
              <Route path="/internal-comms" element={<ProtectedRoute><InternalCommsPage /></ProtectedRoute>} />

              <Route path="*" element={<NotFound />} />
            </Routes>
            </Suspense>
            </VideoCallProvider>
            </WavoipWebphoneProvider>
            </VoipProvider>
          </AuthProvider>
        </BrowserRouter>
        </TooltipProvider>
      </GlobalStateProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
