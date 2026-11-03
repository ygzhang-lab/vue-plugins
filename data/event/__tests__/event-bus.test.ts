import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRenderer, defineComponent, effectScope, h } from "vue";
import {
  EVENT_MANAGER_KEY,
  EventPlugin,
  createEventManager,
  eventBus,
  getActiveEventManager,
  setActiveEventManager,
  useEvent,
  useEventManager,
  useEventOnce,
  type EventManager,
} from "@/base/event";

/**
 * 无 DOM 的自定义渲染器：让组件在 node 环境下真实走 setup / provide / unmount，
 * 不需要引入 jsdom。
 */
const testRenderer = createRenderer({
  patchProp() {},
  insert() {},
  remove() {},
  createElement: () => ({}),
  createText: () => ({}),
  createComment: () => ({}),
  setText() {},
  setElementText() {},
  parentNode: () => null,
  nextSibling: () => null,
  querySelector: () => null,
  setScopeId() {},
});

/** 挂载一个只有 setup 的组件，返回 app 以便 unmount */
function mountComponent(options: { manager?: EventManager<any> }, setup: () => void) {
  const app = testRenderer.createApp(
    defineComponent({
      setup() {
        setup();
        return () => h("div");
      },
    }),
  );
  app.use(EventPlugin, options);
  app.mount({});
  return app;
}

beforeEach(() => {
  // 模块级活跃指针会跨用例残留，每个用例换一个干净实例
  setActiveEventManager(createEventManager());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("eventBus 门面", () => {
  it("操作当前活跃 manager 并返回卸载函数", () => {
    const handler = vi.fn();

    const off = eventBus.on("demo", handler);
    expect(eventBus.hasListeners("demo")).toBe(true);
    expect(eventBus.listenerCount("demo")).toBe(1);

    eventBus.emit("demo", 1, 2);
    expect(handler).toHaveBeenCalledWith(1, 2);

    off();
    expect(eventBus.hasListeners("demo")).toBe(false);
    expect(eventBus.listenerCount("demo")).toBe(0);
  });

  it("on / once / off / clear 都作用在活跃实例上", () => {
    const manager = createEventManager();
    setActiveEventManager(manager);
    const onceHandler = vi.fn();
    const handler = vi.fn();

    eventBus.once("demo", onceHandler);
    eventBus.emit("demo", "x");
    eventBus.emit("demo", "y");
    expect(onceHandler).toHaveBeenCalledTimes(1);

    eventBus.on("demo", handler);
    eventBus.off("demo", handler);
    eventBus.emit("demo");
    expect(handler).not.toHaveBeenCalled();

    eventBus.on("demo", handler);
    eventBus.clear("demo");
    expect(manager.listenerCount("demo")).toBe(0);
  });

  it("切换活跃 manager 后门面立即跟随", () => {
    const first = getActiveEventManager();
    const second = createEventManager();
    const handler = vi.fn();

    eventBus.on("demo", handler);
    setActiveEventManager(second);

    eventBus.emit("demo");
    expect(handler).not.toHaveBeenCalled();
    expect(second.listenerCount("demo")).toBe(0);

    first.emit("demo");
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe("useEvent / useEventOnce 自动清理", () => {
  it("effectScope 销毁时自动卸载 useEvent 注册的监听器", () => {
    const manager = createEventManager();
    const handler = vi.fn();
    const scope = effectScope();

    const off = scope.run(() => useEvent("demo", handler, manager));
    expect(off).toBeTypeOf("function");
    expect(manager.listenerCount("demo")).toBe(1);

    manager.emit("demo", "payload");
    expect(handler).toHaveBeenCalledWith("payload");

    scope.stop();
    expect(manager.listenerCount("demo")).toBe(0);
  });

  it("手动提前 off 后 scope 销毁不报错也不误删其他监听", () => {
    const manager = createEventManager();
    const handler = vi.fn();
    const other = vi.fn();
    const scope = effectScope();

    const off = scope.run(() => useEvent("demo", handler, manager));
    manager.on("demo", other);
    off?.();
    expect(manager.listenerCount("demo")).toBe(1);

    expect(() => scope.stop()).not.toThrow();
    expect(manager.listenerCount("demo")).toBe(1);
  });

  it("无 scope 时退化为手动模式，监听保留直到手动 off", () => {
    const manager = createEventManager();
    const handler = vi.fn();

    const off = useEvent("demo", handler, manager);
    manager.emit("demo");
    expect(handler).toHaveBeenCalledTimes(1);

    off();
    expect(manager.listenerCount("demo")).toBe(0);
  });

  it("useEventOnce 只触发一次，scope 销毁后无残留", () => {
    const manager = createEventManager();
    const handler = vi.fn();
    const scope = effectScope();

    scope.run(() => useEventOnce("demo", handler, manager));
    manager.emit("demo", 1);
    manager.emit("demo", 2);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(manager.listenerCount("demo")).toBe(0);

    expect(() => scope.stop()).not.toThrow();
  });

  it("useEventOnce 未触发时随 scope 销毁卸载", () => {
    const manager = createEventManager();
    const scope = effectScope();

    scope.run(() => useEventOnce("demo", () => {}, manager));
    expect(manager.listenerCount("demo")).toBe(1);

    scope.stop();
    expect(manager.listenerCount("demo")).toBe(0);
  });

  it("同一 handler 被多个 scope 复用时各自独立，一方卸载不影响另一方", () => {
    const manager = createEventManager();
    const handler = vi.fn();
    const scopeA = effectScope();
    const scopeB = effectScope();

    scopeA.run(() => useEvent("demo", handler, manager));
    scopeB.run(() => useEvent("demo", handler, manager));
    // useEvent 每次独立包装，不做 Set 去重
    expect(manager.listenerCount("demo")).toBe(2);

    manager.emit("demo", 1);
    expect(handler).toHaveBeenCalledTimes(2);

    scopeA.stop();
    expect(manager.listenerCount("demo")).toBe(1);
    manager.emit("demo", 2);
    expect(handler).toHaveBeenCalledTimes(3);

    scopeB.stop();
    expect(manager.listenerCount("demo")).toBe(0);
  });

  it("两个组件复用同一 handler，卸载其中一个不影响另一个", () => {
    const manager = createEventManager();
    const handler = vi.fn();

    const appA = mountComponent({ manager }, () => {
      useEvent("demo", handler);
    });
    const appB = mountComponent({ manager }, () => {
      useEvent("demo", handler);
    });

    expect(manager.listenerCount("demo")).toBe(2);
    appA.unmount();
    expect(manager.listenerCount("demo")).toBe(1);

    manager.emit("demo", "still-alive");
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith("still-alive");

    appB.unmount();
    expect(manager.listenerCount("demo")).toBe(0);
  });

  it("useEventOnce 复用同一 handler 时每个实例各触发一次", () => {
    const manager = createEventManager();
    const handler = vi.fn();
    const scopeA = effectScope();
    const scopeB = effectScope();

    scopeA.run(() => useEventOnce("demo", handler, manager));
    scopeB.run(() => useEventOnce("demo", handler, manager));
    expect(manager.listenerCount("demo")).toBe(2);

    manager.emit("demo");
    expect(handler).toHaveBeenCalledTimes(2);
    expect(manager.listenerCount("demo")).toBe(0);

    scopeA.stop();
    scopeB.stop();
  });

  it("useEvent 注册的监听不能用原 handler 通过 manager.off 卸载（需用返回值）", () => {
    const manager = createEventManager();
    const handler = vi.fn();
    const scope = effectScope();

    const off = scope.run(() => useEvent("demo", handler, manager))!;
    manager.off("demo", handler);
    expect(manager.listenerCount("demo")).toBe(1);

    off();
    expect(manager.listenerCount("demo")).toBe(0);
    scope.stop();
  });

  it("显式传入 manager 时不使用活跃实例", () => {
    const explicit = createEventManager();
    const scope = effectScope();
    const handler = vi.fn();

    scope.run(() => useEvent("demo", handler, explicit));
    eventBus.emit("demo");
    expect(handler).not.toHaveBeenCalled();

    explicit.emit("demo");
    expect(handler).toHaveBeenCalledTimes(1);
    scope.stop();
  });
});

describe("组件内 inject 与生命周期", () => {
  it("组件卸载时自动卸载插件提供的 manager 上的监听器", () => {
    const manager = createEventManager();
    const handler = vi.fn();

    const app = mountComponent({ manager }, () => {
      useEvent("demo", handler);
    });

    expect(manager.listenerCount("demo")).toBe(1);
    manager.emit("demo", "hi");
    expect(handler).toHaveBeenCalledWith("hi");

    app.unmount();
    expect(manager.listenerCount("demo")).toBe(0);
  });

  it("组件内 useEventManager 返回插件通过 provide 注入的实例", () => {
    const manager = createEventManager();
    let injected: EventManager<any> | undefined;

    const app = mountComponent({ manager }, () => {
      injected = useEventManager();
    });

    expect(injected).toBe(manager);
    expect(app.config.globalProperties.$event).toBe(manager);
    expect(app._context.provides[EVENT_MANAGER_KEY]).toBe(manager);
    app.unmount();
  });

  it("多个 app 各自独立，互不串事件", () => {
    const managerA = createEventManager();
    const managerB = createEventManager();
    const handlerA = vi.fn();
    const handlerB = vi.fn();

    const appA = mountComponent({ manager: managerA }, () => {
      useEvent("demo", handlerA);
    });
    const appB = mountComponent({ manager: managerB }, () => {
      useEvent("demo", handlerB);
    });

    managerA.emit("demo", "a");
    expect(handlerA).toHaveBeenCalledWith("a");
    expect(handlerB).not.toHaveBeenCalled();

    managerB.emit("demo", "b");
    expect(handlerB).toHaveBeenCalledWith("b");

    appA.unmount();
    expect(managerA.listenerCount("demo")).toBe(0);
    expect(managerB.listenerCount("demo")).toBe(1);
    appB.unmount();
  });

  it("useEventManager 在组件外回退到活跃实例", () => {
    const active = getActiveEventManager();
    expect(useEventManager()).toBe(active);
  });
});

describe("EventPlugin", () => {
  it("传入 manager 时 provide 它，但不污染活跃指针", () => {
    const active = getActiveEventManager();
    const custom = createEventManager();
    let injected: EventManager<any> | undefined;

    const app = mountComponent({ manager: custom }, () => {
      injected = useEventManager();
    });

    expect(injected).toBe(custom);
    expect(getActiveEventManager()).toBe(active);
    app.unmount();
  });

  it("不传 manager 时复用活跃实例", () => {
    const active = getActiveEventManager();
    let injected: EventManager<any> | undefined;

    const app = mountComponent({}, () => {
      injected = useEventManager();
    });

    expect(injected).toBe(active);
    app.unmount();
  });

  it("未安装插件时 setup 内回退到活跃实例也能工作", () => {
    const active = getActiveEventManager();
    const handler = vi.fn();

    const app = testRenderer.createApp(
      defineComponent({
        setup() {
          useEvent("demo", handler);
          return () => h("div");
        },
      }),
    );
    app.mount({});

    expect(active.listenerCount("demo")).toBe(1);
    active.emit("demo", 1);
    expect(handler).toHaveBeenCalledWith(1);

    app.unmount();
    expect(active.listenerCount("demo")).toBe(0);
  });
});
