import { computed, ref, watch } from "vue";
import {
  useColorMode,
  useEventListener,
  usePreferredDark,
} from "@vueuse/core";
import { createLogger } from "@/base/utils/logger";
import { resolveOrientation } from "@/base/utils/orientation";

export type { Orientation, OrientationSource } from "@/base/utils/orientation";
export type ThemeMode = "auto" | "light" | "dark";

interface ScreenOrientationSnapshot {
  type?: string;
  angle: number;
  supported: boolean;
}

function readViewportSize(): { width: number; height: number } {
  const root = document.documentElement;
  return {
    width: window.innerWidth || root.clientWidth || window.screen.width || 0,
    height: window.innerHeight || root.clientHeight || window.screen.height || 0,
  };
}

function readLegacyOrientation(): number | undefined {
  try {
    const value = (window as Window & { orientation?: unknown }).orientation;
    return typeof value === "number" && Number.isFinite(value)
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * 部分 iOS WebView 上 screen.orientation 可能不存在或为 undefined，
 * 直接读取会抛错，因此这里必须 try/catch 并允许返回 unsupported。
 */
function readScreenOrientation(): ScreenOrientationSnapshot {
  try {
    const orientation = window.screen?.orientation as
      | ScreenOrientation
      | undefined;
    if (orientation && typeof orientation.type === "string") {
      return {
        type: orientation.type,
        angle:
          typeof orientation.angle === "number" ? orientation.angle : 0,
        supported: true,
      };
    }
  } catch {
    /* 忽略：交给 window.orientation / viewport 兜底 */
  }
  return { type: undefined, angle: 0, supported: false };
}

const logger = createLogger("env");

const colorMode = useColorMode({
  storageKey: "h5.color-mode",
  initialValue: "auto",
  emitAuto: true,
});

const preferredDark = usePreferredDark();
const isDark = computed(() =>
  colorMode.value === "auto"
    ? preferredDark.value
    : colorMode.value === "dark",
);

const viewport = ref(readViewportSize());
const screenOrientation = ref<ScreenOrientationSnapshot>(
  readScreenOrientation(),
);
const screenType = computed(() => screenOrientation.value.type);
const angle = computed(() => screenOrientation.value.angle);
const orientationSupported = computed(
  () => screenOrientation.value.supported,
);

const legacyWindowOrientation = ref<number | undefined>(
  readLegacyOrientation(),
);

const viewportWidth = computed(() => viewport.value.width);
const viewportHeight = computed(() => viewport.value.height);

const resolved = computed(() =>
  resolveOrientation({
    screenType: screenType.value,
    legacyWindowOrientation: legacyWindowOrientation.value,
    width: viewportWidth.value,
    height: viewportHeight.value,
  }),
);
const resolvedOrientation = computed(() => resolved.value.value);
const orientationSource = computed(() => resolved.value.source);
const isPortrait = computed(() => resolvedOrientation.value === "portrait");

let refreshTimer: ReturnType<typeof setTimeout> | undefined;

function refreshViewport(): void {
  viewport.value = readViewportSize();
  legacyWindowOrientation.value = readLegacyOrientation();
  screenOrientation.value = readScreenOrientation();
}

function refreshOrientation(): void {
  // 先立即读取；iOS 的 orientationchange 可能早于尺寸更新，再延迟一拍补读
  refreshViewport();
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refreshViewport, 120);
}

useEventListener(window, "orientationchange", refreshOrientation, {
  passive: true,
});
useEventListener(window, "resize", refreshOrientation, { passive: true });
useEventListener(window, "pageshow", refreshOrientation, { passive: true });
if (window.visualViewport) {
  useEventListener(window.visualViewport, "resize", refreshOrientation, {
    passive: true,
  });
}

let initialized = false;

function applyEnvironment(): void {
  const root = document.documentElement;
  // Vant 通过 .van-theme-dark 切换全部 CSS 变量；挂到 html 上可覆盖 Toast/Dialog
  root.classList.toggle("van-theme-dark", isDark.value);
  root.dataset.theme = isDark.value ? "dark" : "light";
  root.dataset.orientation = resolvedOrientation.value;
  root.dataset.orientationSource = orientationSource.value;
  root.style.colorScheme = isDark.value ? "dark" : "light";

  logger.info("environment updated", {
    mode: colorMode.value,
    dark: isDark.value,
    orientation: resolvedOrientation.value,
    orientationSource: orientationSource.value,
    screenOrientation: screenType.value ?? "unsupported",
    legacyWindowOrientation: legacyWindowOrientation.value ?? "unsupported",
    angle: angle.value,
    viewport: `${viewportWidth.value}x${viewportHeight.value}`,
    orientationSupported: orientationSupported.value,
  });
}

function ensureEnvironment(): void {
  if (initialized) return;
  initialized = true;
  watch(
    [
      colorMode,
      isDark,
      resolved,
      viewportWidth,
      viewportHeight,
      legacyWindowOrientation,
      screenOrientation,
      angle,
    ],
    applyEnvironment,
    { immediate: true },
  );
}

/**
 * 初始化主题与屏幕方向。
 * 主题持久化在 h5.color-mode，auto 跟随系统；Vant 暗色由 .van-theme-dark 驱动。
 */
export function setupAppEnvironment(): void {
  ensureEnvironment();
}

export function useAppEnvironment() {
  ensureEnvironment();
  return {
    colorMode,
    isDark,
    isPortrait,
    orientation: screenType,
    resolvedOrientation,
    orientationSource,
    orientationSupported,
    angle,
    width: viewportWidth,
    height: viewportHeight,
    setThemeMode: (mode: ThemeMode) => {
      colorMode.value = mode;
    },
    setDark: (value: boolean) => {
      colorMode.value = value ? "dark" : "light";
    },
  };
}
