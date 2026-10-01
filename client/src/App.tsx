import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth";
import ProtectedRoute from "@/components/ProtectedRoute";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import Notifications from "@/pages/notifications";
import NotificationDetail from "@/pages/notification-detail";
import Templates from "@/pages/templates";
import Settings from "@/pages/settings";
import Admin from "@/pages/admin";
import InviaNotifica from "@/pages/invia-notifica";
import Anagrafiche from "@/pages/anagrafiche";
import GestioneCodici from "@/pages/gestione-codici";

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/">
        <ProtectedRoute pageSlug="dashboard"><Dashboard /></ProtectedRoute>
      </Route>
      <Route path="/anagrafiche">
        <ProtectedRoute pageSlug="anagrafiche"><Anagrafiche /></ProtectedRoute>
      </Route>
      <Route path="/invia-notifica">
        <ProtectedRoute pageSlug="invia-notifica"><InviaNotifica /></ProtectedRoute>
      </Route>
      <Route path="/notifiche/:id">
        <ProtectedRoute pageSlug="notifiche"><NotificationDetail /></ProtectedRoute>
      </Route>
      <Route path="/notifiche">
        <ProtectedRoute pageSlug="notifiche"><Notifications /></ProtectedRoute>
      </Route>
      <Route path="/template">
        <ProtectedRoute pageSlug="template"><Templates /></ProtectedRoute>
      </Route>
      <Route path="/impostazioni">
        <ProtectedRoute pageSlug="impostazioni"><Settings /></ProtectedRoute>
      </Route>
      <Route path="/gestione-codici">
        <ProtectedRoute pageSlug="gestione-codici"><GestioneCodici /></ProtectedRoute>
      </Route>
      <Route path="/admin">
        <ProtectedRoute pageSlug="admin"><Admin /></ProtectedRoute>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
