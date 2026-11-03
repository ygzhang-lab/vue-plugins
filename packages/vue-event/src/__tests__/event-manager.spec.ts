import { afterEach, describe, expect, it, vi } from "vitest";
import { EventManager, createEventManager } from "../index";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("EventManager 派发", () => {
  it("emit 同步按注册顺序透传全部参数", () => {
    const manager = createEventManager();
    const calls: unknown[][] = [];

    manager.on("demo", (...args) => calls.push(args));
    manager.on("demo", (...args) => calls.push(args));
    manager.emit("demo", 1, "a", { ok: true });

    expect(calls).toEqual([
      [1, "a", { ok: true }],
      [1, "a", { ok: true }],
    ]);
  });

  it("emit 没有监听器时安全返回", () => {
    const manager = createEventManager();
    expect(() => manager.emit("nothing")).not.toThrow();
  });

  it("symbol 事件名与同名 string 事件互不影响", () => {
    const manager = createEventManager();
    const key = Symbol("demo");
    const symbolHandler = vi.fn();
    const stringHandler = vi.fn();

    manager.on(key, symbolHandler);
    manager.on("Symbol(demo)", stringHandler);
    manager.emit(key, 1);

    expect(symbolHandler).toHaveBeenCalledWith(1);
    expect(stringHandler).not.toHaveBeenCalled();
  });

  it("派发期间新增的监听器不参与本次派发，下次生效", () => {
    const manager = createEventManager();
    const late = vi.fn();

    manager.on("demo", () => {
      manager.on("demo", late);
    });
    manager.emit("demo");
    expect(late).not.toHaveBeenCalled();

    manager.emit("demo");
    expect(late).toHaveBeenCalledTimes(1);
  });

  it("派发期间被 off 的监听器在本次快照中仍会执行", () => {
    const manager = createEventManager();
    const second = vi.fn();

    manager.on("demo", () => {
      manager.off("demo", second);
    });
    manager.on("demo", second);
    manager.emit("demo");

    // 快照语义：本次派发使用注册时刻的副本，移除只影响下一次
    expect(second).toHaveBeenCalledTimes(1);
    expect(manager.listenerCount("demo")).toBe(1);
  });
});

describe("EventManager 卸载", () => {
  it("on 返回的卸载函数幂等", () => {
    const manager = createEventManager();
    const handler = vi.fn();
    const off = manager.on("demo", handler);

    off();
    off();
    manager.emit("demo");

    expect(handler).not.toHaveBeenCalled();
    expect(manager.listenerCount("demo")).toBe(0);
  });

  it("off(event, handler) 只移除指定 handler", () => {
    const manager = createEventManager();
    const keep = vi.fn();
    const drop = vi.fn();

    manager.on("demo", drop);
    manager.on("demo", keep);
    manager.off("demo", drop);
    manager.emit("demo");

    expect(drop).not.toHaveBeenCalled();
    expect(keep).toHaveBeenCalledTimes(1);
  });

  it("off(event) 清空该事件，其他事件不受影响", () => {
    const manager = createEventManager();
    const demo = vi.fn();
    const other = vi.fn();

    manager.on("demo", demo);
    manager.on("other", other);
    manager.off("demo");
    manager.emit("demo");
    manager.emit("other");

    expect(demo).not.toHaveBeenCalled();
    expect(other).toHaveBeenCalledTimes(1);
  });

  it("卸载未注册的事件 / handler 不报错", () => {
    const manager = createEventManager();
    expect(() => manager.off("missing")).not.toThrow();
    expect(() => manager.off("missing", () => {})).not.toThrow();
  });

  it("同一 handler 引用重复注册只保留一份，一次 off 全部移除", () => {
    const manager = createEventManager();
    const handler = vi.fn();

    manager.on("demo", handler);
    manager.on("demo", handler);
    expect(manager.listenerCount("demo")).toBe(1);

    manager.emit("demo");
    expect(handler).toHaveBeenCalledTimes(1);

    manager.off("demo", handler);
    expect(manager.listenerCount("demo")).toBe(0);
  });

  it("clear(event) 只清空指定事件，clear() 清空全部", () => {
    const manager = createEventManager();
    const a = vi.fn();
    const b = vi.fn();

    manager.on("a", a);
    manager.on("b", b);
    manager.clear("a");
    manager.emit("a");
    manager.emit("b");
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);

    manager.clear();
    manager.emit("b");
    expect(b).toHaveBeenCalledTimes(1);
    expect(manager.listenerCount("b")).toBe(0);
  });

  it("listenerCount / hasListeners 反映当前状态", () => {
    const manager = createEventManager();
    expect(manager.hasListeners("demo")).toBe(false);

    const off = manager.on("demo", () => {});
    expect(manager.listenerCount("demo")).toBe(1);
    expect(manager.hasListeners("demo")).toBe(true);

    off();
    expect(manager.listenerCount("demo")).toBe(0);
    expect(manager.hasListeners("demo")).toBe(false);
  });
});

describe("EventManager once", () => {
  it("只触发一次并在触发前移除自身", () => {
    const manager = createEventManager();
    const handler = vi.fn();

    manager.once("demo", handler);
    manager.emit("demo", "first");
    expect(manager.listenerCount("demo")).toBe(0);
    manager.emit("demo", "second");

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith("first");
  });

  it("未触发时可用原始 handler 卸载", () => {
    const manager = createEventManager();
    const handler = vi.fn();

    manager.once("demo", handler);
    manager.off("demo", handler);
    manager.emit("demo");

    expect(handler).not.toHaveBeenCalled();
    expect(manager.listenerCount("demo")).toBe(0);
  });

  it("同一原始 handler 多次 once 时 off 会全部移除", () => {
    const manager = createEventManager();
    const handler = vi.fn();

    manager.once("demo", handler);
    manager.once("demo", handler);
    expect(manager.listenerCount("demo")).toBe(2);

    manager.off("demo", handler);
    expect(manager.listenerCount("demo")).toBe(0);
  });

  it("once handler 抛错时仍已移除，无残留且错误被隔离", () => {
    const manager = createEventManager({ onError: vi.fn() });

    manager.once("demo", () => {
      throw new Error("boom");
    });
    expect(() => manager.emit("demo")).not.toThrow();

    expect(manager.listenerCount("demo")).toBe(0);
  });

  it("once 返回的卸载函数在触发后调用幂等", () => {
    const manager = createEventManager();
    const off = manager.once("demo", () => {});

    manager.emit("demo");
    expect(() => off()).not.toThrow();
    expect(manager.listenerCount("demo")).toBe(0);
  });
});

describe("EventManager 错误处理", () => {
  it("单个 handler 抛错不影响后续 handler，并交给 onError", () => {
    const onError = vi.fn();
    const manager = createEventManager({ onError });
    const after = vi.fn();
    const error = new Error("boom");

    manager.on("demo", () => {
      throw error;
    });
    manager.on("demo", after);
    manager.emit("demo");

    expect(after).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(error, "demo");
  });

  it("默认 onError 打印到 console.error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const manager = createEventManager();
    const error = new Error("boom");

    manager.on("demo", () => {
      throw error;
    });
    manager.emit("demo");

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[1]).toBe(error);
  });

  it("onError 自身抛错时仍继续派发剩余 handler", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const manager = createEventManager({
      onError: () => {
        throw new Error("reporter down");
      },
    });
    const after = vi.fn();

    manager.on("demo", () => {
      throw new Error("boom");
    });
    manager.on("demo", after);

    expect(() => manager.emit("demo")).not.toThrow();
    expect(after).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("handler 返回的 Promise 不被 emit 接管（同步派发契约）", async () => {
    const onError = vi.fn();
    const manager = createEventManager({ onError });
    const handler = vi.fn(async () => {});

    manager.on("demo", handler);
    manager.emit("demo");
    await Promise.resolve();

    expect(handler).toHaveBeenCalledTimes(1);
    // emit 不 await、不 catch 返回值，异步错误需 handler 自行处理
    expect(onError).not.toHaveBeenCalled();
  });
});

describe("EventManager 边界场景", () => {
  it("嵌套 emit 立即执行内层派发", () => {
    const manager = createEventManager();
    const order: string[] = [];

    manager.on("outer", () => {
      order.push("outer:before");
      manager.emit("inner");
      order.push("outer:after");
    });
    manager.on("inner", () => order.push("inner"));

    manager.emit("outer");
    expect(order).toEqual(["outer:before", "inner", "outer:after"]);
  });

  it("派发中 clear 后，本次快照里的剩余 handler 仍会执行", () => {
    const manager = createEventManager();
    const second = vi.fn();

    manager.on("demo", () => manager.clear());
    manager.on("demo", second);
    manager.emit("demo");

    expect(second).toHaveBeenCalledTimes(1);
    expect(manager.listenerCount("demo")).toBe(0);
  });

  it("派发期间注册的 once 不在本次触发", () => {
    const manager = createEventManager();
    const late = vi.fn();
    let registered = false;

    manager.on("demo", () => {
      if (registered) return;
      registered = true;
      manager.once("demo", late);
    });

    manager.emit("demo");
    expect(late).not.toHaveBeenCalled();

    manager.emit("demo");
    expect(late).toHaveBeenCalledTimes(1);
    // 只剩最初的外层监听器
    expect(manager.listenerCount("demo")).toBe(1);
  });

  it("与原型链属性同名的事件名互不干扰", () => {
    const manager = createEventManager();
    const names = ["__proto__", "constructor", "toString", "hasOwnProperty", "valueOf"];

    const handlers = names.map(() => vi.fn());
    names.forEach((name, index) => manager.on(name, handlers[index]!));
    names.forEach((name, index) => manager.emit(name, index));

    handlers.forEach((handler, index) => {
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(index);
    });
    expect(manager.listenerCount("name")).toBe(0);
  });

  it("大量监听器按注册顺序执行", () => {
    const manager = createEventManager();
    const calls: number[] = [];

    for (let index = 0; index < 1000; index += 1) {
      manager.on("bulk", () => calls.push(index));
    }
    manager.emit("bulk");

    expect(calls).toHaveLength(1000);
    expect(calls[0]).toBe(0);
    expect(calls[999]).toBe(999);
    expect(manager.listenerCount("bulk")).toBe(1000);

    manager.clear();
    expect(manager.listenerCount("bulk")).toBe(0);
  });

  it("中间 handler 抛错时后续 handler 仍按顺序执行", () => {
    const onError = vi.fn();
    const manager = createEventManager({ onError });
    const order: number[] = [];

    manager.on("demo", () => order.push(1));
    manager.on("demo", () => {
      throw new Error("boom");
    });
    manager.on("demo", () => order.push(3));
    manager.emit("demo");

    expect(order).toEqual([1, 3]);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

describe("EventManager 类型", () => {
  it("interface 声明的事件表可直接作为泛型，handler 参数自动推导", () => {
    interface AppEvents {
      "user:update": [{ id: number; name: string }];
      notify: [message: string, level?: "info" | "error"];
    }

    const manager = createEventManager<AppEvents>();
    const seen: string[] = [];

    manager.on("user:update", (user) => {
      seen.push(user.name.toUpperCase());
    });
    manager.emit("user:update", { id: 1, name: "tom" });
    manager.emit("notify", "hello");
    manager.emit("notify", "hello", "error");

    // 非法用法只做类型断言，不真正执行
    const invalidUsage = () => {
      // @ts-expect-error 缺少必填参数
      manager.emit("user:update");
      // @ts-expect-error 未声明的事件名
      manager.on("unknown:event", () => {});
      // @ts-expect-error 参数类型不匹配
      manager.emit("notify", 1);
    };

    expect(invalidUsage).toBeTypeOf("function");
    expect(seen).toEqual(["TOM"]);
    expect(manager).toBeInstanceOf(EventManager);
  });

  it("未传泛型时接受任意事件名", () => {
    const manager = createEventManager();
    const handler = vi.fn();

    manager.on("anything", handler);
    manager.emit("anything", 1, "two");

    expect(handler).toHaveBeenCalledWith(1, "two");
  });
});
