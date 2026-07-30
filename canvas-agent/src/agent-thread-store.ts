export type StoredAgentMessage = {
    id: string;
    role: "user" | "assistant" | "tool" | "error" | "system";
    title?: string;
    text: string;
    meta?: string;
    attachments?: Array<{ id?: string; name?: string; type?: string; size?: number; width?: number; height?: number }>;
};

export type StoredAgentHistoryMessage = { role: "user" | "assistant"; content: string };

export type StoredAgentThread = {
    id: string;
    preview: string;
    name?: string | null;
    status?: string;
    source?: string;
    createdAt: number;
    updatedAt: number;
    messages: StoredAgentMessage[];
    history: StoredAgentHistoryMessage[];
};

export async function listAgentThreads(cookie: string, projectId: string, search = "") {
    const query = new URLSearchParams({ projectId, ...(search ? { search } : {}) });
    return platformAgentRequest<{ ok: true; activeThreadId: string; threads: Array<Omit<StoredAgentThread, "messages" | "history">> }>(cookie, `/agent/threads?${query}`);
}

export async function getAgentThread(cookie: string, projectId: string, threadId: string) {
    const query = new URLSearchParams({ projectId });
    const result = await platformAgentRequest<{ ok: true; thread: StoredAgentThread }>(cookie, `/agent/threads/${encodeURIComponent(threadId)}?${query}`);
    return result.thread;
}

export async function saveAgentThread(cookie: string, projectId: string, thread: StoredAgentThread) {
    const result = await platformAgentRequest<{ ok: true; thread: StoredAgentThread }>(cookie, `/agent/threads/${encodeURIComponent(thread.id)}`, {
        method: "PUT",
        body: JSON.stringify({ projectId, preview: thread.preview, name: thread.name || undefined, messages: thread.messages, history: thread.history }),
    });
    return result.thread;
}

export async function openAgentThread(cookie: string, projectId: string, threadId: string) {
    const result = await platformAgentRequest<{ ok: true; thread: StoredAgentThread }>(cookie, `/agent/threads/${encodeURIComponent(threadId)}/open`, {
        method: "POST",
        body: JSON.stringify({ projectId }),
    });
    return result.thread;
}

export async function deleteAgentThread(cookie: string, projectId: string, threadId: string) {
    const query = new URLSearchParams({ projectId });
    await platformAgentRequest<{ ok: true }>(cookie, `/agent/threads/${encodeURIComponent(threadId)}?${query}`, { method: "DELETE" });
}

async function platformAgentRequest<T>(cookie: string, path: string, init: RequestInit = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
        const response = await fetch(`${platformApiUrl()}${path}`, {
            ...init,
            headers: { accept: "application/json", cookie, ...(init.body ? { "content-type": "application/json" } : {}), ...init.headers },
            signal: controller.signal,
        });
        const body = (await response.json().catch(() => null)) as { message?: string | string[]; error?: string } | null;
        if (!response.ok) {
            const message = Array.isArray(body?.message) ? body.message.join("；") : body?.message || body?.error || `会话存储请求失败（${response.status}）`;
            throw new Error(message);
        }
        return body as T;
    } catch (error) {
        if (error instanceof Error && error.name === "AbortError") throw new Error("会话存储请求超时");
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

function platformApiUrl() {
    return (process.env.PLATFORM_API_INTERNAL_URL?.trim() || "http://127.0.0.1:17400/platform-api").replace(/\/+$/, "");
}
