import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const DEFAULT_PORT = 17371;
export const CONFIG_DIR = path.join(os.homedir(), ".infinite-canvas");
export const CONFIG_FILE = path.join(CONFIG_DIR, "canvas-agent.json");
export const VERSION = readPackageVersion();
export type AgentCreativeMode = "vibe" | "direct";
export const AGENT_PROMPT = `你正在帮助用户操作橙月画布网站。切换网站页面用 site_navigate，可跳 / (首页)、/canvas (我的画布)、/canvas/:id (指定画布)、/image、/video、/prompts、/assets、/config。

需要改动画布时，先用 canvas_get_state 读取当前画布，再根据任务使用 canvas_get_selection、canvas_get_node、canvas_create_text_node、canvas_generate_text、canvas_generate_image、canvas_generate_video、canvas_generate_audio、canvas_create_generation_flow、canvas_create_config_node、canvas_run_generation、canvas_update_node、canvas_update_node_text、canvas_connect_nodes 等工具；复杂批量改动使用 canvas_apply_ops，删除连线使用 delete_connections。

修改现有文本节点时必须原地迭代：用户说“这个”“选中的节点”时先用 canvas_get_selection；用户按标题、内容或上下文指代节点时，先用 canvas_get_state 定位 ID，再用 canvas_get_node 读取完整正文。润色、扩写、缩写、改写或替换内容使用 canvas_update_node_text 更新同一个 ID，保留位置和连线，不要另建重复节点；只改名字或标题时只传 title，不能覆盖正文。只有用户明确要求保留旧稿或新增版本时才创建新文本节点。

本轮若有用户上传的图片附件，会同时给出 attachmentId；用户要求把附件放入画布或作为生成参考图时，必须先用 canvas_create_attachment_nodes 创建真实图片节点，再把返回的节点 ID 传给 canvas_create_generation_flow.referenceNodeIds，不要创建空图片占位节点。若当前不在画布页，需先用 site_navigate 打开画布。想了解或打开用户已有画布，用 canvas_list_projects 获取画布清单和 id，再用 site_navigate 跳 /canvas/:id 打开。

生图工作台可用 workbench_image_get_config 和 workbench_image_generate；视频创作台使用 workbench_video_get_config 和 workbench_video_generate；提示词库使用 prompts_search；“我的素材”使用 assets_list 和 assets_add。需要生成内容时直接调用对应生成工具，不要绑定特定业务场景。不要模拟鼠标点击，不要要求用户手动复制 JSON。`;

export const VIBE_AGENT_PROMPT = `你处于“创作导演”模式。用户只负责描述目标和审核方案，你负责完成工作流设计、节点创建、连接、执行、状态检查和失败修复。

遵守以下执行协议：
1. 先读取当前画布和必要配置，再根据真实上游素材设计最少但完整的工作流。不要为了显得复杂而堆节点。
2. 在第一次写入画布前，用简洁自然语言说明故事或创作逻辑、关键产物和执行顺序。不要向用户输出 JSON。
3. 多节点任务应尽量用一次 canvas_apply_ops 提交完整节点、连线和 run_generation 操作，让网页只要求一次方案审核。用户要求产出图片、视频、音频或文案时，审核方案中必须同时包含 run_generation，或使用 autoRun=true / canvas_generate_*；不能只搭空工作流就停止。图片配置应给出 model、size、quality、count，视频配置应给出 model、size、seconds；网页会把这些配置和预计积分交给用户最终确认。节点 ID、引用关系和执行顺序必须在提交前自洽。
4. 生成节点必须连接到已经存在或同批创建的真实上游节点。人物、场景、故事板等参考尚未生成成功时，不得绕过依赖直接启动下游视频。
5. 审核通过后，使用 generation_get_status 检查任务；只修复失败或缺失的环节，不重复创建已经成功的内容。
6. 用户要求局部修改时，保留未被点名的节点和结果。文本节点默认在原节点上迭代，改正文不改标题，改标题不改正文，并保留节点 ID、位置与所有连线；只有用户明确要求“另存一版”时才新建节点。涉及删除或覆盖时要明确写入审核方案。
7. 默认让画布保持易读：同类节点成组、从左到右排列、标题可扫描、连线不交叉。`;

export type SiteWorkspaceConfig = {
    workspacePath: string;
    activeThreadId?: string;
    activeThreadIds?: Record<string, string>;
    projectThreadIds?: Record<string, string[]>;
    pinnedThreadIds?: string[];
};
export type CanvasAgentConfig = { url: string; token: string; origins?: string[]; workspace?: SiteWorkspaceConfig };

export function loadConfig(create = false): CanvasAgentConfig {
    try {
        return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")) as CanvasAgentConfig;
    } catch {
        const config = { url: `http://127.0.0.1:${Number(process.env.PORT) || DEFAULT_PORT}`, token: crypto.randomBytes(18).toString("hex") };
        if (create) saveConfig(config);
        return config;
    }
}

export function saveConfig(config: CanvasAgentConfig) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function ensureSiteWorkspace(config: CanvasAgentConfig) {
    const current = config.workspace;
    if (current?.workspacePath) {
        const workspacePath = resolveWorkspacePath(current.workspacePath);
        fs.mkdirSync(workspacePath, { recursive: true });
        return { ...current, workspacePath };
    }
    const workspacePath = path.join(CONFIG_DIR, "codex-workspaces", "site");
    config.workspace = { workspacePath };
    fs.mkdirSync(workspacePath, { recursive: true });
    saveConfig(config);
    return { workspacePath };
}

export function updateSiteWorkspace(config: CanvasAgentConfig, patch: Partial<SiteWorkspaceConfig>) {
    const current = ensureSiteWorkspace(config);
    const workspacePath = patch.workspacePath ? resolveWorkspacePath(patch.workspacePath) : current.workspacePath;
    const next = { ...current, ...patch, workspacePath };
    config.workspace = {
        workspacePath: next.workspacePath,
        activeThreadId: next.activeThreadId,
        activeThreadIds: next.activeThreadIds,
        projectThreadIds: next.projectThreadIds,
        pinnedThreadIds: next.pinnedThreadIds,
    };
    fs.mkdirSync(workspacePath, { recursive: true });
    saveConfig(config);
    return config.workspace;
}

function resolveWorkspacePath(value: string) {
    if (value === "~") return os.homedir();
    if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
    return path.resolve(value);
}

function readPackageVersion() {
    try {
        const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version?: string };
        return pkg.version || "0.0.0";
    } catch {
        return "0.0.0";
    }
}
