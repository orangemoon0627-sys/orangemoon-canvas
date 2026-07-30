import type { UserRole, UserStatus } from "@prisma/client";
import type { FastifyRequest } from "fastify";

export type AuthenticatedUser = {
    id: string;
    email: string;
    displayName: string;
    role: UserRole;
    status: UserStatus;
};

export type AuthenticatedRequest = FastifyRequest & {
    user: AuthenticatedUser;
    sessionId: string;
};
