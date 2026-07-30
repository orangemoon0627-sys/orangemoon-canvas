import assert from "node:assert/strict";
import test from "node:test";

import { serializeWallet } from "./wallet.serializer";

test("账户会话返回可直接展示的积分余额", () => {
    const updatedAt = new Date("2026-07-29T00:00:00.000Z");
    assert.deepEqual(serializeWallet({ availableMilliCredits: 12_345n, frozenMilliCredits: 500n, updatedAt }), {
        availableMilliCredits: "12345",
        availableCredits: "12.345",
        frozenMilliCredits: "500",
        frozenCredits: "0.5",
        updatedAt,
    });
});
