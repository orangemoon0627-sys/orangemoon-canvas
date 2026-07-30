import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from "class-validator";

export class ReserveAgentTurnDto {
    @IsUUID()
    turnId!: string;

    @IsString()
    @MinLength(1)
    @MaxLength(160)
    projectId!: string;

    @IsString()
    @MinLength(1)
    @MaxLength(180)
    threadId!: string;

    @IsString()
    @MinLength(1)
    @MaxLength(120)
    model!: string;
}

export class SettleAgentTurnDto {
    @IsInt()
    @Min(0)
    @Max(2_000_000_000)
    inputTokens!: number;

    @IsInt()
    @Min(0)
    @Max(2_000_000_000)
    cachedInputTokens!: number;

    @IsInt()
    @Min(0)
    @Max(2_000_000_000)
    outputTokens!: number;

    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(2_000_000_000)
    totalTokens?: number;
}

export class ReleaseAgentTurnDto {
    @IsOptional()
    @IsString()
    @MaxLength(1_000)
    error?: string;
}
