import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { FastifyReply, FastifyRequest } from "fastify";

import { cookieSecure, sessionDays } from "../common/environment";
import { AuthService } from "./auth.service";
import { LoginDto, RegisterDto } from "./auth.dto";
import { SESSION_COOKIE, SessionAuthGuard } from "./session-auth.guard";
import type { AuthenticatedRequest } from "./auth.types";
import { serializeWallet } from "../wallet/wallet.serializer";

@Controller("auth")
export class AuthController {
    constructor(private readonly auth: AuthService) {}

    @Post("register")
    @Throttle({ default: { limit: 8, ttl: 60_000 } })
    async register(@Body() input: RegisterDto, @Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
        const session = await this.auth.register(input, request);
        this.setCookie(reply, session.token, session.expiresAt);
        return { ok: true, user: serializeUser(session.user) };
    }

    @Post("login")
    @HttpCode(200)
    @Throttle({ default: { limit: 10, ttl: 60_000 } })
    async login(@Body() input: LoginDto, @Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
        const session = await this.auth.login(input, request);
        this.setCookie(reply, session.token, session.expiresAt);
        return { ok: true, user: serializeUser(session.user) };
    }

    @Post("logout")
    @HttpCode(200)
    @UseGuards(SessionAuthGuard)
    async logout(@Req() request: AuthenticatedRequest, @Res({ passthrough: true }) reply: FastifyReply) {
        await this.auth.logout(request.sessionId, request.user.id);
        reply.clearCookie(SESSION_COOKIE, { path: "/", secure: cookieSecure(), sameSite: "lax" });
        return { ok: true };
    }

    @Get("me")
    @UseGuards(SessionAuthGuard)
    async me(@Req() request: AuthenticatedRequest) {
        return { ok: true, user: serializeUser(await this.auth.me(request.user.id)) };
    }

    private setCookie(reply: FastifyReply, token: string, expires: Date) {
        reply.setCookie(SESSION_COOKIE, token, {
            path: "/",
            httpOnly: true,
            secure: cookieSecure(),
            sameSite: "lax",
            expires,
            maxAge: sessionDays() * 86_400,
        });
    }
}

function serializeUser(user: Awaited<ReturnType<AuthService["me"]>>) {
    return {
        ...user,
        wallet: user.wallet ? serializeWallet(user.wallet) : null,
    };
}
