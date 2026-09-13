import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { prepareOpenAiImageDataUrl } from "../src/server/images/openAiImage";

// Exercise the installed native codec, not a mock: dependency upgrades must not
// silently enter the helper's pass-through fallback when resizing is required.
for (const format of ["jpeg", "png", "webp"] as const) {
  test(`image preparation preserves an in-bounds ${format}`, async () => {
    const input = await sharp({ create: { width: 160, height: 100, channels: 3, background: "#651830" } })
      .toFormat(format).toBuffer();
    const result = await prepareOpenAiImageDataUrl(new File([new Uint8Array(input)], `label.${format}`, { type: `image/${format}` }));
    expect(result.mimeType).toBe(`image/${format}`);
    expect(result.transformed).toBe(false);
    expect(Buffer.from(result.dataUrl.split(",")[1], "base64")).toEqual(input);
  });
}

test("image preparation resizes and auto-orients a camera JPEG", async () => {
  const input = await sharp({ create: { width: 2400, height: 1200, channels: 3, background: "#651830" } })
    .withMetadata({ orientation: 6 }).jpeg().toBuffer();
  const result = await prepareOpenAiImageDataUrl(new File([new Uint8Array(input)], "camera.jpg", { type: "image/jpeg" }));
  const output = Buffer.from(result.dataUrl.split(",")[1], "base64");
  expect(result.transformed).toBe(true);
  expect(result.byteLength).toBe(output.length);
  expect(await sharp(output).metadata()).toMatchObject({ format: "jpeg", width: 800, height: 1600 });
});

test("image preparation converts AVIF to supported JPEG using the patched codec", async () => {
  const input = await sharp({ create: { width: 128, height: 96, channels: 3, background: "#651830" } })
    .avif().toBuffer();
  const result = await prepareOpenAiImageDataUrl(new File([new Uint8Array(input)], "label.avif", { type: "image/avif" }));
  expect(result.transformed).toBe(true);
  expect(result.mimeType).toBe("image/jpeg");
  expect(await sharp(Buffer.from(result.dataUrl.split(",")[1], "base64")).metadata())
    .toMatchObject({ format: "jpeg", width: 128, height: 96 });
});

test("image preparation retains byte limits and unsupported-format errors", async () => {
  const input = await sharp({ create: { width: 128, height: 96, channels: 3, background: "#651830" } }).png().toBuffer();
  const file = new File([new Uint8Array(input)], "label.png", { type: "image/png" });
  await expect(prepareOpenAiImageDataUrl(file, { maxInputBytes: input.length - 1 })).rejects.toMatchObject({ code: "input_too_large" });
  await expect(prepareOpenAiImageDataUrl(file, { maxOutputBytes: input.length - 1 })).rejects.toMatchObject({ code: "output_too_large" });
  await expect(prepareOpenAiImageDataUrl(new File(["invalid"], "label.heic", { type: "image/heic" })))
    .rejects.toMatchObject({ code: "unsupported_format" });
});
