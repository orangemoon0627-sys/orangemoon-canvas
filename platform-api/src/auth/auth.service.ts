import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { Algorithm, hash, verify } from "@node-rs/argon2";
import { Prisma, WorkspaceKind, WorkspaceRole, type User } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";

import { allowFirstUserAdmin, sessionDays } from "../common/environment";
import { hashRequestIp, trimUserAgent } from "../common/request";
import { PrismaService } from "../prisma/prisma.service";
import type { FastifyRequest } from "fastify";
import type { LoginDto, RegisterDto } from "./auth.dto";

const ARGON_OPTIONS = { algorithm: Algorithm.Argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1, outputLen: 32 } as const;

@Injectable()
export class AuthService {
    constructor(private readonly prisma: PrismaService) {}

    async register(input: RegisterDto, request: FastifyRequest) {
        const passwordHash = await hash(input.password, ARGON_OPTIONS);
        let user: User;
        try {
            user = await this.prisma.$transaction(async (tx) => {
                await tx.$executeRaw`SELECT pg_advisory_xact_lock(71420260727)`;
                const userCount = await tx.user.count();
                const role = userCount === 0 && allowFirstUserAdmin() ? "ADMIN" : "USER";
                const created = await tx.user.create({
                    data: {
                        email: input.email,
                        passwordHash,
                        displayName: input.displayName || input.email.split("@")[0] || "橙月用户",
                        role,
                        wallet: { create: {} },
                    },
                });
                const personalWorkspace = await tx.workspace.create({
                    data: {
                        publicId: `personal_${created.id}`,
                        name: `${created.displayName}的个人空间`,
                        kind: WorkspaceKind.PERSONAL,
                        createdById: created.id,
                        personalForUserId: created.id,
                    },
                });
                await tx.workspaceMember.create({ data: { workspaceId: personalWorkspace.id, userId: created.id, role: WorkspaceRole.OWNER } });
                await tx.auditLog.create({ data: { actorId: created.id, action: "auth.register", targetType: "User", targetId: created.id, details: { role }, ipHash: hashRequestIp(request) } });
                return created;
            }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("这个邮箱已经注册");
            throw error;
        }
        return this.createSession(user, request);
    }

    async login(input: LoginDto, request: FastifyRequest) {
        const user = await this.prisma.user.findUnique({ where: { email: input.email } });
        if (!user) {
            await hash(input.password, ARGON_OPTIONS);
            throw new UnauthorizedException("邮箱或密码错误");
        }
        const valid = await verify(user.passwordHash, input.password);
        if (!valid) throw new UnauthorizedException("邮箱或密码错误");
        if (user.status !== "ACTIVE") throw new UnauthorizedException("账户已停用");
        await this.prisma.auditLog.create({ data: { actorId: user.id, action: "auth.login", targetType: "Session", ipHash: hashRequestIp(request) } });
        return this.createSession(user, request);
    }

    async logout(sessionId: string, userId: string) {
        await this.prisma.$transaction([
            this.prisma.session.updateMany({ where: { id: sessionId, userId, revokedAt: null }, data: { revokedAt: new Date() } }),
            this.prisma.auditLog.create({ data: { actorId: userId, action: "auth.logout", targetType: "Session", targetId: sessionId } }),
        ]);
    }

    async me(userId: string) {
        return this.prisma.user.findUniqueOrThrow({
            where: { id: userId },
            select: { id: true, email: true, displayName: true, role: true, status: true, createdAt: true, wallet: { select: { availableMilliCredits: true, frozenMilliCredits: true, updatedAt: true } } },
        });
    }

    private async createSession(user: User, request: FastifyRequest) {
        const token = randomBytes(32).toString("base64url");
        const tokenHash = createHash("sha256").update(token).digest("hex");
        const expiresAt = new Date(Date.now() + sessionDays() * 86_400_000);
        await this.prisma.session.create({
            data: { tokenHash, userId: user.id, expiresAt, ipHash: hashRequestIp(request), userAgent: trimUserAgent(request) },
        });
        await this.prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
        return { token, expiresAt, user: await this.me(user.id) };
    }
}
