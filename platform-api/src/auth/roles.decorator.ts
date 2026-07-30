import { SetMetadata } from "@nestjs/common";
import type { UserRole } from "@prisma/client";

export const ROLE_METADATA = "orange-moon:roles";
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLE_METADATA, roles);
