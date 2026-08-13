import assert from "node:assert/strict";
import test from "node:test";

import { parseByteRange } from "./canvas-media.controller";

test("媒体 Range 支持固定区间、开放区间和后缀区间", () => {
    assert.deepEqual(parseByteRange("bytes=10-19", 100), { start: 10, end: 19 });
    assert.deepEqual(parseByteRange("bytes=90-", 100), { start: 90, end: 99 });
    assert.deepEqual(parseByteRange("bytes=-10", 100), { start: 90, end: 99 });
    assert.deepEqual(parseByteRange("bytes=95-120", 100), { start: 95, end: 99 });
});

test("媒体 Range 拒绝越界和无效区间", () => {
    assert.deepEqual(parseByteRange("bytes=100-", 100), { invalid: true });
    assert.deepEqual(parseByteRange("bytes=20-10", 100), { invalid: true });
    assert.deepEqual(parseByteRange("bytes=-0", 100), { invalid: true });
    assert.deepEqual(parseByteRange("items=0-1", 100), { invalid: true });
    assert.equal(parseByteRange(undefined, 100), null);
});
