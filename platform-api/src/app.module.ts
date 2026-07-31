import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";

import { AuthModule } from "./auth/auth.module";
import { AgentBillingModule } from "./agent-billing/agent-billing.module";
import { AgentThreadModule } from "./agent-threads/agent-thread.module";
import { AdminModule } from "./admin/admin.module";
import { AssetModule } from "./assets/asset.module";
import { CanvasMediaModule } from "./canvas-media/canvas-media.module";
import { CanvasProjectModule } from "./canvas-projects/canvas-project.module";
import { validateEnvironment } from "./common/environment";
import { HealthController } from "./health/health.controller";
import { PrismaModule } from "./prisma/prisma.module";
import { PaymentModule } from "./payments/payment.module";
import { RechargeModule } from "./recharge/recharge.module";
import { ProviderModule } from "./providers/provider.module";
import { WalletModule } from "./wallet/wallet.module";

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
        ThrottlerModule.forRoot([{ name: "default", ttl: 60_000, limit: 120 }]),
        PrismaModule,
        AuthModule,
        AgentBillingModule,
        AgentThreadModule,
        AssetModule,
        CanvasMediaModule,
        CanvasProjectModule,
        WalletModule,
        PaymentModule,
        RechargeModule,
        AdminModule,
        ProviderModule,
    ],
    controllers: [HealthController],
    providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
