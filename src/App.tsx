import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/contexts/ThemeContext";
import Dashboard from "./pages/Dashboard";
import ChatPage from "./pages/ChatPage";
import CallsPage from "./pages/CallsPage";
import TicketsPage from "./pages/TicketsPage";
import TeamPage from "./pages/TeamPage";
import AIAgentsPage from "./pages/AIAgentsPage";
import ReportsPage from "./pages/ReportsPage";
import PipelinePage from "./pages/PipelinePage";
import SettingsPage from "./pages/SettingsPage";
import APIKeysPage from "./pages/APIKeysPage";
import ProfilePage from "./pages/ProfilePage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/calls" element={<CallsPage />} />
            <Route path="/tickets" element={<TicketsPage />} />
            <Route path="/team" element={<TeamPage />} />
            <Route path="/ai-agents" element={<AIAgentsPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/pipeline" element={<PipelinePage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/api-keys" element={<APIKeysPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
