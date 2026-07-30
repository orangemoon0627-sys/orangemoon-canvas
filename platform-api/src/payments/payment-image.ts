import { BadRequestException } from "@nestjs/common";

const MAX_PAYMENT_IMAGE_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

export type PaymentImageMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export function decodePaymentImage(dataBase64: string, declaredMimeType: string) {
    if (!ALLOWED_MIME_TYPES.includes(declaredMimeType as PaymentImageMimeType)) {
        throw new BadRequestException("收款码只支持 PNG、JPEG 或 WebP");
    }
    const normalized = dataBase64.replace(/\s/g, "");
    if (!normalized || normalized.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
        throw new BadRequestException("收款码图片数据无效");
    }
    const bytes = Buffer.from(normalized, "base64");
    if (bytes.length < 32) throw new BadRequestException("收款码图片数据无效");
    if (bytes.length > MAX_PAYMENT_IMAGE_BYTES) throw new BadRequestException("收款码图片不能超过 2MB");

    const detectedMimeType = detectPaymentImageMimeType(bytes);
    if (!detectedMimeType || detectedMimeType !== declaredMimeType) {
        throw new BadRequestException("收款码文件类型与图片内容不一致");
    }
    return { bytes, mimeType: detectedMimeType };
}

export function detectPaymentImageMimeType(bytes: Buffer): PaymentImageMimeType | null {
    if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
    if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
    return null;
}
