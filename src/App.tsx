import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { LoginPage } from "@/components/LoginPage";
import ClientDashboard from "@/pages/ClientDashboard";
import NotFound from "./pages/NotFound";
import { SidebarPreview } from "@/pages/SidebarPreview";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LoginPage />} />
          {/* Legacy redirects */}
          <Route path="/dashboard" element={<Navigate to="/home" replace />} />
          <Route path="/dashboard/ecommerce" element={<Navigate to="/ecommerce" replace />} />
          <Route path="/crm" element={<Navigate to="/home" replace />} />
          {/* New routes */}
          <Route path="/home" element={<ClientDashboard />} />
          <Route path="/leadgen" element={<ClientDashboard />} />
          <Route path="/leadgen/:slug/dashboard" element={<ClientDashboard />} />
          <Route path="/leadgen/:slug/crm" element={<ClientDashboard />} />
          <Route path="/ecommerce" element={<ClientDashboard />} />
          <Route path="/ecommerce/notifications" element={<ClientDashboard />} />
          <Route path="/clients" element={<ClientDashboard />} />
          <Route path="/settings/clients" element={<ClientDashboard />} />
          <Route path="/settings/team" element={<ClientDashboard />} />
          <Route path="/ecommerce/:slug" element={<ClientDashboard />} />
          {/* Creative Lab */}
          <Route path="/creative" element={<ClientDashboard />} />
          <Route path="/creative/:slug" element={<ClientDashboard />} />
          <Route path="/creative/:slug/brand" element={<ClientDashboard />} />
          <Route path="/creative/:slug/new" element={<ClientDashboard />} />
          <Route path="/creative/:slug/brief/:briefId" element={<ClientDashboard />} />
          <Route path="/creative/:slug/competitors" element={<ClientDashboard />} />
          <Route path="/preview" element={<SidebarPreview />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
