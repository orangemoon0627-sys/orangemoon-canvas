import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, UserStatus } from "@prisma/client";
import { randomUUID } from "node:crypto";

import { parseCredits } from "../common/money";
import { PrismaService } from "../prisma/prisma.service";
import { LedgerService } from "../wallet/ledger.service";
import type { AdjustWalletDto, AdminUsersQueryDto, UpdateUserStatusDto } from "./admin.dto";

@Injectable()
export class AdminService {
    constructor(private readonly prisma: PrismaService, private readonly ledger: LedgerService) {}

    async users(query: AdminUsersQueryDto) {
        const search = query.search?.slice(0, 100);
        const where: Prisma.UserWhereInput = search ? { OR: [{ email: { contains: search, mode: "insensitive" } }, { displayName: { contains: search, mode: "insensitive" } }] } : {};
        const [total, users] = await Promise.all([
            this.prisma.user.count({ where }),
            this.prisma.user.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (query.page - 1) * query.limit, take: query.limit, select: { id: true, email: true, displayName: true, role: true, status: true, createdAt: true, wallet: true } }),
        ]);
        return { total, users };
    }

    async updateStatus(actorId: string, userId: string, input: UpdateUserStatusDto) {
        if (actorId === userId && input.status === UserStatus.DISABLED) throw new ForbiddenException("不能停用自己的管理员账户");
        const target = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!target) throw new NotFoundException("用户不存在");
        const activeAdminCount = target.role === "ADMIN" && input.status === UserStatus.DISABLED ? await this.prisma.user.count({ where: { role: "ADMIN", status: "ACTIVE" } }) : 2;
        if (activeAdminCount <= 1) throw new ConflictException("不能停用最后一个可用管理员");
        const [user] = await this.prisma.$transaction([
            this.prisma.user.update({ where: { id: userId }, data: { status: input.status }, select: { id: true, email: true, displayName: true, role: true, status: true, createdAt: true, wallet: true } }),
            this.prisma.session.updateMany({ where: { userId, revokedAt: null, ...(input.status === UserStatus.DISABLED ? {} : { id: "__none__" }) }, data: { revokedAt: new Date() } }),
            this.prisma.auditLog.create({ data: { actorId, action: "admin.user.status", targetType: "User", targetId: userId, details: { status: input.status } } }),
        ]);
        return user;
    }

    async adjustWallet(actorId: string, userId: string, input: AdjustWalletDto) {
        const amountMilli = parseCredits(input.amountCredits, { signed: true, minimumMilli: 1n, maximumMilli: 100_000_000n, decimalPlaces: 3 });
        return this.ledger.runSerializable(async (tx) => {
            const user = await tx.user.findUnique({ where: { id: userId } });
            if (!user) throw new NotFoundException("用户不存在");
            await this.ledger.adjustInTransaction(tx, {
                userId,
                amountMilli,
                idempotencyKey: `admin-adjustment:${randomUUID()}`,
                description: input.reason,
                metadata: { actorId, reason: input.reason },
            });
            await tx.auditLog.create({ data: { actorId, action: "admin.wallet.adjust", targetType: "Wallet", targetId: userId, details: { amountMilli: amountMilli.toString(), reason: input.reason } } });
            return tx.wallet.findUniqueOrThrow({ where: { userId } });
        });
    }
}
