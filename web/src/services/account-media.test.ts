import assert from "node:assert/strict";
import test from "node:test";

import { bindAccountMediaOwner, queueAccountMediaUpload } from "./account-media";

test("旧账户上传完成后不能污染新账户的媒体缓存", async () => {
    const originalFetch = globalThis.fetch;
    let resolveFirst: ((response: Response) => void) | undefined;
    let requests = 0;
    globalThis.fetch = (async () => {
        requests += 1;
        if (requests === 1) return new Promise<Response>((resolve) => { resolveFirst = resolve; });
        return jsonResponse();
    }) as typeof fetch;

    try {
        bindAccountMediaOwner("owner-a");
        const first = queueAccountMediaUpload("image:abcdefgh", new Blob(["a"], { type: "image/png" }));
        bindAccountMediaOwner("owner-b");
        resolveFirst?.(jsonResponse());
        await first;

        await queueAccountMediaUpload("image:abcdefgh", new Blob(["b"], { type: "image/png" }));
        assert.equal(requests, 2);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

function jsonResponse() {
    return new Response(JSON.stringify({ ok: true, media: {} }), { status: 200, headers: { "Content-Type": "application/json" } });
}
