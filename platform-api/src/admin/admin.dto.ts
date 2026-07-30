import { Transform, Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsString, Length, Matches, Max, Min } from "class-validator";
import { UserStatus } from "@prisma/client";

export class AdminUsersQueryDto {
    @Transform(({ value }) => String(value || "").trim())
    @IsOptional()
    @IsString()
    search?: string;

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

export class UpdateUserStatusDto {
    @IsEnum(UserStatus)
    status!: UserStatus;
}

export class AdjustWalletDto {
    @Transform(({ value }) => String(value || "").trim())
    @Matches(/^-?(0|[1-9]\d{0,5})(?:\.\d{1,3})?$/, { message: "积分金额格式无效" })
    amountCredits!: string;

    @Transform(({ value }) => String(value || "").trim())
    @IsString()
    @Length(2, 300, { message: "请填写调账原因" })
    reason!: string;
}
