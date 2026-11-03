/**
 * 跨 tab 同步：把 storage 的外部变化灌入 TokenStore。
 *
 * 依赖 hydrateFromExternal 的 version 守卫忽略过期快照；
 * 本 tab 自身写入不会触发浏览器 storage 事件，因此不存在回环。
 * storage 未实现 subscribe 时为空操作。
 */
import type { TokenStore } from '../token-store';
import type { TokenStorage } from '../types';

/**
 * 将 storage 外部变化（其他 tab）同步进 TokenStore。
 * 依赖 hydrateFromExternal 内部的 version 守卫防止回退。
 * 当前 tab 自身写入不会触发浏览器 storage 事件，天然无回环。
 */
export function syncTokenStoreWithStorage(
  store: TokenStore,
  storage: TokenStorage
): () => void {
  if (!storage.subscribe) return () => {};
  return storage.subscribe((snapshot) => {
    store.hydrateFromExternal(snapshot);
  });
}
