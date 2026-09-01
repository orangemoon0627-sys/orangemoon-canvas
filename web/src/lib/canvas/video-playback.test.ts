import assert from "node:assert/strict";
import test from "node:test";

import { canvasVideoPreload } from "./video-playback";

test("未选中且未播放的画布视频只加载元数据", () => {
    assert.equal(canvasVideoPreload(false, false), "metadata");
});

test("当前选中或正在播放的画布视频才使用自动预加载", () => {
    assert.equal(canvasVideoPreload(true, false), "auto");
    assert.equal(canvasVideoPreload(false, true), "auto");
});
