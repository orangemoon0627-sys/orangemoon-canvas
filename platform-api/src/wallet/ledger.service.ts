import { ConflictException, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { LedgerTransactionType, Prisma, type LedgerTransaction } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";

type TransactionClient = Prisma.TransactionClient;
type EntryInput = { walletId?: string; account: string; amountMilli: bigint };

@Injectable()
export class LedgerService {
    constructor(private readonly prisma: PrismaService) {}

    async runSerializable<T>(work: (tx: TransactionClient) => Promise<T>) {
        for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
                return await this.prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 });
            } catch (error) {
                if (this.isRetryableTransactionConflict(error)) {
                    if (attempt < 2) continue;
                    throw new ConflictException("账务事务冲突，请重试");
                }
                throw error;
            }
        }
        throw new ConflictException("账务事务冲突，请重试");
    }

    private isRetryableTransactionConflict(error: unknown) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
        if (error.code === "P2034") return true;
        if (error.code !== "P2010") return false;
        const databaseCode = error.meta?.code;
        return databaseCode === "40001" || databaseCode === "40P01";
    }

    async reserveInTransaction(tx: TransactionClient, input: { userId: string; amountMilli: bigint; idempotencyKey: string; description: string; metadata?: Prisma.InputJsonValue; transactionType?: LedgerTransactionType }) {
        const existing = await tx.ledgerTransaction.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
        if (existing) return existing;
        if (input.amountMilli <= 0n) throw new ConflictException("冻结金额必须大于零");
        const wallet = await this.walletForUpdate(tx, input.userId);
        const updated = await tx.wallet.updateMany({
            where: { id: wallet.id, availableMilliCredits: { gte: input.amountMilli } },
            data: { availableMilliCredits: { decrement: input.amountMilli }, frozenMilliCredits: { increment: input.amountMilli } },
        });
        if (updated.count !== 1) throw new HttpException("积分余额不足，请先充值", HttpStatus.PAYMENT_REQUIRED);
        return this.createBalancedTransaction(tx, {
            type: input.transactionType || LedgerTransactionType.GENERATION_RESERVE,
            idempotencyKey: input.idempotencyKey,
            userId: input.userId,
            description: input.description,
            metadata: input.metadata,
            entries: [
                { walletId: wallet.id, account: "wallet.available", amountMilli: -input.amountMilli },
                { walletId: wallet.id, account: "wallet.frozen", amountMilli: input.amountMilli },
            ],
        });
    }

    async settleInTransaction(tx: TransactionClient, input: { userId: string; reservedMilli: bigint; chargedMilli: bigint; idempotencyKey: string; description: string; metadata?: Prisma.InputJsonValue; transactionType?: LedgerTransactionType; revenueAccount?: string }) {
        const existing = await tx.ledgerTransaction.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
        if (existing) return existing;
        if (input.reservedMilli <= 0n || input.chargedMilli < 0n) throw new ConflictException("结算金额无效");
        const wallet = await this.walletForUpdate(tx, input.userId);
        const additional = input.chargedMilli > input.reservedMilli ? input.chargedMilli - input.reservedMilli : 0n;
        const refund = input.reservedMilli > input.chargedMilli ? input.reservedMilli - input.chargedMilli : 0n;
        const updated = await tx.wallet.updateMany({
            where: { id: wallet.id, frozenMilliCredits: { gte: input.reservedMilli }, ...(additional ? { availableMilliCredits: { gte: additional } } : {}) },
            data: {
                frozenMilliCredits: { decrement: input.reservedMilli },
                ...(refund ? { availableMilliCredits: { increment: refund } } : additional ? { availableMilliCredits: { decrement: additional } } : {}),
            },
        });
        if (updated.count !== 1) throw new ConflictException("冻结积分状态异常，无法结算");
        const entries: EntryInput[] = [{ walletId: wallet.id, account: "wallet.frozen", amountMilli: -input.reservedMilli }];
        if (input.chargedMilli) entries.push({ account: input.revenueAccount || "platform.generation_revenue", amountMilli: input.chargedMilli });
        if (refund) entries.push({ walletId: wallet.id, account: "wallet.available", amountMilli: refund });
        if (additional) entries.push({ walletId: wallet.id, account: "wallet.available", amountMilli: -additional });
        return this.createBalancedTransaction(tx, {
            type: input.transactionType || LedgerTransactionType.GENERATION_SETTLE,
            idempotencyKey: input.idempotencyKey,
            userId: input.userId,
            description: input.description,
            metadata: input.metadata,
            entries,
        });
    }

    async releaseInTransaction(tx: TransactionClient, input: { userId: string; amountMilli: bigint; idempotencyKey: string; description: string; metadata?: Prisma.InputJsonValue; transactionType?: LedgerTransactionType }) {
        const existing = await tx.ledgerTransaction.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
        if (existing) return existing;
        const wallet = await this.walletForUpdate(tx, input.userId);
        const updated = await tx.wallet.updateMany({
            where: { id: wallet.id, frozenMilliCredits: { gte: input.amountMilli } },
            data: { frozenMilliCredits: { decrement: input.amountMilli }, availableMilliCredits: { increment: input.amountMilli } },
        });
        if (updated.count !== 1) throw new ConflictException("冻结积分状态异常，无法释放");
        return this.createBalancedTransaction(tx, {
            type: input.transactionType || LedgerTransactionType.GENERATION_RELEASE,
            idempotencyKey: input.idempotencyKey,
            userId: input.userId,
            description: input.description,
            metadata: input.metadata,
            entries: [
                { walletId: wallet.id, account: "wallet.frozen", amountMilli: -input.amountMilli },
                { walletId: wallet.id, account: "wallet.available", amountMilli: input.amountMilli },
            ],
        });
    }

    async creditRechargeInTransaction(tx: TransactionClient, input: { userId: string; amountMilli: bigint; idempotencyKey: string; description: string; metadata?: Prisma.InputJsonValue }) {
        const existing = await tx.ledgerTransaction.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
        if (existing) return existing;
        const wallet = await this.walletForUpdate(tx, input.userId);
        await tx.wallet.update({ where: { id: wallet.id }, data: { availableMilliCredits: { increment: input.amountMilli } } });
        return this.createBalancedTransaction(tx, {
            type: LedgerTransactionType.RECHARGE,
            idempotencyKey: input.idempotencyKey,
            userId: input.userId,
            description: input.description,
            metadata: input.metadata,
            entries: [
                { walletId: wallet.id, account: "wallet.available", amountMilli: input.amountMilli },
                { account: "platform.recharge_clearing", amountMilli: -input.amountMilli },
            ],
        });
    }

    async adjustInTransaction(tx: TransactionClient, input: { userId: string; amountMilli: bigint; idempotencyKey: string; description: string; metadata?: Prisma.InputJsonValue }) {
        const existing = await tx.ledgerTransaction.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
        if (existing) return existing;
        const wallet = await this.walletForUpdate(tx, input.userId);
        if (input.amountMilli < 0n) {
            const updated = await tx.wallet.updateMany({ where: { id: wallet.id, availableMilliCredits: { gte: -input.amountMilli } }, data: { availableMilliCredits: { increment: input.amountMilli } } });
            if (updated.count !== 1) throw new ConflictException("用户可用积分不足，无法扣减");
        } else {
            await tx.wallet.update({ where: { id: wallet.id }, data: { availableMilliCredits: { increment: input.amountMilli } } });
        }
        return this.createBalancedTransaction(tx, {
            type: LedgerTransactionType.ADMIN_ADJUSTMENT,
            idempotencyKey: input.idempotencyKey,
            userId: input.userId,
            description: input.description,
            metadata: input.metadata,
            entries: [
                { walletId: wallet.id, account: "wallet.available", amountMilli: input.amountMilli },
                { account: "platform.admin_adjustment", amountMilli: -input.amountMilli },
            ],
        });
    }

    private async walletForUpdate(tx: TransactionClient, userId: string) {
        await tx.$queryRaw`SELECT id FROM "Wallet" WHERE "userId" = ${userId} FOR UPDATE`;
        const wallet = await tx.wallet.findUnique({ where: { userId } });
        if (!wallet) throw new ConflictException("用户钱包不存在");
        return wallet;
    }

    private async createBalancedTransaction(tx: TransactionClient, input: {
        type: LedgerTransactionType;
        idempotencyKey: string;
        userId: string;
        description: string;
        metadata?: Prisma.InputJsonValue;
        entries: EntryInput[];
    }): Promise<LedgerTransaction> {
        const sum = input.entries.reduce((total, entry) => total + entry.amountMilli, 0n);
        if (sum !== 0n || input.entries.length < 2 || input.entries.some((entry) => entry.amountMilli === 0n)) throw new ConflictException("账本分录不平衡");
        return tx.ledgerTransaction.create({
            data: {
                type: input.type,
                idempotencyKey: input.idempotencyKey,
                userId: input.userId,
                description: input.description,
                metadata: input.metadata,
                entries: { create: input.entries },
            },
        });
    }
}
