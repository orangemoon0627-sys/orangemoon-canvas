import { ArrayMaxSize, IsArray, IsString, MaxLength } from "class-validator";

export class MissingCanvasMediaDto {
    @IsArray()
    @ArrayMaxSize(300)
    @IsString({ each: true })
    @MaxLength(160, { each: true })
    keys!: string[];
}
