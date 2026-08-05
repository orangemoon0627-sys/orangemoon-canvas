import assert from "node:assert/strict";
import test from "node:test";

import { ORANGE_MOON_CHANNEL_ID, ORANGE_MOON_PROVIDER } from "@/lib/orange-moon-provider";
import { createModelChannel, createOrangeMoonChannel, defaultConfig, encodeChannelModel, normalizeModelOptionValue, resolveModelChannel, selectableModelsByCapability } from "./use-config-store";

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

    assert.equal(options.length, 5);
    assert.ok(options.includes(encodeChannelModel(ORANGE_MOON_CHANNEL_ID, "qy-seedance-2.0-fast")));
    assert.ok(options.includes(encodeChannelModel(ORANGE_MOON_CHANNEL_ID, "qy-seedance-2.0")));
    assert.ok(options.includes(encodeChannelModel(ORANGE_MOON_CHANNEL_ID, "431-Seedream-2.0")));
    assert.ok(options.includes(encodeChannelModel(ORANGE_MOON_CHANNEL_ID, "Seedance 2.0-fast-720p")));
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
        encodeChannelModel(ORANGE_MOON_CHANNEL_ID, "Seedance 2.0-fast-720p"),
    );
    assert.equal(
        normalizeModelOptionValue(encodeChannelModel("custom", "mg-seedance2.0 -720p pro"), channels),
        encodeChannelModel(ORANGE_MOON_CHANNEL_ID, "qy-seedance-2.0"),
    );
});

test("routes legacy canvas model names through the managed Orange Moon channel", () => {
    const config = {
        ...defaultConfig,
        channels: [
            createOrangeMoonChannel(),
            createModelChannel({
                id: "custom",
                baseUrl: "https://example.invalid",
                apiKey: "",
                models: [{ name: "mg-seedance2.0 -720p-gz-15s", capability: "video" }],
            }),
        ],
    };

    assert.equal(resolveModelChannel(config, "mg-seedance2.0 -720p-gz-15s").provider, ORANGE_MOON_PROVIDER);
    assert.equal(resolveModelChannel(config, encodeChannelModel("custom", "mg-seedance2.0 -720p-gz-15s")).provider, ORANGE_MOON_PROVIDER);
});
