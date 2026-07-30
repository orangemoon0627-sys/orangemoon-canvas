import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { createHash } from "node:crypto";

import { PrismaService } from "../prisma/prisma.service";
import type { AuthenticatedRequest } from "./auth.types";

export const SESSION_COOKIE = "om_session";

@Injectable()
export class SessionAuthGuard implements CanActivate {
    constructor(private readonly prisma: PrismaService) {}

    async canActivate(context: ExecutionContext) {
        const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
        const bearer = String(request.headers.authorization || "").match(/^Bearer\s+(.+)$/i)?.[1];
        const token = String(request.cookies?.[SESSION_COOKIE] || bearer || "").trim();
        if (!token) throw new UnauthorizedException("请先登录");
        const tokenHash = createHash("sha256").update(token).digest("hex");
        const session = await this.prisma.session.findUnique({
            where: { tokenHash },
            include: { user: { select: { id: true, email: true, displayName: true, role: true, status: true } } },
        });
        if (!session || session.revokedAt || session.expiresAt <= new Date() || session.user.status !== "ACTIVE") throw new UnauthorizedException("登录已失效，请重新登录");
        request.user = session.user;
        request.sessionId = session.id;
        if (Date.now() - session.lastSeenAt.getTime() > 15 * 60_000) {
            void this.prisma.session.updateMany({ where: { id: session.id, revokedAt: null }, data: { lastSeenAt: new Date() } });
        }
        return true;
    }
}
