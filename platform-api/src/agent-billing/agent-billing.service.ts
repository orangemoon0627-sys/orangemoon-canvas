import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AgentTurnStatus, LedgerTransactionType, Prisma, type AgentTurn } from "@prisma/client";

import { formatMilliCredits } from "../common/money";
import { PrismaService } from "../prisma/prisma.service";
import { LedgerService } from "../wallet/ledger.service";
import type { ReleaseAgentTurnDto, ReserveAgentTurnDto, SettleAgentTurnDto } from "./agent-billing.dto";
import { AgentPricingService } from "./agent-pricing.service";

@Injectable()
export class AgentBillingService {
    constructor(private readonly prisma: PrismaService, private readonly ledger: LedgerService, private readonly pricing: AgentPricingService) {}

    async reserve(userId: string, input: ReserveAgentTurnDto) {
        return this.ledger.runSerializable(async (tx) => {
            const existing = await tx.agentTurn.findUnique({ where: { turnId: input.turnId } });
            if (existing) return this.assertOwned(existing, userId);
            const reservedMilliCredits = this.pricing.reservationMilliCredits();
            const priceSnapshot = this.pricing.priceSnapshot() as unknown as Prisma.InputJsonValue;
            await this.ledger.reserveInTransaction(tx, {
                userId,
                amountMilli: reservedMilliCredits,
                idempotencyKey: `agent:reserve:${input.turnId}`,
                description: `${input.model} Agent 预授权`,
                metadata: { turnId: input.turnId, projectId: input.projectId, threadId: input.threadId, model: input.model },
                transactionType: LedgerTransactionType.AGENT_RESERVE,
            });
            return tx.agentTurn.create({
                data: { ...input, userId, reservedMilliCredits, priceSnapshot },
            });
        });
    }

    async settle(userId: string, turnId: string, input: SettleAgentTurnDto) {
        return this.ledger.runSerializable(async (tx) => {
            const current = this.assertOwned(await tx.agentTurn.findUnique({ where: { turnId } }), userId);
            if (current.status === AgentTurnStatus.SUCCEEDED) return current;
            if (current.status === AgentTurnStatus.FAILED) throw new ConflictException("Agent 本轮已退款，不能再次结算");
            const quote = this.pricing.quote(input, current.priceSnapshot);
            await this.ledger.settleInTransaction(tx, {
                userId,
                reservedMilli: current.reservedMilliCredits,
                chargedMilli: quote.retailMilliCredits,
                idempotencyKey: `agent:settle:${turnId}`,
                description: `${current.model} Agent 用量结算`,
                metadata: { turnId, model: current.model, ...quote.usage },
                transactionType: LedgerTransactionType.AGENT_SETTLE,
                revenueAccount: "platform.agent_revenue",
            });
            return tx.agentTurn.update({
                where: { id: current.id },
                data: {
                    status: AgentTurnStatus.SUCCEEDED,
                    chargedMilliCredits: quote.retailMilliCredits,
                    inputTokens: BigInt(quote.usage.inputTokens),
                    cachedInputTokens: BigInt(quote.usage.cachedInputTokens),
                    outputTokens: BigInt(quote.usage.outputTokens),
                    totalTokens: BigInt(quote.usage.totalTokens),
                    priceSnapshot: quote.priceSnapshot as unknown as Prisma.InputJsonValue,
                    error: null,
                    settledAt: new Date(),
                },
            });
        });
    }

    async release(userId: string, turnId: string, input: ReleaseAgentTurnDto) {
        return this.ledger.runSerializable(async (tx) => {
            const current = this.assertOwned(await tx.agentTurn.findUnique({ where: { turnId } }), userId);
            if (current.status === AgentTurnStatus.SUCCEEDED || current.status === AgentTurnStatus.FAILED) return current;
            await this.ledger.releaseInTransaction(tx, {
                userId,
                amountMilli: current.reservedMilliCredits,
                idempotencyKey: `agent:release:${turnId}`,
                description: `${current.model} Agent 失败退款`,
                metadata: { turnId, model: current.model },
                transactionType: LedgerTransactionType.AGENT_RELEASE,
            });
            return tx.agentTurn.update({
                where: { id: current.id },
                data: { status: AgentTurnStatus.FAILED, chargedMilliCredits: 0n, error: input.error?.trim().slice(0, 1_000) || "Agent 本轮未完成", settledAt: new Date() },
            });
        });
    }

    list(userId: string, limit = 100) {
        return this.prisma.agentTurn.findMany({ where: { userId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: Math.max(1, Math.min(100, limit)) });
    }

    pricingCatalog() {
        return this.pricing.catalog();
    }

    private assertOwned(turn: AgentTurn | null, userId: string) {
        if (!turn || turn.userId !== userId) throw new NotFoundException("Agent 使用记录不存在");
        return turn;
    }
}

export function serializeAgentTurn(turn: AgentTurn) {
    return {
        id: turn.turnId,
        projectId: turn.projectId,
        threadId: turn.threadId,
        model: turn.model,
        status: turn.status,
        reservedMilliCredits: turn.reservedMilliCredits.toString(),
        reservedCredits: formatMilliCredits(turn.reservedMilliCredits),
        chargedMilliCredits: turn.chargedMilliCredits.toString(),
        chargedCredits: formatMilliCredits(turn.chargedMilliCredits),
        inputTokens: Number(turn.inputTokens),
        cachedInputTokens: Number(turn.cachedInputTokens),
        outputTokens: Number(turn.outputTokens),
        totalTokens: Number(turn.totalTokens),
        error: turn.error,
        createdAt: turn.createdAt,
        updatedAt: turn.updatedAt,
        settledAt: turn.settledAt,
    };
}
