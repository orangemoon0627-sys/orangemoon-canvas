# 香港主机部署

该部署用于共享的 `xianyu-vault-hk` 主机。所有服务使用独立 Compose 项目、网络、卷、日志轮转和资源限制；Web 只接入外部 `codex-fleet-ingress`，Platform API 与 Canvas Agent 只通过独立 egress 网络访问上游模型，不映射宿主机端口，也不接触现有服务的数据卷。

## 容量边界

- 适合 5 个内测账号日常浏览、画布编辑、注册、钱包、人工充值审核和云端 Terra 对话。
- 官方生成提交最多同时处理 2 个，请求体最多 32MB；超出并发返回 HTTP 429。
- Terra 对话最多同时运行 2 个，模型推理由远端 API 执行；服务器仅负责会话、工具编排和事件转发。
- 账户资产元数据已存 PostgreSQL 并按用户隔离；画布项目和本地上传的媒体文件本体仍在浏览器。跨设备共享大文件与更高并发需要对象存储、任务队列和独立 worker。

当前 `2C/2GB + 2GB Swap` 主机的实测结果：5 路并发完成 100 个 Web/健康请求用时约 4.4 秒，全部返回 200；5 路同时上传 20MB 无效媒体请求时 2 个进入解析、3 个被 429 拒绝，Platform API 峰值约 163MB，结束后回落到约 38MB，主机仍有约 1.2GB 可用内存。该结果支持 5 人轻量内测，不代表支持 5 路同时生成大图或视频。

## 发布步骤

1. 在可信构建机生成 `linux/amd64` 的 Web、API 和迁移镜像，使用不可变发布标签。
2. 将 `compose.yml`、脚本、systemd 单元及压缩镜像传到 `/opt/orangemoon-canvas`。
3. 通过 `provision-env.sh` 一次性生成 0600 的 `.env` 和管理员凭据；随后从受控 Secret 或 Keychain 填入 MetaJing、MiniMax 和 OpenAI 供应商配置，密钥不得进入镜像或仓库。
4. 加载镜像后执行 `docker compose --env-file .env -f compose.yml up -d`。
5. 创建管理员后删除 `.admin.initial`，安装并启用每日备份 timer。
6. 将 `Caddyfile.snippet` 追加到现有 Caddyfile，先校验再平滑 reload。

如果 Caddyfile 以只读单文件 bind mount 挂载，使用原子替换写入宿主机后，运行中容器仍会绑定旧 inode。应先从容器临时路径 reload 候选配置完成无中断验证，再单独重启 Caddy 一次重新挂载宿主机文件，并复测全部既有域名。

正式域名是 `canvas.orangemoon.tech`。DNS 生效前可用指向同一主机的临时 HTTPS 域名 `canvas.38-76-223-32.sslip.io` 验收；正式收费前应切换到自有域名。
