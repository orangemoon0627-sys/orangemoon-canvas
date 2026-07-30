import { Module } from "@nestjs/common";

import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { RolesGuard } from "./roles.guard";
import { SessionAuthGuard } from "./session-auth.guard";

@Module({ controllers: [AuthController], providers: [AuthService, SessionAuthGuard, RolesGuard], exports: [SessionAuthGuard, RolesGuard] })
export class AuthModule {}
