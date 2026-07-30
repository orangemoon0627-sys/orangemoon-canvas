import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from "@nestjs/common";

import type { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { ConfirmRechargeDto, CreateRechargeDto, RechargeListQueryDto, RejectRechargeDto } from "./recharge.dto";
import { RechargeService, serializeRecharge } from "./recharge.service";

@Controller("recharges")
@UseGuards(SessionAuthGuard)
export class RechargeController {
    constructor(private readonly recharges: RechargeService) {}

    @Post()
    async create(@CurrentUser() user: AuthenticatedUser, @Body() input: CreateRechargeDto) {
        return { ok: true, order: serializeRecharge(await this.recharges.create(user.id, input)) };
    }

    @Get()
    async list(@CurrentUser() user: AuthenticatedUser, @Query() query: RechargeListQueryDto) {
        const result = await this.recharges.listForUser(user.id, query);
        return { ok: true, ...result, orders: result.orders.map(serializeRecharge) };
    }

    @Post(":publicId/cancel")
    @HttpCode(200)
    async cancel(@CurrentUser() user: AuthenticatedUser, @Param("publicId") publicId: string) {
        return { ok: true, order: serializeRecharge(await this.recharges.cancel(user.id, publicId)) };
    }
}

@Controller("admin/recharges")
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles("ADMIN")
export class AdminRechargeController {
    constructor(private readonly recharges: RechargeService) {}

    @Get()
    async list(@Query() query: RechargeListQueryDto) {
        const result = await this.recharges.listForAdmin(query);
        return { ok: true, ...result, orders: result.orders.map(serializeRecharge) };
    }

    @Post(":publicId/confirm")
    @HttpCode(200)
    async confirm(@CurrentUser() actor: AuthenticatedUser, @Param("publicId") publicId: string, @Body() input: ConfirmRechargeDto) {
        return { ok: true, order: serializeRecharge(await this.recharges.confirm(actor.id, publicId, input)) };
    }

    @Post(":publicId/reject")
    @HttpCode(200)
    async reject(@CurrentUser() actor: AuthenticatedUser, @Param("publicId") publicId: string, @Body() input: RejectRechargeDto) {
        return { ok: true, order: serializeRecharge(await this.recharges.reject(actor.id, publicId, input)) };
    }
}
