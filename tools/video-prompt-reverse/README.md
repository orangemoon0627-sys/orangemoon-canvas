# 视频提示词反推工具

这个本地 CLI 把本地视频或抖音分享链接处理成代表性 JPG 帧和 `manifest.json`。默认只运行本机 `ffprobe` / `ffmpeg`，不会请求模型或产生 API 费用。只有显式传入 `--analyze` 时，才把选定关键帧发给兼容 OpenAI Responses API 的视觉模型，并输出：

- 视频概要与视觉指纹
- 带时间码的镜头线
- Image 2 关键帧提示词
- Seedance 最终提示词
- 负面约束、不确定项和置信度

反推结果是依据成片重建的“可复刻提示词”，不是创作者原始提示词。

## 本地视频抽帧

需要 Python 3.11+、FFmpeg 和 FFprobe：

```bash
python3 tools/video-prompt-reverse/reverse_video_prompt.py \
  /path/to/reference.mp4 \
  --profile standard \
  -o /tmp/reference-reverse
```

抽帧档位：

| 档位 | 帧数 |
| --- | --- |
| `fast` | 固定 5 帧 |
| `standard` | `<=10s` 6 帧，`<=30s` 10 帧，`<=60s` 14 帧，更长 16 帧 |
| `detailed` | 对应 10 / 16 / 24 / 32 帧 |

最后一帧取视频约 95% 的时刻，减少片尾黑帧。默认最长边压到 960px，以控制视觉模型请求体和成本。

## 抖音链接

工具不会自动安装或执行第三方仓库安装脚本。先自行审计并准备固定版本的 [jiji262/douyin-downloader](https://github.com/jiji262/douyin-downloader/tree/854217769b9c3596e589e80e26a01f11196c9a48)，再显式提供目录：

```bash
python3 tools/video-prompt-reverse/reverse_video_prompt.py \
  'https://v.douyin.com/example/' \
  --douyin-downloader-dir /path/to/douyin-downloader \
  -o /tmp/douyin-reverse
```

程序以参数数组调用 `python run.py -u URL -p OUTPUT`，不使用 `shell=True`。短链下载仍可能受 Cookie、登录风控和抖音页面变化影响；失败时应改为提供本地视频，不能仅根据分享标题臆测镜头。也可显式加 `--allow-ytdlp` 使用本机 `yt-dlp` 回退，但不保证抖音长期可用。

## 可选视觉分析

分析开关和凭据完全分离；三个环境变量缺一不可，密钥不会写入清单或输出文件：

```bash
export REVERSE_PROMPT_BASE_URL='https://provider.example/v1'
export REVERSE_PROMPT_API_KEY='server-secret'
export REVERSE_PROMPT_MODEL='vision-model-id'

python3 tools/video-prompt-reverse/reverse_video_prompt.py \
  /path/to/reference.mp4 \
  --analyze \
  -o /tmp/reference-reverse
```

输出目录包括：

```text
manifest.json
frames/frame-001.jpg
result.json             # 仅 --analyze
seedance-prompt.md      # 仅 --analyze
```

生产环境应由服务端保管分析密钥，不要放进浏览器、Git 仓库或镜像。当前云端画布 Agent 只接收图片附件；可以把抽出的关键帧作为附件交给“视频提示词反推”Skill，或在受控的本机环境直接运行本 CLI。

## 零费用测试

测试会用 FFmpeg 生成两秒测试视频，并用本机 mock HTTP 服务验证完整 Responses 请求，不访问真实模型：

```bash
python3 -m unittest discover -s tools/video-prompt-reverse -p 'test_*.py'
```

抽帧策略参考 MIT 仓库 [promptlab-image-video-to-prompt](https://github.com/gracech0322-cmd/promptlab-image-video-to-prompt/tree/2ccb763fa86430ffa3516dc10735077fdd2207c9)，实现代码为橙月画布内独立编写。
