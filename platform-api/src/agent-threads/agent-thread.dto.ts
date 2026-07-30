import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class AgentThreadQueryDto {
    @IsString()
    @MinLength(1)
    @MaxLength(160)
    projectId!: string;

    @IsOptional()
    @IsString()
    @MaxLength(120)
    search?: string;
}

export class UpsertAgentThreadDto {
    @IsString()
    @MinLength(1)
    @MaxLength(160)
    projectId!: string;

    @IsOptional()
    @IsString()
    @MaxLength(240)
    preview?: string;

    @IsOptional()
    @IsString()
    @MaxLength(160)
    name?: string;

    @IsOptional()
    @IsArray()
    @ArrayMaxSize(120)
    messages?: unknown[];

    @IsOptional()
    @IsArray()
    @ArrayMaxSize(16)
    history?: unknown[];
}

export class OpenAgentThreadDto {
    @IsString()
    @MinLength(1)
    @MaxLength(160)
    projectId!: string;
}
