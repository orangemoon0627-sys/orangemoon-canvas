import { create } from "zustand";

import { fetchCurrentUser, fetchWallet, loginAccount, logoutAccount, registerAccount, type PlatformUser, type PlatformWallet } from "@/services/api/platform";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

type AuthStatus = "checking" | "authenticated" | "anonymous";

type AuthState = {
    status: AuthStatus;
    user: PlatformUser | null;
    initialize: () => Promise<void>;
    login: (input: { email: string; password: string }) => Promise<void>;
    register: (input: { email: string; password: string; displayName?: string }) => Promise<void>;
    logout: () => Promise<void>;
    refresh: () => Promise<void>;
    refreshWallet: () => Promise<void>;
    updateWallet: (wallet: PlatformWallet) => void;
    expire: () => void;
};

let initialization: Promise<void> | null = null;
let walletRefreshSequence = 0;

export const useAuthStore = create<AuthState>((set, get) => ({
    status: "checking",
    user: null,
    initialize: async () => {
        if (get().status !== "checking") return;
        if (!initialization) {
            initialization = fetchCurrentUser()
                .then(({ user }) => set({ status: "authenticated", user }))
                .catch(() => set({ status: "anonymous", user: null }))
                .finally(() => { initialization = null; });
        }
        await initialization;
    },
    login: async (input) => {
        const { user } = await loginAccount(input);
        set({ status: "authenticated", user });
    },
    register: async (input) => {
        const { user } = await registerAccount(input);
        set({ status: "authenticated", user });
    },
    logout: async () => {
        try {
            await logoutAccount();
        } finally {
            useWorkspaceStore.getState().reset();
            set({ status: "anonymous", user: null });
        }
    },
    refresh: async () => {
        const { user } = await fetchCurrentUser();
        set({ status: "authenticated", user });
    },
    refreshWallet: async () => {
        if (!get().user) return;
        const sequence = ++walletRefreshSequence;
        const { wallet } = await fetchWallet();
        if (sequence !== walletRefreshSequence) return;
        set((state) => ({ user: state.user ? { ...state.user, wallet } : null }));
    },
    updateWallet: (wallet) => set((state) => ({ user: state.user ? { ...state.user, wallet } : null })),
    expire: () => {
        useWorkspaceStore.getState().reset();
        set({ status: "anonymous", user: null });
    },
}));
