import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import { VoipProvider } from "@/contexts/VoipContext";
import Dashboard from "./pages/Dashboard";
import ChatPage from "./pages/ChatPage";
import CallsPage from "./pages/CallsPage";
import TicketsPage from "./pages/TicketsPage";
import TeamPage from "./pages/TeamPage";
import AIAgentsPage from "./pages/AIAgentsPage";
import EditAgentPage from "./pages/EditAgentPage";
import ReportsPage from "./pages/ReportsPage";
import PipelinePage from "./pages/PipelinePage";
import SettingsPage from "./pages/SettingsPage";
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
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <VoipProvider>
            <Routes>
              {/* Rota pública — recebe tokens da página externa */}
              <Route path="/auth/callback" element={<AuthCallbackPage />} />
              <Route path="/s/:subId/login" element={<SubLoginPage />} />


              {/* Rotas protegidas */}
              <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/chat" element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
              <Route path="/calls" element={<ProtectedRoute><CallsPage /></ProtectedRoute>} />
              <Route path="/tickets" element={<ProtectedRoute><TicketsPage /></ProtectedRoute>} />
              <Route path="/team" element={<ProtectedRoute><TeamPage /></ProtectedRoute>} />
              <Route path="/ai-agents" element={<ProtectedRoute><AIAgentsPage /></ProtectedRoute>} />
              <Route path="/reports" element={<ProtectedRoute><ReportsPage /></ProtectedRoute>} />
              <Route path="/pipeline" element={<ProtectedRoute><PipelinePage /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
              <Route path="/api-keys" element={<ProtectedRoute><APIKeysPage /></ProtectedRoute>} />
              <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
              <Route path="/whatsapp" element={<ProtectedRoute><WhatsAppPage /></ProtectedRoute>} />
              <Route path="/video" element={<ProtectedRoute><VideoCallsPage /></ProtectedRoute>} />
              <Route path="/automations" element={<ProtectedRoute><AutomationsPage /></ProtectedRoute>} />
              <Route path="/cadastros" element={<ProtectedRoute><CadastrosPage /></ProtectedRoute>} />
              <Route path="/ceo" element={<ProtectedRoute><CEODashboardPage /></ProtectedRoute>} />
              <Route path="/status" element={<ProtectedRoute><BackendStatusPage /></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            </VoipProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
