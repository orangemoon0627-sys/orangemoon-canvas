import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { WalletModule } from "../wallet/wallet.module";
import { GenerationService } from "./generation.service";
import { PricingService } from "./pricing.service";
import { ProviderController } from "./provider.controller";
import { ProviderUpstreamService } from "./provider-upstream.service";

@Module({ imports: [AuthModule, WalletModule], controllers: [ProviderController], providers: [GenerationService, PricingService, ProviderUpstreamService] })
export class ProviderModule {}
