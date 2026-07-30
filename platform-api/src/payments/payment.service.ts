import { Injectable, NotFoundException } from "@nestjs/common";
import { PaymentProvider, type PaymentSetting } from "@prisma/client";

import { assertSafeExternalUrl, environmentBoolean, environmentText } from "../common/environment";
import { PrismaService } from "../prisma/prisma.service";
import type { UpdatePaymentSettingDto, UploadPaymentQrDto } from "./payment.dto";
import { decodePaymentImage } from "./payment-image";

export type ManualPaymentMethod = {
    provider: PaymentProvider;
    label: string;
    mode: "manual";
    enabled: boolean;
    ready: boolean;
    payee: string;
    qrUrl: string;
    instructions: string;
    updatedAt: string | null;
};

const METHOD_DEFINITIONS = [
    { provider: PaymentProvider.ALIPAY_MANUAL, label: "支付宝", prefix: "MANUAL_ALIPAY" },
    { provider: PaymentProvider.WECHAT_MANUAL, label: "微信支付", prefix: "MANUAL_WECHAT" },
] as const;

@Injectable()
export class PaymentService {
    constructor(private readonly prisma: PrismaService) {}

    async methods(): Promise<ManualPaymentMethod[]> {
        const settings = await this.prisma.paymentSetting.findMany();
        const settingByProvider = new Map(settings.map((setting) => [setting.provider, setting]));
        return METHOD_DEFINITIONS.map((definition) => this.resolveMethod(definition, settingByProvider.get(definition.provider)));
    }

    async method(provider: PaymentProvider) {
        return (await this.methods()).find((method) => method.provider === provider);
    }

    async adminMethods() {
        return this.methods();
    }

    async updateSetting(actorId: string, provider: PaymentProvider, input: UpdatePaymentSettingDto) {
        await this.prisma.$transaction([
            this.prisma.paymentSetting.upsert({
                where: { provider },
                create: { provider, enabled: input.enabled, payee: input.payee, instructions: input.instructions },
                update: { enabled: input.enabled, payee: input.payee, instructions: input.instructions },
            }),
            this.prisma.auditLog.create({ data: { actorId, action: "payment.setting.update", targetType: "PaymentSetting", targetId: provider, details: { enabled: input.enabled, payee: input.payee } } }),
        ]);
        return this.method(provider);
    }

    async uploadQr(actorId: string, provider: PaymentProvider, input: UploadPaymentQrDto) {
        const image = decodePaymentImage(input.dataBase64, input.mimeType);
        const fallback = this.environmentMethod(provider);
        await this.prisma.$transaction([
            this.prisma.paymentSetting.upsert({
                where: { provider },
                create: { provider, enabled: fallback.enabled, payee: fallback.payee, instructions: fallback.instructions, qrMimeType: image.mimeType, qrBytes: image.bytes },
                update: { qrMimeType: image.mimeType, qrBytes: image.bytes },
            }),
            this.prisma.auditLog.create({ data: { actorId, action: "payment.qr.upload", targetType: "PaymentSetting", targetId: provider, details: { mimeType: image.mimeType, bytes: image.bytes.length } } }),
        ]);
        return this.method(provider);
    }

    async deleteQr(actorId: string, provider: PaymentProvider) {
        const fallback = this.environmentMethod(provider);
        await this.prisma.$transaction([
            this.prisma.paymentSetting.upsert({
                where: { provider },
                create: { provider, enabled: fallback.enabled, payee: fallback.payee, instructions: fallback.instructions },
                update: { qrMimeType: null, qrBytes: null },
            }),
            this.prisma.auditLog.create({ data: { actorId, action: "payment.qr.delete", targetType: "PaymentSetting", targetId: provider } }),
        ]);
        return this.method(provider);
    }

    async qr(provider: PaymentProvider) {
        const setting = await this.prisma.paymentSetting.findUnique({ where: { provider }, select: { qrBytes: true, qrMimeType: true, updatedAt: true } });
        if (!setting?.qrBytes || !setting.qrMimeType) throw new NotFoundException("收款码尚未配置");
        return { bytes: Buffer.from(setting.qrBytes), mimeType: setting.qrMimeType, updatedAt: setting.updatedAt };
    }

    private resolveMethod(definition: (typeof METHOD_DEFINITIONS)[number], setting?: PaymentSetting): ManualPaymentMethod {
        const fallback = this.environmentMethod(definition.provider);
        const storedQrUrl = setting?.qrBytes && setting.qrMimeType ? `/platform-api/payments/qr/${definition.provider}?v=${setting.updatedAt.getTime()}` : "";
        const qrUrl = storedQrUrl || fallback.qrUrl;
        const enabled = setting?.enabled ?? fallback.enabled;
        return {
            provider: definition.provider,
            label: definition.label,
            mode: "manual",
            enabled,
            ready: enabled && Boolean(qrUrl),
            payee: setting?.payee || fallback.payee,
            qrUrl,
            instructions: setting?.instructions || fallback.instructions,
            updatedAt: setting?.updatedAt.toISOString() || null,
        };
    }

    private environmentMethod(provider: PaymentProvider) {
        const definition = METHOD_DEFINITIONS.find((item) => item.provider === provider);
        if (!definition) throw new NotFoundException("不支持的支付方式");
        return {
            enabled: environmentBoolean(`${definition.prefix}_ENABLED`, false),
            payee: environmentText(`${definition.prefix}_PAYEE`, "橙月画布"),
            qrUrl: assertSafeExternalUrl(environmentText(`${definition.prefix}_QR_URL`)),
            instructions: environmentText(`${definition.prefix}_INSTRUCTIONS`, "转账时请填写充值订单号，到账后由管理员确认。"),
        };
    }
}
