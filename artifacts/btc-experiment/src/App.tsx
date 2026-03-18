import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PrivyProvider } from "@privy-io/react-auth";
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
  const privyAppId = import.meta.env.VITE_PRIVY_APP_ID as string;
  const base = import.meta.env.BASE_URL ?? "/";
  const loginCallbackUrl = typeof window !== "undefined"
    ? `${window.location.origin}${base.endsWith("/") ? base.slice(0, -1) : base}`
    : undefined;

  return (
    <PrivyProvider
      appId={privyAppId}
      config={{
        loginMethods: ["email"],
        loginCallbackUrl,
        email: {
          sendEmailFromCoolAddress: false,
          loginType: "code",
        },
        appearance: {
          theme: "dark",
          accentColor: "#f7931a",
        },
        embeddedWallets: {
          createOnLogin: "off",
        },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Layout>
                <Router />
              </Layout>
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}

export default App;
