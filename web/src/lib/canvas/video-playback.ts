export type CanvasVideoPreload = "none" | "auto";

/**
 * Keep background video nodes from competing with the video the user is
 * watching. Only the selected/playing node is allowed to open a media
 * connection and fill its buffer.
 */
export function canvasVideoPreload(
    isSelected: boolean,
    isPlaying: boolean,
): CanvasVideoPreload {
    return isSelected || isPlaying ? "auto" : "none";
}
