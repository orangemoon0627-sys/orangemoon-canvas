from __future__ import annotations

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import threading
import unittest


sys.path.insert(0, str(Path(__file__).resolve().parent))
import reverse_video_prompt as reverse


class ReverseVideoPromptTests(unittest.TestCase):
    def test_defaults_to_eight_frame_analysis_feedback(self) -> None:
        args = reverse.parse_args(["sample.mp4"])
        self.assertEqual(args.profile, "standard")
        self.assertEqual(args.analysis_frame_limit, 8)

    def test_extracts_douyin_url_from_share_text(self) -> None:
        source = "8.41 复制口令 https://v.douyin.com/lg8Sue_MesI/ 直接观看！"
        self.assertEqual(reverse.extract_url(source), "https://v.douyin.com/lg8Sue_MesI/")
        self.assertTrue(reverse.is_douyin_url(reverse.extract_url(source) or ""))

    def test_frame_profiles_and_last_frame_avoid_video_end(self) -> None:
        self.assertEqual(reverse.frame_count("fast", 25), 5)
        self.assertEqual(reverse.frame_count("standard", 25), 10)
        self.assertEqual(reverse.frame_count("detailed", 25), 16)
        timestamps = reverse.sample_timestamps(20, 10)
        self.assertEqual(timestamps[-1], 19.0)
        self.assertLess(timestamps[0], 1.0)

    @unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "ffmpeg/ffprobe not installed")
    def test_real_ffmpeg_extracts_standard_profile_without_model_call(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            video = root / "sample.mp4"
            subprocess.run(
                [
                    shutil.which("ffmpeg") or "ffmpeg",
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-f",
                    "lavfi",
                    "-i",
                    "testsrc2=duration=2:size=320x180:rate=10",
                    "-c:v",
                    "mpeg4",
                    "-q:v",
                    "5",
                    "-y",
                    str(video),
                ],
                check=True,
            )
            info = reverse.probe_video(video, shutil.which("ffprobe") or "ffprobe")
            frames = reverse.extract_frames(video, root / "frames", info, "standard", 240, shutil.which("ffmpeg") or "ffmpeg")
            self.assertEqual(len(frames), 6)
            self.assertEqual(frames[-1]["timestampSeconds"], 1.9)
            self.assertTrue(all((root / frame["file"]).is_file() for frame in frames))

    def test_analysis_uses_mock_responses_api_and_returns_structured_result(self) -> None:
        result = {
            "summary": "两秒测试片",
            "visual_fingerprint": {
                "medium": "测试图",
                "art_direction": "几何",
                "palette": "红蓝",
                "lighting": "均匀",
                "materials": "无",
                "composition": "居中",
                "lens_and_depth": "广角",
                "editing_rhythm": "稳定",
            },
            "timeline": [],
            "image2_keyframes": [],
            "seedance_prompt": "[00:00-00:02] 测试画面",
            "negative_constraints": ["无水印"],
            "uncertainties": [],
            "overall_confidence": 0.8,
        }
        received: dict[str, object] = {}

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self) -> None:
                received["path"] = self.path
                received["authorization"] = self.headers.get("Authorization")
                length = int(self.headers.get("Content-Length") or 0)
                received["body"] = json.loads(self.rfile.read(length))
                body = json.dumps({"output_text": json.dumps(result, ensure_ascii=False), "usage": {"input_tokens": 12, "output_tokens": 8}}).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, format: str, *args: object) -> None:
                return

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                (root / "frames").mkdir()
                (root / "frames/frame-001.jpg").write_bytes(b"\xff\xd8\xff\xd9")
                manifest = {
                    "video": {"durationSeconds": 2, "width": 320, "height": 180},
                    "frames": [{"id": "frame-001", "timestampSeconds": 1.0, "file": "frames/frame-001.jpg"}],
                }
                actual, metadata = reverse.analyze_frames(
                    manifest,
                    root,
                    base_url=f"http://127.0.0.1:{server.server_port}/v1",
                    api_key="test-secret",
                    model="mock-vision-model",
                    timeout=5,
                    frame_limit=16,
                )
                self.assertEqual(actual, result)
                self.assertEqual(metadata["status"], "completed")
                self.assertEqual(received["path"], "/v1/responses")
                self.assertEqual(received["authorization"], "Bearer test-secret")
                body = received["body"]
                self.assertIsInstance(body, dict)
                self.assertEqual(body["model"], "mock-vision-model")
                self.assertNotIn("test-secret", json.dumps(body))
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)

    def test_rendered_markdown_separates_reconstruction_from_original_rewrite(self) -> None:
        result = {
            "summary": "测试片",
            "visual_fingerprint": {},
            "timeline": [],
            "image2_keyframes": [],
            "seedance_prompt": "参考片结构提示词",
            "negative_constraints": [],
            "uncertainties": [],
            "overall_confidence": 0.8,
        }
        markdown = reverse.render_seedance_markdown(result, {"frames": [{"id": "frame-001"}]})
        self.assertIn("## 原创改写建议", markdown)
        self.assertIn("至少替换", markdown)
        self.assertIn("无需重新下载视频或抽帧", markdown)


if __name__ == "__main__":
    unittest.main()
