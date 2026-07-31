# 独立服务器部署

该模板用于带宿主机 Caddy 的单机 Ubuntu 服务器。Web 只绑定 `127.0.0.1:4320`，PostgreSQL、Platform API 与 Canvas Agent 均不映射宿主机端口。服务使用独立 Compose 项目、网络、数据库卷、日志轮转和资源限制。

## 容量边界

- 默认允许 5 路官方生成和 5 路 Terra 对话并发，适合 8 核、8GB 内存服务器上的约 5 个创作账号。
- 模型推理由外部 API 执行，本机主要承载账户、计费、媒体转发、会话与节点编排。
- 画布项目和 Agent 上下文保存在 PostgreSQL，媒体文件保存在独立持久化卷；浏览器 IndexedDB 仅作本机缓存。发布前后必须同时保留数据库卷与 `orangemoon-canvas-media` 卷。
- 正式扩大到十几名活跃创作者前，应增加对象存储、持久任务队列、独立 worker、监控告警和正式支付回调。

## 发布步骤

1. 在可信构建机生成 `linux/amd64` 的四个不可变镜像：Web、Platform API、数据库迁移和 Canvas Agent。
2. 将镜像包和本目录文件上传到 `/opt/orangemoon-canvas`，私有 `.env` 权限设为 `0600`。
3. 首次迁移时先单独启动 PostgreSQL，再恢复经过 `pg_restore --list` 校验的自定义格式备份。
4. 加载镜像后执行 `docker compose --env-file .env -f compose.yml up -d`。
5. 将 `Caddyfile.snippet` 合并到 `/etc/caddy/Caddyfile`，依次执行 `caddy validate` 和 `systemctl reload caddy`。
6. 安装备份 service/timer，并执行一次人工备份验证。

正式入口为 `https://canvas.orangemoon.tech`，`https://canvas.154-12-85-189.sslip.io` 作为同机备用入口保留。
旧 `https://canvas.38-76-223-32.sslip.io` 可在迁移期反向代理到正式站；用户在旧 Origin 登录一次后，新版会把该 Origin 的历史 IndexedDB 画布归户上传。迁移完成前不得清理旧站点数据。

API Key、数据库密码、内部签名密钥、收款信息和管理员凭据不得提交到 GitHub 或写进镜像。
