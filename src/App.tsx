import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import LandingPage from "@/pages/LandingPage";
import CheckEmailPage from "@/pages/CheckEmailPage";
import VerifyPage from "@/pages/VerifyPage";
import AnalyzePage from "@/pages/AnalyzePage";
import WaitingPage from "@/pages/WaitingPage";
import ResultsPage from "@/pages/ResultsPage";
import DevPage from "@/pages/DevPage";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/check-email" element={<CheckEmailPage />} />
          <Route path="/verify" element={<VerifyPage />} />
          <Route path="/analyze/:sessionId" element={<AnalyzePage />} />
          <Route path="/waiting/:sessionId" element={<WaitingPage />} />
          <Route path="/results/:sessionId" element={<ResultsPage />} />
          <Route path="/dev" element={<DevPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
