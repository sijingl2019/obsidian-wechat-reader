# WeChat Reader — Obsidian 插件设计与实施计划

## Context
用户想在 Obsidian 内直接使用微信读书：扫码登录、打开书架里的书阅读、边读边在 Obsidian 里做笔记。工作目录 `/Users/sijinglin/Documents/Workspace/obsidian-wechat-reader` 目前为空（非 git 仓库），属于全新项目。

已确认的需求：
- 笔记形态：**左侧微信读书阅读器 + 右侧该书对应的 Obsidian 笔记**（自动创建），可一键同步微信读书里的划线/想法。
- 需要「选中文字一键摘录到笔记」。

关键技术前提（假设，可纠正）：
- 仅支持**桌面端**（依赖 Electron `<webview>`）。微信读书网页版正文加密 + canvas 渲染，无法自行抓取正文渲染，所以直接嵌入官方网页阅读器 `https://weread.qq.com`。
- iframe 会被 X-Frame-Options 拦截，外部浏览器又不算“在 Obsidian 内”，因此选用 `<webview partition="persist:wechat-reader">`：登录态持久保存在该分区内，重启 Obsidian 不需重新扫码。
- 调用微信读书 Web API 时，在 webview 内部执行 `fetch`（同源、自动带 cookie），无需自己管理 `wr_vid / wr_skey`。

## 架构（src/ 下各单元单一职责）

| 文件 | 职责 |
|---|---|
| `src/main.ts` | 插件入口：注册视图、ribbon 图标、命令、设置页 |
| `src/readerView.ts` | `ItemView`（type `wechat-reader-view`），承载 webview；监听导航，识别当前书；注入摘录脚本；暴露 `runInPage(js)` |
| `src/weread/api.ts` | 微信读书接口封装，依赖注入一个 `exec(js) => Promise<any>`（即 webview.executeJavaScript）。接口：`getUser()` 判断登录、`getBookInfo(bookId)`、`getBookmarks(bookId)` (`/web/book/bookmarklist?bookId=`)、`getReviews(bookId)` (`/web/review/list?bookId=&listType=11&mine=1&synckey=0`)、`getChapters(bookId)` (`POST /web/book/chapterInfos`) |
| `src/weread/currentBook.ts` | 从页面 `window.__INITIAL_STATE__`（reader.bookId / bookInfo）读取当前书；URL 匹配 `/web/reader/` 才视为在读 |
| `src/notes/format.ts` | **纯函数**：书信息 → frontmatter；划线/想法按章节 → Markdown；摘录 → `> [!quote]` callout。可单测 |
| `src/notes/bookNote.ts` | 找到/创建 `{folder}/{书名}.md`（按 frontmatter `weread-bookId` 匹配，防改名后重复建）；替换受管区块；追加摘录 |
| `src/settings.ts` | 设置：笔记文件夹（默认 `WeChat Reader`）、打开书时是否自动打开侧边笔记（默认是）、复制时是否自动摘录（默认是）、「退出登录」按钮 |
| `styles.css` | webview 铺满视图、顶部小工具栏样式 |

### 数据流
1. **登录**：ribbon/命令「打开微信读书」→ 在主区域打开 ReaderView，webview 加载 `https://weread.qq.com/`。用户在页面上点登录、用微信扫码（官方流程，插件不碰账号密码）。顶部工具栏显示登录状态（`api.getUser()`）。
2. **打开书**：用户在 webview 内书架点书 → `did-navigate`/`did-navigate-in-page` 命中 `/web/reader/` → `currentBook` 拿到 bookId + 书名 → `bookNote.ensure()` 创建/定位笔记 → 在右侧垂直分屏打开（复用同一个 leaf，换书时切换笔记）。
3. **同步划线/想法**：工具栏按钮 / 命令「同步当前书划线」→ api 拉 bookmarks + reviews + chapters → `format` 生成 → 写入笔记中 `<!-- weread:highlights:start -->` 与 `<!-- weread:highlights:end -->` 之间（整块替换，用户在区块外写的内容永不改动）。
4. **选中摘录**：webview `dom-ready` 时注入脚本，包裹 `navigator.clipboard.writeText` 与 `document.execCommand('copy')`：微信读书的选中工具条点「复制」时，额外 `console.log('__WR_EXCERPT__' + JSON.stringify({text, chapter}))`；ReaderView 监听 webview `console-message` 事件捕获 → 追加到笔记末尾 `## 摘录` 下（带时间）。另提供命令「把剪贴板插入为摘录」作兜底（复制钩子失效时用）。

### 错误处理
- 非桌面端：`onload` 中检测 `Platform.isDesktopApp`，否则 Notice 提示并不注册视图。
- 未登录调用同步：Notice「请先在阅读器中登录微信读书」。
- 接口返回 `errcode`（如 -2012 登录过期）：Notice 提示重新登录，不改笔记。
- 书名非法字符：文件名清洗（`\/:*?"<>|#^[]`）。

## 项目脚手架
基于官方 obsidian-sample-plugin 结构：`manifest.json`（id `wechat-reader`，name `WeChat Reader`，`isDesktopOnly: true`）、`package.json`、`tsconfig.json`、`esbuild.config.mjs`、`versions.json`、`.gitignore`、`README.md`（中文使用说明）。依赖：`obsidian`、`typescript`、`esbuild`、`vitest`（测试）。`git init` 后提交。

执行开始时先把本设计另存为 `docs/superpowers/specs/2026-10-01-wechat-reader-design.md` 并提交（plan 模式下只能写本文件）。

## 实施步骤（TDD 适用于纯逻辑部分）
1. 脚手架 + git init + 能 `npm run build` 出空插件。
2. `notes/format.ts` + vitest 单测（frontmatter、章节分组、callout、文件名清洗）。
3. `weread/api.ts`（注入 fake `exec` 做单测：拼请求、解析响应、errcode 处理）。
4. `notes/bookNote.ts`（受管区块替换逻辑抽成纯函数 `replaceManagedBlock` 并单测）。
5. `readerView.ts`：webview、工具栏（登录状态 / 同步 / 打开笔记 / 后退刷新）、导航监听、摘录脚本注入。
6. `main.ts` + `settings.ts` 接线；`styles.css`。
7. README。

## 验证
- `npm test`：format / api / replaceManagedBlock 单测全过。
- `npm run build` 生成 `main.js` 无 TS 报错。
- 端到端（需要真实 Obsidian + 微信扫码，只能由用户完成）：把仓库软链到某个 vault 的 `.obsidian/plugins/wechat-reader`，启用插件 → 打开微信读书 → 扫码登录 → 点开一本书，确认右侧自动出现书笔记 → 点「同步」看到划线 → 选中文字点「复制」看到摘录追加。可用 obsidian-cli 技能重载插件、截图、查看控制台错误来辅助调试 webview 注入部分。
- 已知风险：`__INITIAL_STATE__` 字段名与复制钩子依赖微信读书前端实现，可能随其改版失效；用 URL 兜底识别 + 剪贴板命令兜底。
