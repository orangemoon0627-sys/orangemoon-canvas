import { Transform } from "class-transformer";
import { IsBoolean, IsEnum, IsIn, IsString, Length, MaxLength } from "class-validator";
import { PaymentProvider } from "@prisma/client";

export class UpdatePaymentSettingDto {
    @IsBoolean()
    enabled!: boolean;

    @Transform(({ value }) => String(value || "").trim())
    @IsString()
    @Length(1, 80, { message: "请填写收款方" })
    payee!: string;

    @Transform(({ value }) => String(value || "").trim())
    @IsString()
    @Length(2, 500, { message: "请填写 2-500 字的付款说明" })
    instructions!: string;
}

export class UploadPaymentQrDto {
    @IsIn(["image/png", "image/jpeg", "image/webp"])
    mimeType!: "image/png" | "image/jpeg" | "image/webp";

    @IsString()
    @MaxLength(2_800_000, { message: "收款码图片不能超过 2MB" })
    dataBase64!: string;
}

export class PaymentProviderParamDto {
    @IsEnum(PaymentProvider)
    provider!: PaymentProvider;
}
