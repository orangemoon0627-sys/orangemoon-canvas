import assert from "node:assert/strict";
import test from "node:test";

import { isGenerationSubmission } from "./generation-request";

test("仅生成提交请求占用生成并发", () => {
    assert.equal(isGenerationSubmission("POST", "/platform-api/providers/metajing/v1/images/generations"), true);
    assert.equal(isGenerationSubmission("POST", "/platform-api/providers/metajing/v1/video/generations?retry=1"), true);
    assert.equal(isGenerationSubmission("POST", "/platform-api/providers/minimax/v1/audio/speech/"), true);
    assert.equal(isGenerationSubmission("GET", "/platform-api/providers/metajing/v1/video/generations/job"), false);
    assert.equal(isGenerationSubmission("POST", "/platform-api/auth/login"), false);
});
