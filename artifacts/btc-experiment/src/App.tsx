import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/use-auth";
import { Layout } from "@/components/layout";

import Landing from "@/pages/landing";
import AgentPage from "@/pages/agent";
import PersonalRotator from "@/pages/personal-rotator";
import Dashboard from "@/pages/dashboard";
import Admin from "@/pages/admin";
import IcpPage from "@/pages/icp";
import AgentsPage from "@/pages/agents";
import MyAgentPage from "@/pages/my-agent";
import EnginePage from "@/pages/engine";
import OffersPage from "@/pages/offers";
import ReferralLanding from "@/pages/referral-landing";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/icp" component={IcpPage} />
      <Route path="/agents" component={AgentsPage} />
      <Route path="/my-agent" component={MyAgentPage} />
      <Route path="/engine/:slug" component={EnginePage} />
      <Route path="/engine" component={EnginePage} />
      <Route path="/agent/:slug" component={AgentPage} />
      <Route path="/r/:userSlug" component={PersonalRotator} />
      <Route path="/offers" component={OffersPage} />
      <Route path="/join/:agentSlug" component={ReferralLanding} />
      <Route path="/join" component={() => { window.location.replace("/join/ralph"); return null; }} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/admin" component={Admin} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const base = import.meta.env.BASE_URL ?? "/";
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <WouterRouter base={base.replace(/\/$/, "")}>
            <Layout>
              <Router />
            </Layout>
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
