import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Put, Query, UseGuards } from "@nestjs/common";

import type { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { AssetListQueryDto, UpsertAssetDto } from "./asset.dto";
import { AssetService, serializeAsset } from "./asset.service";

@Controller("assets")
@UseGuards(SessionAuthGuard)
export class AssetController {
    constructor(private readonly assets: AssetService) {}

    @Get()
    async list(@CurrentUser() user: AuthenticatedUser, @Headers("x-workspace-id") workspaceId: string | undefined, @Query() query: AssetListQueryDto) {
        const result = await this.assets.list(user.id, workspaceId, query);
        return { ok: true, total: result.total, assets: result.assets.map(serializeAsset) };
    }

    @Put(":publicId")
    async upsert(@CurrentUser() user: AuthenticatedUser, @Headers("x-workspace-id") workspaceId: string | undefined, @Param("publicId") publicId: string, @Body() input: UpsertAssetDto) {
        return { ok: true, asset: serializeAsset(await this.assets.upsert(user.id, workspaceId, publicId, input)) };
    }

    @Delete(":publicId")
    @HttpCode(200)
    async remove(@CurrentUser() user: AuthenticatedUser, @Headers("x-workspace-id") workspaceId: string | undefined, @Param("publicId") publicId: string) {
        await this.assets.remove(user.id, workspaceId, publicId);
        return { ok: true };
    }
}
