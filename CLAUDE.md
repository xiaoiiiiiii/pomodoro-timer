# 番茄钟 (Pomodoro Timer)

基于 Electron 的桌面番茄钟应用，具备计时器、任务管理、历史记录、系统托盘和桌面通知功能。

## 开发命令

```bash
npm start        # 启动应用
npm run lint     # 代码检查 (ESLint)
npm run format   # 代码格式化 (Prettier)
npm test         # 运行测试 (Vitest, globals: true)
npm run pack     # 本地打包预览（输出到 dist/）
npm run build    # 生产打包分发（NSIS + portable, x64）
```

## 技术栈

- **运行时**: Electron 33
- **前端**: Vanilla HTML/CSS/JS（无框架）
- **IPC**: contextBridge + ipcRenderer/ipcMain（contextIsolation 已启用）
- **数据持久化**: JSON 文件（`pomodoro-data.json` / `pomodoro-config.json`，存储在 `app.getPath('userData')`）
- **测试框架**: Vitest（`globals: true`，无需在测试文件中 import describe/expect/it）

## 项目结构

```
main.js              - Electron 主进程（窗口、托盘、IPC handlers、通知）
preload.js           - contextBridge API 暴露（8 个 invoke + 1 个 on）
renderer.js          - 渲染进程主逻辑（~700 行，十部分：DOM引用/状态/UI更新/计时核心/任务/历史/事件/关闭行为/工具函数/初始化）
timer-logic.js       - 纯函数模块（IIFE），被 renderer.js（内联副本）和 tests/ 共用
index.html           - 主界面（三页签：计时/任务/历史）
styles.css           - 全部样式（深色主题）
tests/timer.test.js  - timer-logic.js 的单元测试
vitest.config.js     - Vitest 配置
```

`renderer.js` 中的 `escapeHtml` 与 `timer-logic.js` 中的实现不同（前者用 DOM API，后者用正则），功能等价但维护时需同步修改。

## 架构细节

- **数据流**: 渲染进程 → `window.electronAPI`（preload 暴露）→ IPC invoke → 主进程 handler → JSON 文件读写
- **IPC 通道**（8 个 invoke + 1 个 on）:
  - `get-data` / `save-data` — 任务+历史数据
  - `get-config` / `save-config` / `reset-close-action` — 用户偏好
  - `send-notification` / `set-always-on-top` / `update-tray-tooltip` — 窗口/通知控制
  - `tray-toggle`（主→渲染，单向）— 托盘菜单开始/暂停
- **渲染进程状态管理**: `state` 对象是单一状态源，包含计时器状态、任务列表、历史记录
- **事件委托**: 任务列表的 checkbox/删除按钮通过 `data-idx` 属性 + 事件委托处理，不绑定独立监听器
- **托盘 tooltip**: 每 30 秒更新一次（`tickCount % 30`），避免频繁 IPC 调用
- **关闭行为**: 主进程 `handleClose` 三路分支——询问对话框（含"记住选择"复选框）/ 最小化到托盘 / 直接退出，偏好存入 config
- **键盘快捷键**: 空格（开始/暂停）、R（重置）、S（跳过），仅在非 `<input>` 焦点时生效
- **中文 UI**: 所有界面文字默认中文（见 `.cursor/rules/chinese-language.mdc`）
- **深色主题**: 仅支持深色模式，不做明暗切换
