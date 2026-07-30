import { Controller, Get, Query, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../auth/current-user.decorator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import type { AuthenticatedUser } from "../auth/auth.types";
import { formatMilliCredits } from "../common/money";
import { PrismaService } from "../prisma/prisma.service";
import { LedgerQueryDto } from "./wallet.dto";
import { serializeWallet } from "./wallet.serializer";

@Controller("wallet")
@UseGuards(SessionAuthGuard)
export class WalletController {
    constructor(private readonly prisma: PrismaService) {}

    @Get()
    async wallet(@CurrentUser() user: AuthenticatedUser) {
        const wallet = await this.prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } });
        return { ok: true, wallet: serializeWallet(wallet) };
    }

    @Get("ledger")
    async ledger(@CurrentUser() user: AuthenticatedUser, @Query() query: LedgerQueryDto) {
        const wallet = await this.prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } });
        const where = { entries: { some: { walletId: wallet.id } } };
        const [total, transactions] = await Promise.all([
            this.prisma.ledgerTransaction.count({ where }),
            this.prisma.ledgerTransaction.findMany({
                where,
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                skip: (query.page - 1) * query.limit,
                take: query.limit,
                include: { entries: { where: { walletId: wallet.id }, orderBy: { id: "asc" } } },
            }),
        ]);
        return {
            ok: true,
            page: query.page,
            limit: query.limit,
            total,
            transactions: transactions.map((transaction) => ({
                id: transaction.id,
                type: transaction.type,
                description: transaction.description,
                createdAt: transaction.createdAt,
                entries: transaction.entries.map((entry) => ({ account: entry.account, amountMilli: entry.amountMilli.toString(), amountCredits: formatMilliCredits(entry.amountMilli) })),
            })),
        };
    }
}
