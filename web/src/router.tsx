import { lazy, Suspense, type ReactNode } from "react";
import { createBrowserRouter, Outlet } from "react-router-dom";

import { AnalyticsTracker } from "@/components/layout/analytics-tracker";
import { PlatformAuthGate } from "@/components/auth/platform-auth-gate";
import UserLayout from "@/layouts/user-layout";

const AccountPage = lazy(() => import("@/pages/account"));
const AdminPage = lazy(() => import("@/pages/admin"));
const AssetsPage = lazy(() => import("@/pages/assets"));
const CanvasPage = lazy(() => import("@/pages/canvas"));
const CanvasProjectPage = lazy(() => import("@/pages/canvas/project"));
const ConfigPage = lazy(() => import("@/pages/config"));
const HomePage = lazy(() => import("@/pages/home"));
const ImagePage = lazy(() => import("@/pages/image"));
const NotFound = lazy(() => import("@/pages/not-found"));
const PromptsPage = lazy(() => import("@/pages/prompts"));
const TeamPage = lazy(() => import("@/pages/team"));
const TeamInvitePage = lazy(() => import("@/pages/team/invite"));
const VideoPage = lazy(() => import("@/pages/video"));

function LazyPage({ children }: { children: ReactNode }) {
    return (
        <Suspense
            fallback={
                <div className="grid h-full place-items-center bg-background" aria-label="页面加载中">
                    <span className="size-6 animate-spin rounded-full border-2 border-stone-300 border-t-[#e9583e] dark:border-stone-700 dark:border-t-[#ff7158]" />
                </div>
            }
        >
            {children}
        </Suspense>
    );
}

const lazyPage = (children: ReactNode) => <LazyPage>{children}</LazyPage>;

export const router = createBrowserRouter([
    {
        element: (
            <PlatformAuthGate>
                <UserLayout>
                    <AnalyticsTracker />
                    <Outlet />
                </UserLayout>
            </PlatformAuthGate>
        ),
        children: [
            { path: "/", element: lazyPage(<HomePage />) },
            { path: "/image", element: lazyPage(<ImagePage />) },
            { path: "/video", element: lazyPage(<VideoPage />) },
            { path: "/assets", element: lazyPage(<AssetsPage />) },
            { path: "/prompts", element: lazyPage(<PromptsPage />) },
            { path: "/team", element: lazyPage(<TeamPage />) },
            { path: "/team/invite/:token", element: lazyPage(<TeamInvitePage />) },
            { path: "/canvas", element: lazyPage(<CanvasPage />) },
            { path: "/canvas/:id", element: lazyPage(<CanvasProjectPage />) },
            { path: "/config", element: lazyPage(<ConfigPage />) },
            { path: "/account", element: lazyPage(<AccountPage />) },
            { path: "/admin", element: lazyPage(<AdminPage />) },
        ],
    },
    { path: "*", element: lazyPage(<NotFound />) },
]);
