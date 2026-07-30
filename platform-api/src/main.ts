import "reflect-metadata";

import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";

import { AppModule } from "./app.module";
import { allowedOrigins, platformBodyLimitBytes, platformMaxConcurrentGenerations, platformPort } from "./common/environment";
import { isGenerationSubmission } from "./common/generation-request";

async function bootstrap() {
    const adapter = new FastifyAdapter({ bodyLimit: platformBodyLimitBytes(), trustProxy: true });
    const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, { bufferLogs: true });
    await app.register(cookie);
    await app.register(helmet, { crossOriginResourcePolicy: false });
    const origins = allowedOrigins();
    const generationLimit = platformMaxConcurrentGenerations();
    const admittedGenerationRequests = new WeakSet<object>();
    let activeGenerations = 0;
    app.enableCors({ credentials: true, origin: (origin, callback) => callback(null, !origin || origins.has(origin.replace(/\/+$/, ""))) });

    adapter.getInstance().addHook("onRequest", (request, reply, done) => {
        const origin = String(request.headers.origin || "").replace(/\/+$/, "");
        const unsafe = !["GET", "HEAD", "OPTIONS"].includes(request.method);
        if (unsafe && origin && !origins.has(origin)) {
            void reply.code(403).send({ ok: false, message: "请求来源未获授权" });
            return;
        }
        if (isGenerationSubmission(request.method, request.url)) {
            if (activeGenerations >= generationLimit) {
                void reply.code(429).header("Retry-After", "5").send({ ok: false, message: `当前生成任务已达并发上限（${generationLimit}），请稍后重试` });
                return;
            }
            activeGenerations += 1;
            admittedGenerationRequests.add(request);
        }
        done();
    });

    const releaseGeneration = (request: object) => {
        if (!admittedGenerationRequests.delete(request)) return;
        activeGenerations = Math.max(0, activeGenerations - 1);
    };
    adapter.getInstance().addHook("onError", (request, _reply, _error, done) => {
        releaseGeneration(request);
        done();
    });
    adapter.getInstance().addHook("onResponse", (request, _reply, done) => {
        releaseGeneration(request);
        done();
    });

    app.setGlobalPrefix("platform-api");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, stopAtFirstError: true }));
    app.enableShutdownHooks();
    await app.listen(platformPort(), "0.0.0.0");
}

void bootstrap();
