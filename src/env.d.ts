/**
 * 文件：env.d.ts
 *
 * 【实现需求】让 TypeScript 识别 Astro 自动生成的类型和浏览器客户端环境。
 * 【关联】pnpm check、编辑器自动补全和所有 .astro/.ts/.tsx 文件。
 * 【修改入口】通常不需要修改；升级 Astro 或增加全局类型时才检查这里。
 * 【安全边界】不要删除下方引用，否则 Astro 类型检查可能失效。
 */
/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />
