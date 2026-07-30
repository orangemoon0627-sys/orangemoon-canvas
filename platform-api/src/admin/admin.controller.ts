import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";

import type { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { formatMilliCredits } from "../common/money";
import { serializeWallet } from "../wallet/wallet.serializer";
import { AdjustWalletDto, AdminUsersQueryDto, UpdateUserStatusDto } from "./admin.dto";
import { AdminService } from "./admin.service";

@Controller("admin/users")
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles("ADMIN")
export class AdminController {
    constructor(private readonly admin: AdminService) {}

    @Get()
    async users(@Query() query: AdminUsersQueryDto) {
        const result = await this.admin.users(query);
        return { ok: true, ...result, users: result.users.map(serializeAdminUser) };
    }

    @Patch(":userId/status")
    async updateStatus(@CurrentUser() actor: AuthenticatedUser, @Param("userId") userId: string, @Body() input: UpdateUserStatusDto) {
        return { ok: true, user: serializeAdminUser(await this.admin.updateStatus(actor.id, userId, input)) };
    }

    @Post(":userId/wallet-adjustments")
    async adjustWallet(@CurrentUser() actor: AuthenticatedUser, @Param("userId") userId: string, @Body() input: AdjustWalletDto) {
        return { ok: true, wallet: serializeWallet(await this.admin.adjustWallet(actor.id, userId, input)) };
    }
}

function serializeAdminUser(user: { id: string; email: string; displayName: string; role: string; status: string; createdAt: Date; wallet: { availableMilliCredits: bigint; frozenMilliCredits: bigint; updatedAt: Date } | null }) {
    return {
        ...user,
        wallet: user.wallet ? serializeWallet(user.wallet) : null,
        totalCredits: user.wallet ? formatMilliCredits(user.wallet.availableMilliCredits + user.wallet.frozenMilliCredits) : "0",
    };
}
