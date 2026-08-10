import { lazy, Suspense, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

import { AppTopNav } from "@/components/layout/app-top-nav";
import { useAgentStore } from "@/stores/use-agent-store";

const AgentPanel = lazy(() => import("@/components/agent/agent-panel").then((module) => ({ default: module.AgentPanel })));

export default function UserLayout({ children }: { children: ReactNode }) {
    const { pathname } = useLocation();
    const platformPage = /^\/(account|admin|team)(?:\/|$)/.test(pathname);
    const agentPanelMounted = useAgentStore((state) => state.panelMounted);
    return (
        <div className="flex h-dvh overflow-hidden bg-background text-foreground">
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                <AppTopNav />
                <div className="app-workspace-container min-h-0 flex-1 overflow-hidden">{children}</div>
            </div>
            {platformPage || !agentPanelMounted ? null : (
                <Suspense fallback={null}>
                    <AgentPanel />
                </Suspense>
            )}
        </div>
    );
}
