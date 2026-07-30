#!/usr/bin/env node

if (process.argv[2] === "mcp") {
    const { startMcpServer } = await import("./mcp-server.js");
    await startMcpServer();
} else if (process.env.CANVAS_AGENT_MODE === "cloud") {
    const { startCloudHttpServer } = await import("./cloud-http-server.js");
    startCloudHttpServer();
} else {
    const { startHttpServer } = await import("./http-server.js");
    startHttpServer();
}
