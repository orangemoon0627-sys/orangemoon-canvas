export function isGenerationSubmission(method: string, rawUrl: string) {
    if (method !== "POST") return false;
    const path = (rawUrl.split("?", 1)[0] || "").replace(/\/+$/, "");
    return path === "/platform-api/providers/metajing/v1/images/generations"
        || path === "/platform-api/providers/metajing/v1/video/generations"
        || path === "/platform-api/providers/minimax/v1/audio/speech";
}
