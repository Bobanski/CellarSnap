import { extractGpsFromFile } from "../src/lib/exifGps";
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

test("photo location extraction preserves GPS from a real JPEG and safely ignores missing metadata", async () => {
  const jpeg = await sharp({ create: { width: 24, height: 24, channels: 3, background: "#651830" } }).jpeg().toBuffer();
  const tiff = Buffer.alloc(128);
  tiff.write("II"); tiff.writeUInt16LE(42, 2); tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(1, 8); tiff.writeUInt16LE(0x8825, 10); tiff.writeUInt16LE(4, 12); tiff.writeUInt32LE(1, 14); tiff.writeUInt32LE(26, 18);
  tiff.writeUInt16LE(4, 26);
  for (const [index, tag, type, count, value] of [[0,1,2,2,78], [1,2,5,3,80], [2,3,2,2,87], [3,4,5,3,104]]) {
    const offset = 28 + index * 12;
    tiff.writeUInt16LE(tag, offset); tiff.writeUInt16LE(type, offset + 2); tiff.writeUInt32LE(count, offset + 4); tiff.writeUInt32LE(value, offset + 8);
  }
  for (const [index, value] of [40,42,0,74,0,0].entries()) {
    tiff.writeUInt32LE(value, 80 + index * 8); tiff.writeUInt32LE(1, 84 + index * 8);
  }
  const exif = Buffer.concat([Buffer.from("Exif\0\0"), tiff]);
  const marker = Buffer.from([0xff,0xe1,0,0]); marker.writeUInt16BE(exif.length + 2, 2);
  const fixture = Buffer.concat([jpeg.subarray(0,2), marker, exif, jpeg.subarray(2)]);
  expect(await extractGpsFromFile(new File([fixture], "synthetic-gps.jpg", { type: "image/jpeg" }))).toEqual({ lat: 40.7, lng: -74 });
  expect(await extractGpsFromFile(new File([jpeg], "plain.jpg"))).toBeNull();
  expect(await extractGpsFromFile(new File(["invalid"], "invalid.heic"))).toBeNull();
});

test("patched ExifReader bounds zero-byte HEIC extents in a memory-limited child process", async () => {
  const { execFileSync } = await import("node:child_process");
  // The vulnerable parser allocates 6.5 million objects from this tiny file.
  // Keep both the process heap and execution time bounded, even on regression.
  const script = `const ExifReader = require('exifreader');
    const u16 = n => [n >> 8 & 255,n & 255];
    const u32 = n => [n >>> 24,n >>> 16 & 255,n >>> 8 & 255,n & 255];
    const str = s => [...Buffer.from(s)];
    const box = (name, bytes) => [...u32(bytes.length+8),...str(name),...bytes];
    const items = [0,0,0,0,0,0,...u16(100)];
    for(let i=0;i<100;i++) items.push(...u16(i+1),...u16(0),...u16(65535));
    const bytes = Uint8Array.from([...box('ftyp',[...str('heic'),0,0,0,0,...str('mif1'),0,0,0,0]),...box('meta',[0,0,0,0,...box('iloc',items)])]);
    ExifReader.load(bytes.buffer); console.log('bounded');`;
  expect(execFileSync(process.execPath, ["--max-old-space-size=64", "-e", script], { timeout: 5000, encoding: "utf8" }).trim()).toBe("bounded");
});
