import { IsEmail, IsEnum, IsString, Length, MaxLength } from "class-validator";
import { Transform } from "class-transformer";
import { WorkspaceRole } from "@prisma/client";

export class CreateWorkspaceDto {
    @Transform(({ value }) => String(value || "").trim())
    @IsString()
    @Length(1, 80)
    name!: string;
}

export class RenameWorkspaceDto extends CreateWorkspaceDto {}

export class AddWorkspaceMemberDto {
    @Transform(({ value }) => String(value || "").trim().toLowerCase())
    @IsEmail()
    @MaxLength(254)
    email!: string;

    @IsEnum(WorkspaceRole)
    role!: WorkspaceRole;
}

export class UpdateWorkspaceMemberDto {
    @IsEnum(WorkspaceRole)
    role!: WorkspaceRole;
}

export class CreateWorkspaceInviteDto extends AddWorkspaceMemberDto {}
