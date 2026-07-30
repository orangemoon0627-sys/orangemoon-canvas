import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { UserRole } from "@prisma/client";

import type { AuthenticatedRequest } from "./auth.types";
import { ROLE_METADATA } from "./roles.decorator";

@Injectable()
export class RolesGuard implements CanActivate {
    constructor(private readonly reflector: Reflector) {}

    canActivate(context: ExecutionContext) {
        const roles = this.reflector.getAllAndOverride<UserRole[]>(ROLE_METADATA, [context.getHandler(), context.getClass()]);
        if (!roles?.length) return true;
        const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
        if (!request.user || !roles.includes(request.user.role)) throw new ForbiddenException("没有管理员权限");
        return true;
    }
}
