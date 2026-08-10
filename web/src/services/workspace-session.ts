const ACTIVE_WORKSPACE_KEY = "orangemoon:active-workspace";

let activeWorkspaceId = readStoredWorkspaceId();

export function getActiveWorkspaceId() {
    return activeWorkspaceId;
}

export function setActiveWorkspaceId(workspaceId: string) {
    activeWorkspaceId = workspaceId.trim();
    if (typeof window === "undefined") return;
    if (activeWorkspaceId) window.localStorage.setItem(ACTIVE_WORKSPACE_KEY, activeWorkspaceId);
    else window.localStorage.removeItem(ACTIVE_WORKSPACE_KEY);
}

function readStoredWorkspaceId() {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(ACTIVE_WORKSPACE_KEY)?.trim() || "";
}
