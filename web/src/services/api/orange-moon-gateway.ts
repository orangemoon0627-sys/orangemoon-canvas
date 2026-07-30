import axios from "axios";

import { useAuthStore } from "@/stores/use-auth-store";

let activeBillableRequests = 0;
let walletPollTimer: number | null = null;

export function orangeMoonGatewayRequest() {
    return {
        url: (path: string) => `/platform-api/providers${path.startsWith("/") ? path : `/${path}`}`,
        headers: {},
    };
}

export async function orangeMoonPost<T>(path: string, body: unknown, options?: { signal?: AbortSignal; responseType?: "json" | "blob" }) {
    const gateway = orangeMoonGatewayRequest();
    const trackWallet = isBillableProviderPath(path);
    if (trackWallet) beginWalletTracking();
    try {
        const response = await axios.post<T>(gateway.url(path), body, { headers: { ...gateway.headers, "Idempotency-Key": crypto.randomUUID() }, withCredentials: true, signal: options?.signal, responseType: options?.responseType || "json" });
        return response.data;
    } finally {
        if (trackWallet) endWalletTracking();
    }
}

export async function orangeMoonGet<T>(path: string, options?: { signal?: AbortSignal }) {
    const gateway = orangeMoonGatewayRequest();
    try {
        const response = await axios.get<T>(gateway.url(path), { headers: gateway.headers, withCredentials: true, signal: options?.signal });
        return response.data;
    } finally {
        if (isGenerationStatusPath(path)) void refreshWallet();
    }
}

function isBillableProviderPath(path: string) {
    return path.includes("/images/generations") || path.includes("/video/generations") || path.includes("/audio/speech");
}

function isGenerationStatusPath(path: string) {
    return path.includes("/video/generations/");
}

function beginWalletTracking() {
    activeBillableRequests += 1;
    window.setTimeout(() => void refreshWallet(), 250);
    if (walletPollTimer) return;
    walletPollTimer = window.setInterval(() => void refreshWallet(), 1500);
}

function endWalletTracking() {
    activeBillableRequests = Math.max(0, activeBillableRequests - 1);
    void refreshWallet();
    if (activeBillableRequests || !walletPollTimer) return;
    window.clearInterval(walletPollTimer);
    walletPollTimer = null;
}

async function refreshWallet() {
    try {
        await useAuthStore.getState().refreshWallet();
    } catch {
        // Generation errors are reported by the original request; wallet refresh retries on the next activity.
    }
}
