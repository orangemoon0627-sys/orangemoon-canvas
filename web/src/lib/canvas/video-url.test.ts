import assert from "node:assert/strict";
import test from "node:test";

import { playableCanvasVideoUrl } from "./video-url";

test("画布视频播放地址增加新的缓存版本并保留媒体版本与空间参数", () => {
    assert.equal(
        playableCanvasVideoUrl(
            "/platform-api/canvas-media/video%3Aclip-a?v=old-version&workspaceId=old-space",
            "workspace-a",
            "https://canvas.example",
        ),
        "/platform-api/canvas-media/video%3Aclip-a?v=old-version&workspaceId=workspace-a&pv=2",
    );
});
