import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/contexts/AuthContext";
import { TenantProvider } from "@/contexts/TenantContext";
import { useMicrophonePermission } from "@/hooks/useMicrophonePermission";
import ProtectedRoute from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import AdminAuth from "./pages/AdminAuth";
import AdminDashboard from "./pages/AdminDashboard";
import DashboardPage from "./pages/DashboardPage";
import Install from "./pages/Install";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import NotFound from "./pages/NotFound";
import AcceptInvite from "./pages/AcceptInvite";

const queryClient = new QueryClient();

const AppContent = () => {
  // Request microphone permission on app startup
  useMicrophonePermission();

  return (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} forcedTheme="light">
      <AuthProvider>
        <TenantProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
            <Routes>
              {/* Sales Mobile App Routes */}
              <Route path="/auth" element={<Auth />} />
              <Route
                path="/"
                element={
                  <ProtectedRoute requiredRole="sales">
                    <Index />
                  </ProtectedRoute>
                }
              />

              {/* Admin Web Dashboard Routes */}
              <Route path="/admin/login" element={<AdminAuth />} />
              <Route
                path="/admin"
                element={
                  <ProtectedRoute requiredRole="admin">
                    <AdminDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/reports"
                element={
                  <ProtectedRoute requiredRole="admin">
                    <DashboardPage />
                  </ProtectedRoute>
                }
              />

              {/* Public Routes */}
              <Route path="/install" element={<Install />} />
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/invite" element={<AcceptInvite />} />
              
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>        </TenantProvider>      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
  );
};

const App = () => <AppContent />;

export default App;
