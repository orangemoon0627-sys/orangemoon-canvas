import { Module } from "@nestjs/common";

import { CanvasMediaController } from "./canvas-media.controller";
import { CanvasMediaService } from "./canvas-media.service";

@Module({ controllers: [CanvasMediaController], providers: [CanvasMediaService], exports: [CanvasMediaService] })
export class CanvasMediaModule {}
