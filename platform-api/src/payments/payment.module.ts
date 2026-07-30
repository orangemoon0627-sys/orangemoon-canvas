import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { AdminPaymentController, PaymentController } from "./payment.controller";
import { PaymentService } from "./payment.service";

@Module({ imports: [AuthModule], controllers: [PaymentController, AdminPaymentController], providers: [PaymentService], exports: [PaymentService] })
export class PaymentModule {}
