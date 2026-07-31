import { IsISO8601, IsObject, IsString, Length, MaxLength } from "class-validator";

export class UpsertCanvasProjectDto {
    @IsString()
    @Length(1, 160)
    title!: string;

    @IsISO8601({ strict: true })
    createdAt!: string;

    @IsISO8601({ strict: true })
    updatedAt!: string;

    @IsObject()
    data!: Record<string, unknown>;
}

export class DeleteCanvasProjectDto {
    @IsISO8601({ strict: true })
    deletedAt!: string;
}

export class CanvasProjectParamDto {
    @IsString()
    @MaxLength(160)
    publicId!: string;
}
