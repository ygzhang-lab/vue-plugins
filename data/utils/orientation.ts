export type Orientation = "portrait" | "landscape";
export type OrientationSource = "screen" | "window.orientation" | "viewport";

export interface OrientationInput {
  screenType?: string;
  legacyWindowOrientation?: number;
  width: number;
  height: number;
}

export interface OrientationResult {
  value: Orientation;
  source: OrientationSource;
}

function fromScreenType(type?: string): Orientation | undefined {
  if (
    type === "portrait-primary" ||
    type === "portrait-secondary" ||
    type === "portrait"
  ) {
    return "portrait";
  }
  if (
    type === "landscape-primary" ||
    type === "landscape-secondary" ||
    type === "landscape"
  ) {
    return "landscape";
  }
  return undefined;
}

function fromLegacy(value?: number): Orientation | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.abs(value) === 90 || Math.abs(value) === 270
    ? "landscape"
    : "portrait";
}

function fromViewport(width: number, height: number): Orientation | undefined {
  if (width <= 0 || height <= 0) return undefined;
  return height >= width ? "portrait" : "landscape";
}

/**
 * 横竖屏判定：
 * - viewport 可用时以其为准，但会优先复用与之一致的 orientation API 来源；
 * - orientation API 与 viewport 冲突时使用 viewport。
 *
 * 原因：iOS / 微信 H5 和部分 WebView 会出现 screen.orientation.type 长期停留在
 * landscape-primary，但实际 window.innerWidth/innerHeight 是正确的竖屏尺寸。
 * 因此不能无条件信任 orientation API。
 */
export function resolveOrientation(input: OrientationInput): OrientationResult {
  const screenValue = fromScreenType(input.screenType);
  const legacyValue = fromLegacy(input.legacyWindowOrientation);
  const viewportValue = fromViewport(input.width, input.height);

  if (viewportValue) {
    if (screenValue === viewportValue) {
      return { value: viewportValue, source: "screen" };
    }
    if (legacyValue === viewportValue) {
      return { value: viewportValue, source: "window.orientation" };
    }
    return { value: viewportValue, source: "viewport" };
  }

  if (screenValue) return { value: screenValue, source: "screen" };
  if (legacyValue) return { value: legacyValue, source: "window.orientation" };
  return { value: "portrait", source: "viewport" };
}
