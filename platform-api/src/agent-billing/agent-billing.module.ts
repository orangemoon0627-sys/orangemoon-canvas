import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { WalletModule } from "../wallet/wallet.module";
import { AgentBillingController } from "./agent-billing.controller";
import { AgentBillingService } from "./agent-billing.service";
import { AgentPricingService } from "./agent-pricing.service";

@Module({ imports: [AuthModule, WalletModule], controllers: [AgentBillingController], providers: [AgentBillingService, AgentPricingService] })
export class AgentBillingModule {}
