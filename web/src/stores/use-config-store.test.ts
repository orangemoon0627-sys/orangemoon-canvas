import assert from "node:assert/strict";
import test from "node:test";

import { ORANGE_MOON_CHANNEL_ID } from "@/lib/orange-moon-provider";
import { createModelChannel, createOrangeMoonChannel, defaultConfig, encodeChannelModel, normalizeModelOptionValue, selectableModelsByCapability } from "./use-config-store";

test("hides custom models that duplicate an official product or legacy alias", () => {
    const official = createOrangeMoonChannel();
    const custom = createModelChannel({
        id: "custom",
        name: "自定义渠道",
        models: [
            { name: "seedance-2.0-720p-economy", capability: "video" },
            { name: "mg-seedance2.0 -720p pro", capability: "video" },
            { name: "veo-custom-preview", capability: "video" },
        ],
    });

    const options = selectableModelsByCapability({ ...defaultConfig, channels: [official, custom] }, "video");

    assert.equal(options.length, 11);
    assert.ok(options.includes(encodeChannelModel(ORANGE_MOON_CHANNEL_ID, "seedance-2.0-720p-economy")));
    assert.ok(options.includes(encodeChannelModel("custom", "veo-custom-preview")));
    assert.ok(!options.includes(encodeChannelModel("custom", "seedance-2.0-720p-economy")));
    assert.ok(!options.includes(encodeChannelModel("custom", "mg-seedance2.0 -720p pro")));
});

test("migrates duplicate custom selections to the official product id", () => {
    const channels = [
        createOrangeMoonChannel(),
        createModelChannel({
            id: "custom",
            models: [
                { name: "seedance-2.0-720p-economy", capability: "video" },
                { name: "mg-seedance2.0 -720p pro", capability: "video" },
            ],
        }),
    ];

    assert.equal(
        normalizeModelOptionValue(encodeChannelModel("custom", "seedance-2.0-720p-economy"), channels),
        encodeChannelModel(ORANGE_MOON_CHANNEL_ID, "seedance-2.0-720p-economy"),
    );
    assert.equal(
        normalizeModelOptionValue(encodeChannelModel("custom", "mg-seedance2.0 -720p pro"), channels),
        encodeChannelModel(ORANGE_MOON_CHANNEL_ID, "seedance-2.0-720p-pro"),
    );
});
