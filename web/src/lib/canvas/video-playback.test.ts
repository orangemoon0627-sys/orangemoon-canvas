import assert from "node:assert/strict";
import test from "node:test";

import { canvasVideoPreload } from "./video-playback";

test("未选中且未播放的画布视频不建立媒体预加载连接", () => {
    assert.equal(canvasVideoPreload(false, false), "none");
});

test("当前选中或正在播放的画布视频才使用自动预加载", () => {
    assert.equal(canvasVideoPreload(true, false), "auto");
    assert.equal(canvasVideoPreload(false, true), "auto");
});
