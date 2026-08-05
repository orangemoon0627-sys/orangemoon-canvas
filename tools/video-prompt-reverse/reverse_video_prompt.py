#!/usr/bin/env python3
"""Extract representative video frames and optionally reconstruct generation prompts."""

from __future__ import annotations

import argparse
import base64
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
from typing import Any
from urllib import error as urlerror
from urllib import parse as urlparse
from urllib import request as urlrequest


VIDEO_SUFFIXES = {".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi", ".flv"}
DOUYIN_HOST_SUFFIXES = ("douyin.com", "iesdouyin.com")
URL_PATTERN = re.compile(r"https?://[^\s]+", re.IGNORECASE)
ANALYSIS_KEYS = (
    "summary",
    "visual_fingerprint",
    "timeline",
    "image2_keyframes",
    "seedance_prompt",
    "negative_constraints",
    "uncertainties",
    "overall_confidence",
)


class ReversePromptError(RuntimeError):
    pass


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="本地视频/抖音链接抽帧，并可选调用视觉模型重建 Image 2 与 Seedance 提示词。",
    )
    parser.add_argument("source", help="本地视频路径、视频 URL，或包含抖音短链的分享文字")
    parser.add_argument("-o", "--output", type=Path, help="输出目录，默认 ./video-prompt-reverse-output")
    parser.add_argument("--profile", choices=("fast", "standard", "detailed"), default="standard", help="抽帧密度，默认标准抽帧；视觉分析最多发送 8 帧")
    parser.add_argument("--max-frame-edge", type=int, default=960, help="抽帧 JPG 最长边，默认 960")
    parser.add_argument("--ffmpeg", default=os.environ.get("FFMPEG_BIN", "ffmpeg"), help="ffmpeg 可执行文件")
    parser.add_argument("--ffprobe", default=os.environ.get("FFPROBE_BIN", "ffprobe"), help="ffprobe 可执行文件")
    parser.add_argument("--douyin-downloader-dir", type=Path, help="已自行安装的 jiji262/douyin-downloader 目录")
    parser.add_argument("--allow-ytdlp", action="store_true", help="下载器不可用时，显式允许调用本机 yt-dlp 回退")
    parser.add_argument("--overwrite", action="store_true", help="覆盖输出目录中的本工具产物")
    parser.add_argument("--analyze", action="store_true", help="显式调用视觉模型分析；不传时只在本机抽帧，零模型费用")
    parser.add_argument("--analysis-frame-limit", type=int, default=8, help="发送给视觉模型的最大帧数，默认 8")
    parser.add_argument("--api-timeout", type=float, default=180, help="视觉模型请求超时秒数，默认 180")
    return parser.parse_args(argv)


def extract_url(value: str) -> str | None:
    match = URL_PATTERN.search(value.strip())
    if not match:
        return None
    return match.group(0).rstrip(".,;:!?，。；：！？)]}）】》\"'")


def sanitized_url(value: str) -> str:
    parsed = urlparse.urlsplit(value)
    return urlparse.urlunsplit((parsed.scheme, parsed.netloc, parsed.path, "", ""))


def is_douyin_url(value: str) -> bool:
    hostname = (urlparse.urlsplit(value).hostname or "").lower()
    return any(hostname == suffix or hostname.endswith(f".{suffix}") for suffix in DOUYIN_HOST_SUFFIXES)


def run_checked(command: list[str], *, cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            command,
            cwd=str(cwd) if cwd else None,
            check=True,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError as exc:
        raise ReversePromptError(f"找不到可执行文件：{command[0]}") from exc
    except subprocess.CalledProcessError as exc:
        detail = (exc.stderr or exc.stdout or "命令执行失败").strip()[-1200:]
        raise ReversePromptError(f"{command[0]} 执行失败：{detail}") from exc


def probe_video(video_path: Path, ffprobe: str = "ffprobe") -> dict[str, Any]:
    result = run_checked(
        [
            ffprobe,
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height,r_frame_rate,duration:format=duration",
            "-of",
            "json",
            str(video_path),
        ]
    )
    try:
        payload = json.loads(result.stdout)
        stream = payload["streams"][0]
        duration = float(stream.get("duration") or payload.get("format", {}).get("duration"))
        width = int(stream["width"])
        height = int(stream["height"])
    except (KeyError, IndexError, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise ReversePromptError("无法从视频读取有效的时长和画面尺寸") from exc
    if duration <= 0 or width <= 0 or height <= 0:
        raise ReversePromptError("视频时长或画面尺寸无效")
    return {
        "durationSeconds": round(duration, 3),
        "width": width,
        "height": height,
        "fps": parse_frame_rate(str(stream.get("r_frame_rate") or "0")),
    }


def parse_frame_rate(value: str) -> float:
    try:
        numerator, denominator = value.split("/", 1)
        rate = float(numerator) / float(denominator)
        return round(rate, 3) if rate > 0 else 0.0
    except (ValueError, ZeroDivisionError):
        return 0.0


def frame_count(profile: str, duration: float) -> int:
    if profile == "fast":
        return 5
    if profile == "standard":
        return 6 if duration <= 10 else 10 if duration <= 30 else 14 if duration <= 60 else 16
    if profile == "detailed":
        return 10 if duration <= 10 else 16 if duration <= 30 else 24 if duration <= 60 else 32
    raise ReversePromptError(f"未知抽帧模式：{profile}")


def sample_timestamps(duration: float, count: int) -> list[float]:
    if duration <= 0 or count <= 0:
        raise ReversePromptError("抽帧需要有效的时长和数量")
    start = min(0.25, duration * 0.05)
    end = max(start, duration * 0.95)
    if count == 1:
        return [round((start + end) / 2, 3)]
    step = (end - start) / (count - 1)
    return [round(start + step * index, 3) for index in range(count)]


def scaled_dimensions(width: int, height: int, max_edge: int) -> tuple[int, int]:
    if max_edge < 64:
        raise ReversePromptError("--max-frame-edge 不能小于 64")
    scale = min(1.0, max_edge / max(width, height))
    target_width = max(2, int(width * scale) // 2 * 2)
    target_height = max(2, int(height * scale) // 2 * 2)
    return target_width, target_height


def extract_frames(
    video_path: Path,
    frames_dir: Path,
    video_info: dict[str, Any],
    profile: str,
    max_edge: int,
    ffmpeg: str = "ffmpeg",
) -> list[dict[str, Any]]:
    count = frame_count(profile, float(video_info["durationSeconds"]))
    timestamps = sample_timestamps(float(video_info["durationSeconds"]), count)
    width, height = scaled_dimensions(int(video_info["width"]), int(video_info["height"]), max_edge)
    frames_dir.mkdir(parents=True, exist_ok=True)
    frames: list[dict[str, Any]] = []
    for index, timestamp in enumerate(timestamps, start=1):
        frame_id = f"frame-{index:03d}"
        target = frames_dir / f"{frame_id}.jpg"
        run_checked(
            [
                ffmpeg,
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-ss",
                f"{timestamp:.3f}",
                "-i",
                str(video_path),
                "-frames:v",
                "1",
                "-vf",
                f"scale={width}:{height}",
                "-q:v",
                "2",
                str(target),
            ]
        )
        if not target.is_file() or target.stat().st_size == 0:
            raise ReversePromptError(f"抽帧失败：{frame_id}")
        frames.append({"id": frame_id, "timestampSeconds": timestamp, "file": f"frames/{target.name}"})
    return frames


def find_downloaded_video(download_dir: Path) -> Path:
    candidates = [path for path in download_dir.rglob("*") if path.is_file() and path.suffix.lower() in VIDEO_SUFFIXES and path.stat().st_size > 0]
    if not candidates:
        raise ReversePromptError("下载命令已结束，但没有找到可用视频文件")
    return max(candidates, key=lambda path: (path.stat().st_mtime_ns, path.stat().st_size))


def download_video(
    url: str,
    download_dir: Path,
    douyin_downloader_dir: Path | None,
    allow_ytdlp: bool,
) -> tuple[Path, str]:
    download_dir.mkdir(parents=True, exist_ok=True)
    if is_douyin_url(url) and douyin_downloader_dir:
        downloader_dir = douyin_downloader_dir.expanduser().resolve()
        run_script = downloader_dir / "run.py"
        if not run_script.is_file():
            raise ReversePromptError(f"抖音下载器目录中没有 run.py：{downloader_dir}")
        run_checked([sys.executable, str(run_script), "-u", url, "-p", str(download_dir.resolve())], cwd=downloader_dir)
        return find_downloaded_video(download_dir), "jiji262/douyin-downloader"
    if allow_ytdlp:
        executable = shutil.which("yt-dlp")
        if not executable:
            raise ReversePromptError("已允许 yt-dlp 回退，但本机未安装 yt-dlp")
        output_template = download_dir.resolve() / "source.%(ext)s"
        run_checked([executable, "--no-playlist", "--restrict-filenames", "-o", str(output_template), url])
        return find_downloaded_video(download_dir), "yt-dlp"
    if is_douyin_url(url):
        raise ReversePromptError("抖音链接需要 --douyin-downloader-dir；也可显式加 --allow-ytdlp 尝试回退，或直接提供本地视频")
    raise ReversePromptError("URL 下载默认关闭；请提供本地视频，或显式加 --allow-ytdlp")


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def reset_generated_outputs(output_dir: Path, overwrite: bool) -> None:
    protected = {Path("/").resolve(), Path.home().resolve(), Path.cwd().resolve()}
    if output_dir.resolve() in protected:
        raise ReversePromptError("输出目录必须是独立子目录，不能直接使用根目录、用户目录或当前工作目录")
    generated_paths = [
        output_dir / "frames",
        output_dir / "downloads",
        output_dir / "manifest.json",
        output_dir / "result.json",
        output_dir / "seedance-prompt.md",
    ]
    existing = [path for path in generated_paths if path.exists()]
    if existing and not overwrite:
        raise ReversePromptError(f"输出目录已有本工具产物：{output_dir}；确认后加 --overwrite")
    if overwrite:
        for path in existing:
            shutil.rmtree(path) if path.is_dir() else path.unlink()
    output_dir.mkdir(parents=True, exist_ok=True)


def write_json(path: Path, value: Any) -> None:
    temporary = path.with_suffix(f"{path.suffix}.tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def evenly_selected(items: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    if limit <= 0:
        raise ReversePromptError("--analysis-frame-limit 必须大于 0")
    if len(items) <= limit:
        return items
    if limit == 1:
        return [items[len(items) // 2]]
    indexes = [round(index * (len(items) - 1) / (limit - 1)) for index in range(limit)]
    return [items[index] for index in indexes]


def analysis_prompt(manifest: dict[str, Any], frames: list[dict[str, Any]]) -> str:
    frame_map = ", ".join(f"{frame['id']}={frame['timestampSeconds']:.3f}s" for frame in frames)
    return f"""你是视频导演和提示词工程师。根据按时间排序的关键帧重建一份可复刻的创作说明，而不是猜测创作者原始提示词。

视频元数据：时长 {manifest['video']['durationSeconds']} 秒，尺寸 {manifest['video']['width']}x{manifest['video']['height']}，帧映射：{frame_map}。

严格区分画面证据与创意推断。看不清、抽帧无法判断或需要声音才能判断的内容放进 uncertainties，不得补写成事实。提取一般性的构图、色彩、材质、镜头运动和剪辑节奏；忽略并排除水印、Logo、账号标识与可识别的专有素材。

只返回一个 JSON 对象，不要 Markdown 代码围栏。顶层键必须完整且使用下列英文键：
- summary: 字符串，视频概要和节奏曲线。
- visual_fingerprint: 对象，至少包含 medium、art_direction、palette、lighting、materials、composition、lens_and_depth、editing_rhythm。
- timeline: 数组；每项包含 start_seconds、end_seconds、shot_size、camera、action、scene、transition、sound、evidence_frame_ids、confidence。
- image2_keyframes: 数组；每项包含 timestamp_seconds、purpose、prompt、reference_invariants、negative_constraints。
- seedance_prompt: 字符串；按时间段写主体、场景、动作、单一主运镜、转场、声音与连续性约束，可直接用于审核。
- negative_constraints: 字符串数组。
- uncertainties: 数组；每项包含 item、reason、confidence。
- overall_confidence: 0 到 1 的数字。

最终提示词使用中文，具体、可执行，不使用“高级、震撼、8K”一类空泛词替代画面描述。"""


def responses_endpoint(base_url: str) -> str:
    normalized = base_url.strip().rstrip("/")
    if not normalized:
        raise ReversePromptError("--analyze 需要 REVERSE_PROMPT_BASE_URL")
    parsed = urlparse.urlsplit(normalized)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ReversePromptError("REVERSE_PROMPT_BASE_URL 必须是有效的 HTTP(S) 地址")
    return normalized if normalized.endswith("/responses") else f"{normalized}/responses"


def extract_response_text(payload: dict[str, Any]) -> str:
    if isinstance(payload.get("output_text"), str) and payload["output_text"].strip():
        return payload["output_text"].strip()
    parts: list[str] = []
    for item in payload.get("output") or []:
        if not isinstance(item, dict) or item.get("type") != "message":
            continue
        for content in item.get("content") or []:
            if isinstance(content, dict) and isinstance(content.get("text"), str):
                parts.append(content["text"])
    if not parts:
        raise ReversePromptError("视觉模型没有返回可解析文本")
    return "".join(parts).strip()


def parse_analysis_json(value: str) -> dict[str, Any]:
    text = value.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        if start < 0:
            raise ReversePromptError("视觉模型返回内容不是 JSON")
        try:
            parsed, _ = json.JSONDecoder().raw_decode(text[start:])
        except json.JSONDecodeError as exc:
            raise ReversePromptError("视觉模型返回内容不是有效 JSON") from exc
    if not isinstance(parsed, dict):
        raise ReversePromptError("视觉模型分析结果必须是 JSON 对象")
    missing = [key for key in ANALYSIS_KEYS if key not in parsed]
    if missing:
        raise ReversePromptError(f"视觉模型分析结果缺少字段：{', '.join(missing)}")
    confidence = parsed.get("overall_confidence")
    if not isinstance(confidence, (int, float)) or isinstance(confidence, bool) or not 0 <= confidence <= 1:
        raise ReversePromptError("overall_confidence 必须是 0 到 1 的数字")
    return parsed


def analyze_frames(
    manifest: dict[str, Any],
    output_dir: Path,
    *,
    base_url: str,
    api_key: str,
    model: str,
    timeout: float,
    frame_limit: int,
) -> tuple[dict[str, Any], dict[str, Any]]:
    if not api_key.strip():
        raise ReversePromptError("--analyze 需要 REVERSE_PROMPT_API_KEY")
    if not model.strip():
        raise ReversePromptError("--analyze 需要 REVERSE_PROMPT_MODEL")
    if timeout <= 0:
        raise ReversePromptError("--api-timeout 必须大于 0")
    selected = evenly_selected(list(manifest["frames"]), frame_limit)
    content: list[dict[str, Any]] = [{"type": "input_text", "text": analysis_prompt(manifest, selected)}]
    for frame in selected:
        path = output_dir / frame["file"]
        encoded = base64.b64encode(path.read_bytes()).decode("ascii")
        content.extend(
            [
                {"type": "input_text", "text": f"{frame['id']}，时间 {frame['timestampSeconds']:.3f}s"},
                {"type": "input_image", "image_url": f"data:image/jpeg;base64,{encoded}"},
            ]
        )
    request_payload = {
        "model": model.strip(),
        "store": False,
        "max_output_tokens": 6000,
        "input": [{"role": "user", "content": content}],
    }
    request = urlrequest.Request(
        responses_endpoint(base_url),
        data=json.dumps(request_payload, ensure_ascii=False).encode("utf-8"),
        headers={"Authorization": f"Bearer {api_key.strip()}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlrequest.urlopen(request, timeout=timeout) as response:
            response_payload = json.loads(response.read().decode("utf-8"))
    except urlerror.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:800].replace(api_key.strip(), "[redacted]")
        raise ReversePromptError(f"视觉模型请求失败（HTTP {exc.code}）：{detail}") from exc
    except (urlerror.URLError, TimeoutError) as exc:
        raise ReversePromptError(f"视觉模型请求失败：{exc}") from exc
    except json.JSONDecodeError as exc:
        raise ReversePromptError("视觉模型接口返回的不是 JSON") from exc
    result = parse_analysis_json(extract_response_text(response_payload))
    metadata = {
        "status": "completed",
        "model": model.strip(),
        "frameIds": [frame["id"] for frame in selected],
        "usage": response_payload.get("usage") if isinstance(response_payload.get("usage"), dict) else None,
    }
    return result, metadata


def display_value(value: Any) -> str:
    if isinstance(value, list):
        return "、".join(display_value(item) for item in value)
    if isinstance(value, dict):
        return "；".join(f"{key}: {display_value(item)}" for key, item in value.items())
    return str(value)


def render_seedance_markdown(result: dict[str, Any], manifest: dict[str, Any]) -> str:
    lines = [
        "# 视频提示词反推",
        "",
        f"> 本结果根据 {len(manifest['frames'])} 张抽帧重建，不是创作者原始提示词。总体置信度：{result['overall_confidence']}",
        "",
        "## 视频概要",
        "",
        display_value(result["summary"]),
        "",
        "## 视觉指纹",
        "",
    ]
    fingerprint = result["visual_fingerprint"]
    if isinstance(fingerprint, dict):
        lines.extend(f"- **{key}**：{display_value(value)}" for key, value in fingerprint.items())
    else:
        lines.append(display_value(fingerprint))
    lines.extend(["", "## 镜头时间线", ""])
    for index, shot in enumerate(result["timeline"] if isinstance(result["timeline"], list) else [], start=1):
        lines.extend([f"### 镜头 {index}", "", display_value(shot), ""])
    lines.extend(["## Image 2 关键帧提示词", ""])
    for index, keyframe in enumerate(result["image2_keyframes"] if isinstance(result["image2_keyframes"], list) else [], start=1):
        lines.extend([f"### 关键帧 {index}", "", display_value(keyframe), ""])
    lines.extend(["## Seedance 最终提示词", "", display_value(result["seedance_prompt"]), "", "## 负面约束", ""])
    negatives = result["negative_constraints"] if isinstance(result["negative_constraints"], list) else [result["negative_constraints"]]
    lines.extend(f"- {display_value(item)}" for item in negatives)
    lines.extend(["", "## 不确定项", ""])
    uncertainties = result["uncertainties"] if isinstance(result["uncertainties"], list) else [result["uncertainties"]]
    lines.extend(f"- {display_value(item)}" for item in uncertainties)
    lines.extend(
        [
            "",
            "## 原创改写建议",
            "",
            "本页 Seedance 提示词用于还原参考片的结构证据，不建议直接发布。进入原创改写时，只保留构图、节奏、主运镜、转场和材质逻辑；至少替换人物身份、叙事目标、世界观、地点、道具、关系或情绪落点中的五类，并移除可识别的专有角色、标识和台词。画布 Agent 可直接使用“一键改写最近反推稿”，无需重新下载视频或抽帧。",
        ]
    )
    return "\n".join(lines).rstrip() + "\n"


def build_manifest(
    source: str,
    source_url: str | None,
    downloader: str | None,
    video_path: Path,
    video_info: dict[str, Any],
    profile: str,
    max_frame_edge: int,
    frames: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "schemaVersion": 1,
        "createdAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "source": {
            "kind": "url" if source_url else "local_file",
            "locator": sanitized_url(source_url) if source_url else str(Path(source).expanduser().resolve()),
            "downloader": downloader,
        },
        "video": {**video_info, "sha256": file_sha256(video_path)},
        "sampling": {"profile": profile, "strategy": "uniform_5_to_95_percent", "maxFrameEdge": max_frame_edge},
        "frames": frames,
        "analysis": {"status": "not_requested"},
    }


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        output_dir = (args.output or Path.cwd() / "video-prompt-reverse-output").expanduser().resolve()
        reset_generated_outputs(output_dir, args.overwrite)
        source_url = extract_url(args.source)
        downloader: str | None = None
        if source_url:
            video_path, downloader = download_video(source_url, output_dir / "downloads", args.douyin_downloader_dir, args.allow_ytdlp)
        else:
            video_path = Path(args.source).expanduser().resolve()
            if not video_path.is_file():
                raise ReversePromptError(f"本地视频不存在：{video_path}")
            if video_path.suffix.lower() not in VIDEO_SUFFIXES:
                raise ReversePromptError(f"不支持的视频格式：{video_path.suffix or '(无扩展名)'}")
        video_info = probe_video(video_path, args.ffprobe)
        frames = extract_frames(video_path, output_dir / "frames", video_info, args.profile, args.max_frame_edge, args.ffmpeg)
        manifest = build_manifest(args.source, source_url, downloader, video_path, video_info, args.profile, args.max_frame_edge, frames)
        write_json(output_dir / "manifest.json", manifest)
        print(f"已抽取 {len(frames)} 帧：{output_dir / 'frames'}")
        print(f"清单：{output_dir / 'manifest.json'}")

        if args.analyze:
            result, analysis_metadata = analyze_frames(
                manifest,
                output_dir,
                base_url=os.environ.get("REVERSE_PROMPT_BASE_URL", ""),
                api_key=os.environ.get("REVERSE_PROMPT_API_KEY", ""),
                model=os.environ.get("REVERSE_PROMPT_MODEL", ""),
                timeout=args.api_timeout,
                frame_limit=args.analysis_frame_limit,
            )
            manifest["analysis"] = analysis_metadata
            write_json(output_dir / "manifest.json", manifest)
            write_json(output_dir / "result.json", result)
            (output_dir / "seedance-prompt.md").write_text(render_seedance_markdown(result, manifest), encoding="utf-8")
            print(f"结构化分析：{output_dir / 'result.json'}")
            print(f"可读提示词：{output_dir / 'seedance-prompt.md'}")
        else:
            print("未调用视觉模型；如需语义反推，请配置独立分析环境变量后显式加 --analyze。")
        return 0
    except ReversePromptError as exc:
        print(f"错误：{exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
