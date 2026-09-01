export type CanvasVideoPreload = "metadata" | "auto";

/**
 * Keep background video nodes from competing with the video the user is
 * watching. The selected/playing node is allowed to fill its buffer.
 */
export function canvasVideoPreload(
    isSelected: boolean,
    isPlaying: boolean,
): CanvasVideoPreload {
    return isSelected || isPlaying ? "auto" : "metadata";
}
