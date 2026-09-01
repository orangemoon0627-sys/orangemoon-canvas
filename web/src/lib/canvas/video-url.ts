export function playableCanvasVideoUrl(
    value: string,
    workspaceId = "",
    origin = "http://orangemoon.invalid",
) {
    if (!value.includes("/platform-api/canvas-media/")) return value;
    const url = new URL(value, origin);
    if (workspaceId.trim()) url.searchParams.set("workspaceId", workspaceId.trim());
    // Keep the media checksum (`v`) and add a separate player-version key so
    // old browser/CDN cache entries cannot be reused after playback fixes.
    url.searchParams.set("pv", "2");
    return /^https?:\/\//i.test(value)
        ? url.toString()
        : `${url.pathname}${url.search}${url.hash}`;
}
