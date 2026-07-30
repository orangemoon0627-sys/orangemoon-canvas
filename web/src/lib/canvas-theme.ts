export type CanvasColorTheme = "light" | "dark";
export type CanvasBackgroundMode = "dots" | "lines" | "blank";

export const canvasThemes = {
    light: {
        canvas: {
            background: "#f4f2ed",
            dot: "rgba(68,64,60,.28)",
            line: "rgba(68,64,60,.12)",
            selectionStroke: "#1c1917",
            selectionFill: "rgba(28,25,23,.06)",
        },
        node: {
            label: "#57534e",
            fill: "#e7e5df",
            panel: "#fbfaf7",
            stroke: "#d6d3ca",
            activeStroke: "#0891b2",
            placeholder: "#8a8479",
            text: "#292524",
            muted: "#78716c",
            faint: "#a8a29e",
        },
        toolbar: {
            panel: "rgba(251,250,247,.96)",
            border: "#d6d3ca",
            item: "#57534e",
            itemHover: "#e7e5df",
            activeBg: "#e7e5df",
            activeText: "#292524",
        },
    },
    dark: {
        canvas: {
            background: "#101112",
            dot: "rgba(255,255,255,.16)",
            line: "rgba(255,255,255,.055)",
            selectionStroke: "#f4f4f5",
            selectionFill: "rgba(244,244,245,.08)",
        },
        node: {
            label: "#d4d4d8",
            fill: "#242427",
            panel: "#1b1b1e",
            stroke: "#444449",
            activeStroke: "#67d9e7",
            placeholder: "#85878c",
            text: "#f4f4f5",
            muted: "#a2a2a8",
            faint: "#696970",
        },
        toolbar: {
            panel: "rgba(29,29,32,.97)",
            border: "#444449",
            item: "#b9bbc0",
            itemHover: "#292a2d",
            activeBg: "#f4f4f5",
            activeText: "#18191b",
        },
    },
} as const;

export type CanvasTheme = (typeof canvasThemes)[CanvasColorTheme];
