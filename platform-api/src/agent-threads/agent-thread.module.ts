import { Module } from "@nestjs/common";

import { AgentThreadController } from "./agent-thread.controller";
import { AgentThreadService } from "./agent-thread.service";

@Module({ controllers: [AgentThreadController], providers: [AgentThreadService] })
export class AgentThreadModule {}
