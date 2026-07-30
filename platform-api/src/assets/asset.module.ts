import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { AssetController } from "./asset.controller";
import { AssetService } from "./asset.service";

@Module({ imports: [AuthModule], controllers: [AssetController], providers: [AssetService], exports: [AssetService] })
export class AssetModule {}
