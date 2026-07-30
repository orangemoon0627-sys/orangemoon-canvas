import assert from "node:assert/strict";
import test from "node:test";

import { BadRequestException } from "@nestjs/common";

import { decodePaymentImage, detectPaymentImageMimeType } from "./payment-image";

test("detectPaymentImageMimeType 识别允许的位图格式", () => {
    assert.equal(detectPaymentImageMimeType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
    assert.equal(detectPaymentImageMimeType(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
    assert.equal(detectPaymentImageMimeType(Buffer.from("RIFF0000WEBP", "ascii")), "image/webp");
    assert.equal(detectPaymentImageMimeType(Buffer.from("<svg></svg>")), null);
});

test("decodePaymentImage 拒绝声明类型与内容不一致", () => {
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]).toString("base64");
    assert.throws(() => decodePaymentImage(png, "image/jpeg"), BadRequestException);
});

test("decodePaymentImage 接收经过签名校验的图片", () => {
    const jpegBytes = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);
    const result = decodePaymentImage(jpegBytes.toString("base64"), "image/jpeg");
    assert.equal(result.mimeType, "image/jpeg");
    assert.deepEqual(result.bytes, jpegBytes);
});
