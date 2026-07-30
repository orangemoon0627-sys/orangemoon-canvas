import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { PaymentModule } from "../payments/payment.module";
import { WalletModule } from "../wallet/wallet.module";
import { AdminRechargeController, RechargeController } from "./recharge.controller";
import { RechargeService } from "./recharge.service";

@Module({ imports: [AuthModule, PaymentModule, WalletModule], controllers: [RechargeController, AdminRechargeController], providers: [RechargeService] })
export class RechargeModule {}
