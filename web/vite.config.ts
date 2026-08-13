import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

import { parseChangelog } from "./src/lib/release";

const webDir = dirname(fileURLToPath(import.meta.url));
const localVersion = readFileSync(resolve(webDir, "../VERSION"), "utf8").trim() || "dev";
const localChangelog = readFileSync(resolve(webDir, "../CHANGELOG.md"), "utf8");

// 暴露 /plugins/index.json:列出 public/plugins 下的本地插件文件,
// 供前端自动发现并加入插件列表(默认关闭)。dev 下实时读目录,构建时产出静态清单。
function localPluginsManifest(): Plugin {
    const pluginsDir = resolve(webDir, "public/plugins");
    const listLocalPlugins = () => {
        try {
            return readdirSync(pluginsDir)
                .filter((file) => file.endsWith(".js"))
                .sort()
                .map((file) => `/plugins/${file}`);
        } catch {
            return [];
        }
    };
    return {
        name: "local-plugins-manifest",
        configureServer(server) {
            server.middlewares.use("/plugins/index.json", (_req, res) => {
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify(listLocalPlugins()));
            });
        },
        generateBundle() {
            this.emitFile({ type: "asset", fileName: "plugins/index.json", source: JSON.stringify(listLocalPlugins()) });
        },
    };
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, webDir, "");
    const platformApiTarget = env.PLATFORM_API_PROXY_TARGET || "http://127.0.0.1:17400";
    const canvasAgentTarget = env.CANVAS_AGENT_PROXY_TARGET;
    const remotePlatformApi = /^https:\/\//i.test(platformApiTarget);

    return {
        base: env.VITE_BASE || "/",
        plugins: [react(), localPluginsManifest()],
        resolve: {
            alias: {
                "@": resolve(webDir, "src"),
            },
        },
        define: {
            __APP_VERSION__: JSON.stringify(localVersion),
            __APP_RELEASES__: JSON.stringify(parseChangelog(localChangelog)),
        },
        server: {
            proxy: {
                "/platform-api": {
                    target: platformApiTarget,
                    changeOrigin: true,
                    configure(proxy) {
                        if (!remotePlatformApi) return;
                        const targetOrigin = new URL(platformApiTarget).origin;
                        proxy.on("proxyReq", (request) => {
                            request.setHeader("Origin", targetOrigin);
                        });
                        proxy.on("proxyRes", (response) => {
                            const cookies = response.headers["set-cookie"];
                            if (cookies) response.headers["set-cookie"] = cookies.map((cookie) => cookie.replace(/;\s*Secure/gi, ""));
                        });
                    },
                },
                ...(canvasAgentTarget
                    ? {
                          "/canvas-agent": {
                              target: canvasAgentTarget,
                              changeOrigin: true,
                              ws: true,
                          },
                      }
                    : {}),
            },
        },
    };
});
