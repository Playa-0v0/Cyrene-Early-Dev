import { describe, expect, it } from "vitest";
import { getStickerSrcForId } from "./sticker-src";

describe("getStickerSrcForId", () => {
  const builtIn = {
    hello: "/stickers/hello.jpg",
  };
  const enabledStickers = [
    { id: "custom_hug", src: "local-sticker:///custom_hug.png" },
  ];

  it("uses built-in paths before catalog entries", () => {
    expect(getStickerSrcForId("hello", builtIn, enabledStickers)).toBe("/stickers/hello.jpg");
  });

  it("uses the enabled sticker catalog for custom ids without file extensions", () => {
    expect(getStickerSrcForId("custom_hug", builtIn, enabledStickers)).toBe("local-sticker:///custom_hug.png");
  });

  it("returns undefined for unknown ids", () => {
    expect(getStickerSrcForId("missing", builtIn, enabledStickers)).toBeUndefined();
  });
});
