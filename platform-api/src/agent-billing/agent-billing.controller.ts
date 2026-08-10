import { Body, Controller, ForbiddenException, Get, Headers, Param, Post, Query, UseGuards } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";

import { CurrentUser } from "../auth/current-user.decorator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import type { AuthenticatedUser } from "../auth/auth.types";
import { canvasAgentInternalSecret } from "../common/environment";
import { AgentBillingService, serializeAgentTurn } from "./agent-billing.service";
import { ReleaseAgentTurnDto, ReserveAgentTurnDto, SettleAgentTurnDto } from "./agent-billing.dto";

@Controller("agent/turns")
@UseGuards(SessionAuthGuard)
export class AgentBillingController {
    constructor(private readonly billing: AgentBillingService) {}

    @Post("reserve")
    async reserve(@CurrentUser() user: AuthenticatedUser, @Headers("x-workspace-id") workspaceId: string | undefined, @Headers("x-canvas-agent-secret") secret: string | undefined, @Body() input: ReserveAgentTurnDto) {
        assertInternalAgent(secret);
        return { ok: true, turn: serializeAgentTurn(await this.billing.reserve(user.id, workspaceId, input)) };
    }

    @Post(":turnId/settle")
    async settle(@CurrentUser() user: AuthenticatedUser, @Headers("x-workspace-id") workspaceId: string | undefined, @Headers("x-canvas-agent-secret") secret: string | undefined, @Param("turnId") turnId: string, @Body() input: SettleAgentTurnDto) {
        assertInternalAgent(secret);
        return { ok: true, turn: serializeAgentTurn(await this.billing.settle(user.id, workspaceId, turnId, input)) };
    }

    @Post(":turnId/release")
    async release(@CurrentUser() user: AuthenticatedUser, @Headers("x-workspace-id") workspaceId: string | undefined, @Headers("x-canvas-agent-secret") secret: string | undefined, @Param("turnId") turnId: string, @Body() input: ReleaseAgentTurnDto) {
        assertInternalAgent(secret);
        return { ok: true, turn: serializeAgentTurn(await this.billing.release(user.id, workspaceId, turnId, input)) };
    }

    @Get()
    async list(@CurrentUser() user: AuthenticatedUser, @Query("limit") rawLimit?: string) {
        return { ok: true, turns: (await this.billing.list(user.id, Number(rawLimit || 100))).map(serializeAgentTurn) };
    }

    @Get("pricing")
    pricing() {
        return { ok: true, pricing: this.billing.pricingCatalog() };
    }
}

function assertInternalAgent(value: string | undefined) {
    const expected = Buffer.from(canvasAgentInternalSecret());
    const actual = Buffer.from(String(value || ""));
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new ForbiddenException("Agent 内部计费凭证无效");
}
