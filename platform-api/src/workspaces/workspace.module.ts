import { Global, Module } from "@nestjs/common";

import { WorkspaceController } from "./workspace.controller";
import { WorkspaceService } from "./workspace.service";

@Global()
@Module({ controllers: [WorkspaceController], providers: [WorkspaceService], exports: [WorkspaceService] })
export class WorkspaceModule {}
