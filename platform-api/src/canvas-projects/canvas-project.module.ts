import { Module } from "@nestjs/common";

import { CanvasProjectController } from "./canvas-project.controller";
import { CanvasProjectService } from "./canvas-project.service";

@Module({ controllers: [CanvasProjectController], providers: [CanvasProjectService] })
export class CanvasProjectModule {}
