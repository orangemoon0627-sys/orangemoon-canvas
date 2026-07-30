import { Transform } from "class-transformer";
import { IsEmail, IsOptional, IsString, Length, Matches, MaxLength } from "class-validator";

export class RegisterDto {
    @Transform(({ value }) => String(value || "").trim().toLowerCase())
    @IsEmail({}, { message: "请输入有效邮箱" })
    @MaxLength(254)
    email!: string;

    @IsString()
    @Length(8, 128, { message: "密码长度需要为 8-128 位" })
    @Matches(/[A-Za-z]/, { message: "密码至少包含一个字母" })
    @Matches(/[0-9]/, { message: "密码至少包含一个数字" })
    password!: string;

    @Transform(({ value }) => String(value || "").trim())
    @IsOptional()
    @IsString()
    @Length(1, 40, { message: "昵称长度需要为 1-40 位" })
    displayName?: string;
}

export class LoginDto {
    @Transform(({ value }) => String(value || "").trim().toLowerCase())
    @IsEmail({}, { message: "请输入有效邮箱" })
    @MaxLength(254)
    email!: string;

    @IsString()
    @Length(1, 128)
    password!: string;
}
