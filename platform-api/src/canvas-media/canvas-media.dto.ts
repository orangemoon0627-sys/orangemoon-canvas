import { ArrayMaxSize, IsArray, IsString, Matches, MaxLength } from "class-validator";

export class MissingCanvasMediaDto {
    @IsArray()
    @ArrayMaxSize(300)
    @IsString({ each: true })
    @MaxLength(160, { each: true })
    keys!: string[];
}

export class ComposeCanvasMediaDto {
    @IsString()
    @Matches(/^video:[A-Za-z0-9_-]{8,120}$/)
    @MaxLength(160)
    videoStorageKey!: string;

    @IsString()
    @Matches(/^audio:[A-Za-z0-9_-]{8,120}$/)
    @MaxLength(160)
    audioStorageKey!: string;
}
