import { Body, Controller, Delete, Get, Param, Patch, Put, Res, UseGuards } from "@nestjs/common";
import type { FastifyReply } from "fastify";

import type { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { PaymentProviderParamDto, UpdatePaymentSettingDto, UploadPaymentQrDto } from "./payment.dto";
import { PaymentService } from "./payment.service";

@Controller("payments")
@UseGuards(SessionAuthGuard)
export class PaymentController {
    constructor(private readonly payments: PaymentService) {}

    @Get("config")
    async config() {
        const methods = await this.payments.methods();
        return {
            ok: true,
            creditToCny: 1,
            merchantPaymentsConfigured: methods.some((method) => method.ready),
            methods,
            notice: "当前为内测人工充值。请扫描收款码并填写订单号，平台仅在管理员核实真实到账后增加积分。",
        };
    }

    @Get("qr/:provider")
    async qr(@Param() params: PaymentProviderParamDto, @Res() reply: FastifyReply) {
        const image = await this.payments.qr(params.provider);
        void reply.type(image.mimeType).header("Cache-Control", "private, max-age=31536000, immutable").send(image.bytes);
    }
}

@Controller("admin/payment-settings")
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles("ADMIN")
export class AdminPaymentController {
    constructor(private readonly payments: PaymentService) {}

    @Get()
    async list() {
        return { ok: true, methods: await this.payments.adminMethods() };
    }

    @Patch(":provider")
    async update(@CurrentUser() actor: AuthenticatedUser, @Param() params: PaymentProviderParamDto, @Body() input: UpdatePaymentSettingDto) {
        return { ok: true, method: await this.payments.updateSetting(actor.id, params.provider, input) };
    }

    @Put(":provider/qr")
    async uploadQr(@CurrentUser() actor: AuthenticatedUser, @Param() params: PaymentProviderParamDto, @Body() input: UploadPaymentQrDto) {
        return { ok: true, method: await this.payments.uploadQr(actor.id, params.provider, input) };
    }

    @Delete(":provider/qr")
    async deleteQr(@CurrentUser() actor: AuthenticatedUser, @Param() params: PaymentProviderParamDto) {
        return { ok: true, method: await this.payments.deleteQr(actor.id, params.provider) };
    }
}
