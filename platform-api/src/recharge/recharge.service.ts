import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PaymentProvider, Prisma, RechargeStatus } from "@prisma/client";
import { randomBytes } from "node:crypto";

import { formatMilliCredits, milliCreditsToFen, parseCredits } from "../common/money";
import { PrismaService } from "../prisma/prisma.service";
import { PaymentService } from "../payments/payment.service";
import { LedgerService } from "../wallet/ledger.service";
import type { ConfirmRechargeDto, CreateRechargeDto, RechargeListQueryDto, RejectRechargeDto } from "./recharge.dto";

@Injectable()
export class RechargeService {
    constructor(private readonly prisma: PrismaService, private readonly ledger: LedgerService, private readonly payments: PaymentService) {}

    async create(userId: string, input: CreateRechargeDto) {
        const method = await this.payments.method(input.provider);
        if (!method?.enabled) throw new ConflictException("这个充值方式当前未开放");
        if (!method.ready) throw new ConflictException("这个充值方式尚未配置收款码");
        const creditsMilli = parseCredits(input.amountCredits, { minimumMilli: 1_000n, maximumMilli: 100_000_000n });
        const order = await this.prisma.rechargeOrder.create({
            data: {
                publicId: rechargePublicId(),
                userId,
                provider: input.provider,
                creditsMilli,
                amountFen: milliCreditsToFen(creditsMilli),
                payerNote: input.payerNote || null,
                expiresAt: new Date(Date.now() + 48 * 60 * 60_000),
            },
        });
        await this.prisma.auditLog.create({ data: { actorId: userId, action: "recharge.create", targetType: "RechargeOrder", targetId: order.id, details: { publicId: order.publicId, provider: order.provider, amountFen: order.amountFen } } });
        return order;
    }

    async listForUser(userId: string, query: RechargeListQueryDto) {
        await this.expirePending();
        const where = { userId, ...(query.status ? { status: query.status } : {}) };
        const [total, orders] = await Promise.all([
            this.prisma.rechargeOrder.count({ where }),
            this.prisma.rechargeOrder.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (query.page - 1) * query.limit, take: query.limit }),
        ]);
        return { total, orders };
    }

    async cancel(userId: string, publicId: string) {
        const updated = await this.prisma.rechargeOrder.updateMany({ where: { publicId, userId, status: RechargeStatus.PENDING }, data: { status: RechargeStatus.CANCELLED } });
        if (updated.count !== 1) throw new ConflictException("订单不存在或已无法取消");
        const order = await this.prisma.rechargeOrder.findUniqueOrThrow({ where: { publicId } });
        await this.prisma.auditLog.create({ data: { actorId: userId, action: "recharge.cancel", targetType: "RechargeOrder", targetId: order.id } });
        return order;
    }

    async listForAdmin(query: RechargeListQueryDto) {
        await this.expirePending();
        const where = query.status ? { status: query.status } : {};
        const [total, orders] = await Promise.all([
            this.prisma.rechargeOrder.count({ where }),
            this.prisma.rechargeOrder.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (query.page - 1) * query.limit, take: query.limit, include: { user: { select: { email: true, displayName: true } }, reviewedBy: { select: { email: true, displayName: true } } } }),
        ]);
        return { total, orders };
    }

    async confirm(actorId: string, publicId: string, input: ConfirmRechargeDto) {
        return this.ledger.runSerializable(async (tx) => {
            const order = await tx.rechargeOrder.findUnique({ where: { publicId } });
            if (!order) throw new NotFoundException("充值订单不存在");
            if (order.status === RechargeStatus.CONFIRMED) return order;
            if (order.status !== RechargeStatus.PENDING || order.expiresAt <= new Date()) throw new ConflictException("订单当前不能确认");
            const duplicate = await tx.rechargeOrder.findFirst({ where: { provider: order.provider, externalReference: input.externalReference, id: { not: order.id } } });
            if (duplicate) throw new ConflictException("这个支付流水号已用于其他订单");
            const changed = await tx.rechargeOrder.updateMany({
                where: { id: order.id, status: RechargeStatus.PENDING },
                data: { status: RechargeStatus.CONFIRMED, reviewedById: actorId, reviewedAt: new Date(), externalReference: input.externalReference, reviewNote: input.reviewNote || null },
            });
            if (changed.count !== 1) throw new ConflictException("订单状态已变化，请刷新");
            await this.ledger.creditRechargeInTransaction(tx, {
                userId: order.userId,
                amountMilli: order.creditsMilli,
                idempotencyKey: `recharge:${order.id}`,
                description: `充值订单 ${order.publicId}`,
                metadata: { orderId: order.id, publicId: order.publicId, provider: order.provider, externalReference: input.externalReference },
            });
            await tx.auditLog.create({ data: { actorId, action: "recharge.confirm", targetType: "RechargeOrder", targetId: order.id, details: { publicId: order.publicId, externalReference: input.externalReference } } });
            return tx.rechargeOrder.findUniqueOrThrow({ where: { id: order.id } });
        });
    }

    async reject(actorId: string, publicId: string, input: RejectRechargeDto) {
        return this.ledger.runSerializable(async (tx) => {
            const order = await tx.rechargeOrder.findUnique({ where: { publicId } });
            if (!order) throw new NotFoundException("充值订单不存在");
            if (order.status === RechargeStatus.REJECTED) return order;
            if (order.status !== RechargeStatus.PENDING) throw new ConflictException("订单当前不能驳回");
            const changed = await tx.rechargeOrder.updateMany({ where: { id: order.id, status: RechargeStatus.PENDING }, data: { status: RechargeStatus.REJECTED, reviewedById: actorId, reviewedAt: new Date(), reviewNote: input.reviewNote } });
            if (changed.count !== 1) throw new ConflictException("订单状态已变化，请刷新");
            await tx.auditLog.create({ data: { actorId, action: "recharge.reject", targetType: "RechargeOrder", targetId: order.id, details: { publicId: order.publicId, reason: input.reviewNote } } });
            return tx.rechargeOrder.findUniqueOrThrow({ where: { id: order.id } });
        });
    }

    private async expirePending() {
        await this.prisma.rechargeOrder.updateMany({ where: { status: RechargeStatus.PENDING, expiresAt: { lte: new Date() } }, data: { status: RechargeStatus.EXPIRED } });
    }
}

function rechargePublicId() {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    return `OM${date}${randomBytes(5).toString("hex").toUpperCase()}`;
}

export function serializeRecharge(order: {
    publicId: string;
    provider: PaymentProvider;
    status: RechargeStatus;
    creditsMilli: bigint;
    amountFen: number;
    payerNote: string | null;
    externalReference: string | null;
    reviewNote: string | null;
    reviewedAt: Date | null;
    expiresAt: Date;
    createdAt: Date;
    updatedAt: Date;
    user?: { email: string; displayName: string };
    reviewedBy?: { email: string; displayName: string } | null;
}) {
    return { ...order, creditsMilli: order.creditsMilli.toString(), credits: formatMilliCredits(order.creditsMilli), amountCny: (order.amountFen / 100).toFixed(2) };
}
