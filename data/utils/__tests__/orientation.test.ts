import { describe, expect, it } from "vitest";
import { resolveOrientation } from "@/base/utils/orientation";

describe("resolveOrientation", () => {
  it("screen.orientation 与 viewport 一致时使用 screen 来源", () => {
    expect(
      resolveOrientation({
        screenType: "landscape-primary",
        width: 844,
        height: 390,
      }),
    ).toEqual({ value: "landscape", source: "screen" });
  });

  it("screen.orientation 与实际 viewport 冲突时以 viewport 为准", () => {
    // headless Chrome / 部分 iOS WebView：竖屏尺寸但 screen.orientation 仍是横屏
    expect(
      resolveOrientation({
        screenType: "landscape-primary",
        width: 390,
        height: 844,
      }),
    ).toEqual({ value: "portrait", source: "viewport" });
  });

  it("window.orientation 与 viewport 一致时使用 window.orientation 来源", () => {
    expect(
      resolveOrientation({
        legacyWindowOrientation: 90,
        width: 844,
        height: 390,
      }),
    ).toEqual({ value: "landscape", source: "window.orientation" });
  });

  it("screen 与 window.orientation 冲突时选择与 viewport 一致的一方", () => {
    expect(
      resolveOrientation({
        screenType: "landscape-primary",
        legacyWindowOrientation: 0,
        width: 390,
        height: 844,
      }),
    ).toEqual({ value: "portrait", source: "window.orientation" });
  });

  it("iOS 微信两个 orientation 都为 undefined 时回退 viewport（竖屏）", () => {
    expect(
      resolveOrientation({
        screenType: undefined,
        legacyWindowOrientation: undefined,
        width: 390,
        height: 844,
      }),
    ).toEqual({ value: "portrait", source: "viewport" });
  });

  it("iOS 微信两个 orientation 都为 undefined 时回退 viewport（横屏）", () => {
    expect(
      resolveOrientation({
        screenType: undefined,
        legacyWindowOrientation: undefined,
        width: 844,
        height: 390,
      }),
    ).toEqual({ value: "landscape", source: "viewport" });
  });

  it("viewport 不可用时回退到 screen.orientation", () => {
    expect(
      resolveOrientation({
        screenType: "portrait-primary",
        width: 0,
        height: 0,
      }),
    ).toEqual({ value: "portrait", source: "screen" });
  });

  it("非法 orientation 值不会破坏 viewport 兜底", () => {
    expect(
      resolveOrientation({
        screenType: "natural",
        legacyWindowOrientation: Number.NaN,
        width: 844,
        height: 390,
      }),
    ).toEqual({ value: "landscape", source: "viewport" });
  });
});
