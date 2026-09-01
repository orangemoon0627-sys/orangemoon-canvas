import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalMediaRequestUrl,
  MAX_MEDIA_RANGE_BYTES,
  parseByteRange,
} from "./canvas-media.controller";

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

test("开放和超大 Range 被限制为有限分块", () => {
  assert.equal(MAX_MEDIA_RANGE_BYTES, 16 * 1024 * 1024);
  const total = MAX_MEDIA_RANGE_BYTES * 3;
  assert.deepEqual(parseByteRange("bytes=0-", total), {
    start: 0,
    end: MAX_MEDIA_RANGE_BYTES - 1,
  });
  assert.deepEqual(parseByteRange("bytes=0-999999999", total), {
    start: 0,
    end: MAX_MEDIA_RANGE_BYTES - 1,
  });
  assert.deepEqual(parseByteRange(`bytes=-${total}`, total), {
    start: total - MAX_MEDIA_RANGE_BYTES,
    end: total - 1,
  });
});

test("过期媒体版本会规范化到当前校验和并保留工作空间参数", () => {
  const checksum = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
  const requestUrl = "/platform-api/canvas-media/video%3Acloud-video-a?v=old-version&workspaceId=workspace-a";

  assert.equal(
    canonicalMediaRequestUrl(
      requestUrl,
      "video:cloud-video-a",
      checksum,
    ),
    "/platform-api/canvas-media/video%3Acloud-video-a?workspaceId=workspace-a&v=abcdef0123456789",
  );
});
