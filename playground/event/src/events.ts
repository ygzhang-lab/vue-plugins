/** 事件表：key → 参数元组，useEvent / emit 全程类型推导 */
export interface DemoEvents {
  'demo:message': [text: string]
  'demo:once': []
  'demo:error': []
}
