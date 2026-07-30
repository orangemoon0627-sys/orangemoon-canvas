import { Transform, Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsString, Length, Matches, Max, MaxLength, Min } from "class-validator";
import { PaymentProvider, RechargeStatus } from "@prisma/client";

export class CreateRechargeDto {
    @IsEnum(PaymentProvider)
    provider!: PaymentProvider;

    @Transform(({ value }) => String(value || "").trim())
    @Matches(/^(0|[1-9]\d{0,5})(?:\.\d{1,2})?$/, { message: "充值积分格式无效" })
    amountCredits!: string;

    @Transform(({ value }) => String(value || "").trim())
    @IsOptional()
    @IsString()
    @MaxLength(200)
    payerNote?: string;
}

export class RechargeListQueryDto {
    @IsOptional()
    @IsEnum(RechargeStatus)
    status?: RechargeStatus;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page = 1;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    limit = 30;
}

export class ConfirmRechargeDto {
    @Transform(({ value }) => String(value || "").trim())
    @IsString()
    @Length(3, 120)
    externalReference!: string;

    @Transform(({ value }) => String(value || "").trim())
    @IsOptional()
    @IsString()
    @MaxLength(300)
    reviewNote?: string;
}

export class RejectRechargeDto {
    @Transform(({ value }) => String(value || "").trim())
    @IsString()
    @Length(2, 300, { message: "请填写驳回原因" })
    reviewNote!: string;
}
