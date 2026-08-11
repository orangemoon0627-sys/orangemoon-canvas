import { getImageBlob } from "@/services/image-storage";
import type { ReferenceImage } from "@/types/image";

const JSON_REFERENCE_BINARY_BUDGET = 20_000_000;
const MAX_REFERENCE_IMAGE_BYTES = 6_000_000;

export async function prepareReferenceImagesForJson(images: ReferenceImage[], perImageMaxBytes: number, maxDimension = 3072) {
    if (!images.length) return [];
    const targetBytes = Math.min(perImageMaxBytes - 100_000, MAX_REFERENCE_IMAGE_BYTES, Math.floor(JSON_REFERENCE_BINARY_BUDGET / images.length));
    if (targetBytes < 500_000) throw new Error("参考图数量过多，无法在当前请求体限制内提交");

    const prepared: string[] = [];
    for (const image of images) {
        const blob = await loadReferenceImageBlob(image);
        if (!blob) {
            const remoteUrl = image.url || image.dataUrl;
            if (/^https?:\/\//i.test(remoteUrl || "")) {
                prepared.push(remoteUrl);
                continue;
            }
            throw new Error(`参考图「${image.name}」读取失败，请重新上传`);
        }
        const needsResize = Math.max(image.width || 0, image.height || 0) > maxDimension;
        const output = blob.size <= targetBytes && !needsResize ? blob : await compressReferenceImage(blob, targetBytes, maxDimension);
        if (output.size > perImageMaxBytes) throw new Error(`参考图「${image.name}」超过模型的图片大小上限，自动优化后仍无法提交`);
        prepared.push(await blobToDataUrl(output));
    }
    return prepared;
}

async function loadReferenceImageBlob(image: ReferenceImage) {
    if (image.storageKey) {
        const stored = await getImageBlob(image.storageKey);
        if (stored) return stored;
    }
    const source = image.dataUrl || image.url;
    if (!source) return null;
    try {
        const response = await fetch(source);
        if (!response.ok) return null;
        const blob = await response.blob();
        return blob.type.startsWith("image/") ? blob : null;
    } catch {
        return null;
    }
}

async function compressReferenceImage(source: Blob, targetBytes: number, maxDimension: number) {
    const bitmap = await createImageBitmap(source);
    try {
        let scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
        let smallest: Blob | null = null;
        for (let attempt = 0; attempt < 6; attempt += 1) {
            const width = Math.max(1, Math.round(bitmap.width * scale));
            const height = Math.max(1, Math.round(bitmap.height * scale));
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext("2d", { alpha: false });
            if (!context) throw new Error("当前浏览器无法处理参考图");
            context.fillStyle = "#ffffff";
            context.fillRect(0, 0, width, height);
            context.drawImage(bitmap, 0, 0, width, height);

            for (const quality of [0.92, 0.84, 0.76, 0.68]) {
                const candidate = await canvasToBlob(canvas, quality);
                if (!smallest || candidate.size < smallest.size) smallest = candidate;
                if (candidate.size <= targetBytes) return candidate;
            }
            const ratio = Math.sqrt(targetBytes / Math.max(1, smallest!.size)) * 0.92;
            scale *= Math.max(0.55, Math.min(0.88, ratio));
        }
        if (smallest && smallest.size <= targetBytes) return smallest;
        throw new Error("参考图自动优化后仍然过大，请换用尺寸更小的图片");
    } finally {
        bitmap.close();
    }
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
    return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("参考图压缩失败"))), "image/jpeg", quality);
    });
}

function blobToDataUrl(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("参考图读取失败"));
        reader.readAsDataURL(blob);
    });
}
