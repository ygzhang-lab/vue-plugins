/**
 * 内存存储适配器：仅存活于当前 JS 运行时。
 *
 * 用于单测、SSR 或不想落盘的敏感场景；
 * 不实现 subscribe，因此不参与跨 tab 同步。
 */
import type { TokenSnapshot, TokenStorage } from '../types';

export function memoryStorageAdapter(initial: TokenSnapshot | null = null): TokenStorage {
  let value = initial;
  return {
    read: () => value,
    write: (s) => { value = s; },
  };
}
