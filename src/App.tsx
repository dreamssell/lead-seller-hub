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
import Dashboard from "./pages/Dashboard";
import ChatPage from "./pages/ChatPage";
import CallsPage from "./pages/CallsPage";
import TicketsPage from "./pages/TicketsPage";
import TeamPage from "./pages/TeamPage";
import AIAgentsPage from "./pages/AIAgentsPage";
import EditAgentPage from "./pages/EditAgentPage";
import ReportsPage from "./pages/ReportsPage";
import PipelinePage from "./pages/PipelinePage";
import DeveloperPage from "./pages/DeveloperPage";
import WavoipPage from "./components/settings/WavoipConfigTab";
import AccountSettingsPage from "./pages/AccountSettingsPage";
import APIKeysPage from "./pages/APIKeysPage";
import ProfilePage from "./pages/ProfilePage";
import AuthCallbackPage from "./pages/AuthCallbackPage";
import WhatsAppPage from "./pages/WhatsAppPage";
import VideoCallsPage from "./pages/VideoCallsPage";
import AutomationsPage from "./pages/AutomationsPage";
import CadastrosPage from "./pages/CadastrosPage";
import CEODashboardPage from "./pages/CEODashboardPage";
import BackendStatusPage from "./pages/BackendStatusPage";
import SubLoginPage from "./pages/SubLoginPage";
import DocumentationPage from "./pages/DocumentationPage";
import PublicStatusPage from "./pages/PublicStatusPage";
import NotFound from "./pages/NotFound";
import VideoJoinPage from "./pages/VideoJoinPage";
import SignaturePortalPage from "./pages/SignaturePortalPage";
import SignaturesPage from "./pages/SignaturesPage";
import ThreeCxDashboardPage from "./pages/ThreeCxDashboardPage";
import LeadsCapturePage from "./pages/ceo/LeadsCapturePage";
import CallsPerformancePage from "./pages/ceo/CallsPerformancePage";
import SignaturesPerformancePage from "./pages/ceo/SignaturesPerformancePage";
import OutrosPage from "./pages/OutrosPage";
import LandingBuilderPage from "./pages/LandingBuilderPage";
import LandingPreviewPage from "./pages/LandingPreviewPage";
import PublicLandingPage from "./pages/PublicLandingPage";
import InternalTelemetryPage from "./pages/InternalTelemetryPage";
import BotFlowsPage from "./pages/BotFlowsPage";
import { CookieConsentBanner } from "./components/CookieConsentBanner";





const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <GlobalStateProvider>
        <TooltipProvider>
        <Toaster />
        <Sonner />
        <CookieConsentBanner />
        <BrowserRouter>
          <AuthProvider>
            <VoipProvider>
            <WavoipWebphoneProvider>
            <VideoCallProvider>
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
              <Route path="/developer" element={<ProtectedRoute ownerOnly><DeveloperPage /></ProtectedRoute>} />
              <Route path="/api-keys" element={<ProtectedRoute><APIKeysPage /></ProtectedRoute>} />
              <Route path="/wavoip" element={<ProtectedRoute pageKey="wavoip"><WavoipPage standalone={true} /></ProtectedRoute>} />
              <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
              <Route path="/whatsapp" element={<ProtectedRoute><WhatsAppPage /></ProtectedRoute>} />
              <Route path="/video" element={<ProtectedRoute><VideoCallsPage /></ProtectedRoute>} />
              <Route path="/automations" element={<ProtectedRoute><AutomationsPage /></ProtectedRoute>} />
              <Route path="/3cx" element={<ProtectedRoute><ThreeCxDashboardPage /></ProtectedRoute>} />
              <Route path="/cadastros" element={<ProtectedRoute><CadastrosPage /></ProtectedRoute>} />
              <Route path="/ceo" element={<ProtectedRoute><CEODashboardPage /></ProtectedRoute>} />
              <Route path="/ceo/leads-capture" element={<ProtectedRoute><LeadsCapturePage /></ProtectedRoute>} />
              <Route path="/ceo/calls" element={<ProtectedRoute><CallsPerformancePage /></ProtectedRoute>} />
              <Route path="/ceo/signatures" element={<ProtectedRoute><SignaturesPerformancePage /></ProtectedRoute>} />
              <Route path="/outros" element={<ProtectedRoute pageKey="outros"><OutrosPage /></ProtectedRoute>} />
              <Route path="/outros/:id/editar" element={<ProtectedRoute pageKey="outros"><LandingBuilderPage /></ProtectedRoute>} />
              <Route path="/outros/:id/preview" element={<ProtectedRoute pageKey="outros"><LandingPreviewPage /></ProtectedRoute>} />
              <Route path="/status" element={<ProtectedRoute ownerOnly><BackendStatusPage /></ProtectedRoute>} />
              <Route path="/documentation" element={<ProtectedRoute pageKey="documentation"><DocumentationPage /></ProtectedRoute>} />
              <Route path="/internal/telemetry" element={<ProtectedRoute ownerOnly><InternalTelemetryPage /></ProtectedRoute>} />
              <Route path="/bot-flows" element={<ProtectedRoute><BotFlowsPage /></ProtectedRoute>} />

              <Route path="*" element={<NotFound />} />
            </Routes>
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
