<p align="center">
  <img src="web/public/logo.svg" width="96" alt="橙月画布 logo">
</p>

<h1 align="center">橙月画布</h1>

<p align="center">
  <a href="https://linux.do/"><img src="https://img.shields.io/badge/Linux.do-Community-2b6de8?style=flat-square" alt="Linux.do"></a>
  <a href="https://github.com/orangemoon0627-sys/orangemoon-canvas"><img src="https://img.shields.io/badge/GitHub-Source-181717?style=flat-square&logo=github" alt="GitHub source"></a>
  <a href="https://github.com/orangemoon0627-sys/orangemoon-canvas/tags"><img src="https://img.shields.io/github/v/tag/orangemoon0627-sys/orangemoon-canvas?style=flat-square&label=version" alt="Version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-f97316?style=flat-square" alt="License"></a>
  <a href="https://vite.dev/"><img src="https://img.shields.io/badge/Vite-7-646cff?style=flat-square&logo=vite&logoColor=white" alt="Vite"></a>
  <a href="https://reactrouter.com/"><img src="https://img.shields.io/badge/React_Router-7-ca4245?style=flat-square&logo=reactrouter&logoColor=white" alt="React Router"></a>
</p>

<p align="center">
  <a href="https://trendshift.io/repositories/50077?utm_source=trendshift-badge&amp;utm_medium=badge&amp;utm_campaign=badge-trendshift-50077" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/trendshift/repositories/50077/daily?language=TypeScript" alt="basketikun%2Finfinite-canvas | Trendshift" width="250" height="55"></a>
</p>

<p align="center">
  <a href="docs/content/docs/overview/quick-start.mdx">快速开始</a> · <a href="docs/content/docs/overview/features.mdx">功能介绍</a> · <a href="docs/content/docs/overview/docker.mdx">Docker 部署</a> · <a href="deploy/standalone/README.md">生产部署</a> · <a href="docs/content/docs/canvas/canvas-node-manual.mdx">画布节点操作手册</a> · <a href="docs/content/docs/canvas/canvas-shortcuts.mdx">画布快捷键</a> · <a href="CLA.md">贡献者协议</a> · <a href="SECURITY.md">漏洞提交</a> · <a href="canvas-agent/README.md">Canvas Agent</a>
</p>

橙月画布是一款面向图片与视频创作的节点式 AI 工作台。本分支基于 [basketikun/infinite-canvas](https://github.com/basketikun/infinite-canvas) 开发，保留原项目作者、仓库标识与 AGPL-3.0 开源许可；产品界面使用“橙月画布”品牌。

> [!CAUTION]
> 项目目前处于开发阶段。账户、钱包、人工充值、官方模型计费、账户级画布云同步和单机媒体持久化已可用于内部试用；队列、对象存储、正式商户支付和生产监控尚未完成，不建议直接作为公网收费服务使用。
>
> 如果你需要稳定维护自己的分支，建议自行 fork 后独立开发。二次开发与 PR 请保留原作者信息和前端页面标识。

## 赞助商

<table>
  <tr>
    <td width="190" align="center">
      <a href="https://www.atlascloud.ai/zh?utm_source=github&amp;utm_medium=link&amp;utm_campaign=infinite-canvas"><img src="assets/atlascloud.svg" width="163" alt="Atlas Cloud"></a>
    </td>
    <td>
      <a href="https://www.atlascloud.ai/zh?utm_source=github&amp;utm_medium=link&amp;utm_campaign=infinite-canvas">Atlas Cloud</a> is a full-modal AI inference platform that gives developers a single AI API to access video generation, image generation, and LLM APIs. Instead of managing multiple vendor integrations, you connect once and get unified access to 300+ curated models across all modalities. Check out <a href="https://www.atlascloud.ai/console/coding-plan">Atlas Cloud's new coding plan promotion</a> for more budget-friendly API access.
    </td>
  </tr>
</table>

## 核心功能

- 橙月画布：多画布项目、节点拖拽缩放、连线、小地图、撤销重做、导入导出。
- AI 创作：支持文生图、图生图、参考图编辑、文本问答、音频和视频生成；自定义渠道可由浏览器直连，橙月官方渠道统一经过服务端计费网关。
- 官方模型：内置 Image 2、两款 Seedance 2.0 独家 API（5 个可选分辨率规格）和 MiniMax Speech 2.8 HD/Turbo，供应商密钥不下发浏览器。
- 平台账户：支持邮箱注册登录、HttpOnly 会话、积分钱包、账户资产、使用记录与账本流水；管理员可审核人工充值、管理用户和执行带审计记录的积分调账。
- 云端 Agent：登录后可直接使用 `GPT-5.6 Terra` 理解需求、读取画布并组合节点；每个账户独立会话，节点写操作在网页中审核后执行。
- 画布助手：围绕选中节点和上游节点对话、生图，并把结果插回画布。
- 本地 Agent：通过本机 Canvas Agent 连接 Codex / Claude Code，让 Agent 通过 MCP 操作当前画布；
- Codex App 插件：提供 Codex app 插件，安装后会自动注册 MCP 并尝试拉起本地 Agent。
- 插件系统：支持通过 URL 动态安装 / 启用 / 更新 / 卸载远程节点插件，并提供 TypeScript SDK 自行开发画布节点插件。
- 自定义接口调用：可自定义生图 / 视频接口的调用方式，灵活适配各类中转站与自建服务。
- 提示词库：浏览器前端直连多个 GitHub 开源项目，并缓存到 IndexedDB。

完整功能说明见 [功能介绍](docs/content/docs/overview/features.mdx)。

如果你在为担心没有合适的生图API来发愁，可以查看该免费生图项目：[chatgpt2api](https://github.com/basketikun/chatgpt2api)

## 快速开始

自定义渠道的 AI API Key 和 Base URL 保存在浏览器本地。登录后，画布项目、节点/连线、内置助手上下文和账户资产元数据按账户保存到 PostgreSQL，图片/视频/音频同步到服务器持久化媒体卷，IndexedDB 仅作为本机缓存。橙月官方渠道密钥只配置在平台 API。

### 本地开发

```bash
git clone https://github.com/orangemoon0627-sys/orangemoon-canvas.git
cd orangemoon-canvas
docker compose -f docker-compose.local.yml up -d postgres
cp platform-api/.env.example platform-api/.env

# 终端 1：平台 API
cd platform-api
npm ci
npm run db:migrate
npm run build
npm start

# 终端 2：Web
cd ../web
bun install
bun run dev -- --port 4311
```

本地访问 `http://127.0.0.1:4311`。开发配置允许首个注册用户成为管理员；生产环境必须关闭该开关并通过受控命令创建管理员。

### Docker 运行

```bash
git clone https://github.com/orangemoon0627-sys/orangemoon-canvas.git
cd orangemoon-canvas
docker compose up -d
```

Compose 会启动 PostgreSQL、一次性迁移、平台 API、云端 Canvas Agent 和 nginx Web 应用。运行后默认端口 3000，可访问 `http://localhost:3000`。启用云端画布对话需要在服务端提供 `OPENAI_BASE_URL`、`OPENAI_API_KEY`，模型默认是 `gpt-5.6-terra`。

自定义渠道可在右上角配置 OpenAI 兼容 `Base URL` 和 `API Key`。官方渠道需要在服务端环境变量或密钥管理服务中配置 MetaJing/MiniMax 密钥。

如果默认的OpenAI接口调用方式与您的API不同，可自定义生图/视频脚本调用。

## 效果展示

<table width="100%">
  <tr>
    <td width="50%"><img src="https://i.ibb.co/TDFvGWDT/image.png" alt="image" border="0"></td>
    <td width="50%"><img src="https://i.ibb.co/zVwJq3YS/image.png" alt="image" border="0"></td>
  </tr>
  <tr>
    <td width="50%"><img src="https://i.ibb.co/PvY3qhhK/image.png" alt="image" border="0"></td>
    <td width="50%"><img src="https://i.ibb.co/7D04LwN/image.png" alt="image" border="0"></td>
  </tr>
  <tr>
    <td width="50%"><img src="https://i.ibb.co/bj30FtS5/5.png" alt="5" border="0"></td>
    <td width="50%"><img src="https://i.ibb.co/hxRvjw51/image.png" alt="image" border="0"></td>
  </tr>
  <tr>
    <td width="50%"><img src="https://i.ibb.co/jkWsF8q1/image.png" alt="image" border="0"></td>
    <td width="50%"><img src="https://i.ibb.co/XrnfXHx7/image.png" alt="image" border="0"></td>
  </tr>
</table>

## 联系方式

项目定制二次开发需求 / 生图 API 需求可联系。

邮箱：1844025705@qq.com · QQ：1844025705

## 赞助支持

本项目长期开放广告赞助合作，欢迎品牌 / 产品投放，你的支持是持续更新的动力！

有广告赞助意向请通过上方联系方式沟通。

## 社区支持

学 AI，上 L 站：[LinuxDO](https://linux.do/)

点击链接加入群聊【AI开源交流】：https://qm.qq.com/q/DFnKzZ807u

## 开源协议

本项目使用 GNU Affero General Public License v3.0，见 [LICENSE](LICENSE)。

## Star History

<a href="https://www.star-history.com/?repos=basketikun%2Finfinite-canvas&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=basketikun/infinite-canvas&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=basketikun/infinite-canvas&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=basketikun/infinite-canvas&type=date&legend=top-left" />
 </picture>
</a>
