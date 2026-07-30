import type { CanvasGenerationMode, CanvasNodeMetadata } from "@/types/canvas";

const ESTIMATED_SECONDS: Record<CanvasGenerationMode, number> = {
    text: 35,
    image: 110,
    video: 480,
    audio: 70,
};

const GENERATING_LABELS: Record<CanvasGenerationMode, string> = {
    text: "正在生成文本",
    image: "正在生成图像",
    video: "正在生成视频",
    audio: "正在合成音频",
};

export type CanvasGenerationProgressSnapshot = {
    progress: number;
    stage: string;
    etaSeconds: number;
    overdue: boolean;
};

export function generationLoadingMetadata(mode: CanvasGenerationMode, metadata: CanvasNodeMetadata = {}): CanvasNodeMetadata {
    const rest = { ...metadata };
    delete rest.generationStage;
    delete rest.generationProgressFloor;
    return {
        ...rest,
        status: "loading",
        generationMode: mode,
        generationStartedAt: Date.now(),
        generationEstimatedSeconds: estimateGenerationSeconds(mode, metadata),
        generationProgressFloor: 2,
        errorDetails: undefined,
    };
}

export function generationSavingMetadata(metadata: CanvasNodeMetadata = {}): CanvasNodeMetadata {
    return {
        ...metadata,
        generationStage: "正在保存产物",
        generationProgressFloor: 96,
    };
}

export function estimateGenerationProgress(metadata: CanvasNodeMetadata | undefined, now = Date.now()): CanvasGenerationProgressSnapshot {
    const mode = metadata?.generationMode || "image";
    const startedAt = metadata?.generationStartedAt || now;
    const estimatedSeconds = Math.max(5, metadata?.generationEstimatedSeconds || ESTIMATED_SECONDS[mode]);
    const elapsedSeconds = Math.max(0, (now - startedAt) / 1000);
    const floor = Math.max(0, Math.min(98, metadata?.generationProgressFloor || 0));
    const stageOverride = metadata?.generationStage?.trim();

    let stage = GENERATING_LABELS[mode];
    let baseProgress = 10;
    if (elapsedSeconds < 3) {
        stage = "正在预留积分";
        baseProgress = 3;
    } else if (elapsedSeconds < 10) {
        stage = "正在提交任务";
        baseProgress = 8;
    } else if (elapsedSeconds >= estimatedSeconds) {
        stage = `${GENERATING_LABELS[mode]}，耗时略长`;
    }

    const normalized = Math.min(1, elapsedSeconds / estimatedSeconds);
    const eased = 1 - Math.pow(1 - normalized, 2.2);
    const estimatedProgress = Math.round(baseProgress + eased * (94 - baseProgress));
    const progress = Math.max(floor, Math.min(floor >= 96 ? 98 : 94, estimatedProgress));
    const etaSeconds = Math.max(0, Math.ceil(estimatedSeconds - elapsedSeconds));

    return {
        progress,
        stage: stageOverride || stage,
        etaSeconds,
        overdue: elapsedSeconds >= estimatedSeconds && floor < 96,
    };
}

export function formatGenerationEta(seconds: number, overdue: boolean) {
    if (overdue) return "已超过预计时间，任务仍在运行";
    if (seconds < 60) return `预计还需约 ${Math.max(1, seconds)} 秒`;
    const minutes = Math.ceil(seconds / 60);
    return `预计还需约 ${minutes} 分钟`;
}

function estimateGenerationSeconds(mode: CanvasGenerationMode, metadata: CanvasNodeMetadata) {
    if (mode !== "video") return ESTIMATED_SECONDS[mode];
    const duration = Number(metadata.seconds);
    if (!Number.isFinite(duration) || duration <= 0) return ESTIMATED_SECONDS.video;
    return Math.max(300, Math.round(duration * 32));
}
