import { Transform, Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsEnum, IsInt, IsObject, IsOptional, IsString, Length, Max, MaxLength, Min } from "class-validator";
import { AssetKind } from "@prisma/client";

export class AssetListQueryDto {
    @Transform(({ value }) => String(value || "").trim())
    @IsOptional()
    @IsString()
    @MaxLength(120)
    search?: string;

    @IsOptional()
    @IsEnum(AssetKind)
    kind?: AssetKind;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page = 1;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(500)
    limit = 100;
}

export class UpsertAssetDto {
    @IsEnum(AssetKind)
    kind!: AssetKind;

    @Transform(({ value }) => String(value || "").trim())
    @IsString()
    @Length(1, 160)
    title!: string;

    @Transform(({ value }) => String(value || "").trim())
    @IsOptional()
    @IsString()
    @MaxLength(4096)
    coverUrl?: string;

    @IsArray()
    @ArrayMaxSize(30)
    @IsString({ each: true })
    @MaxLength(40, { each: true })
    tags: string[] = [];

    @Transform(({ value }) => String(value || "").trim())
    @IsOptional()
    @IsString()
    @MaxLength(160)
    source?: string;

    @Transform(({ value }) => String(value || "").trim())
    @IsOptional()
    @IsString()
    @MaxLength(1000)
    note?: string;

    @IsObject()
    data!: Record<string, unknown>;

    @IsOptional()
    @IsObject()
    metadata?: Record<string, unknown>;
}
