# 番茄钟 (Pomodoro Timer)

基于 Electron 的桌面番茄钟应用，具备计时器、任务管理、历史记录、系统托盘和桌面通知功能。

## 技术栈

- **运行时**: Electron 33
- **前端**: Vanilla HTML/CSS/JS（无框架）
- **IPC**: contextBridge + ipcRenderer/ipcMain（contextIsolation 已启用）
- **数据持久化**: JSON 文件（`pomodoro-data.json` / `pomodoro-config.json`，存储在 `app.getPath('userData')`）

## 项目结构

```
index.html       - 主界面（三页签：计时/任务/历史）
main.js          - Electron 主进程（窗口、托盘、IPC、通知）
preload.js       - 预加载脚本（contextBridge API 暴露）
renderer.js      - 渲染进程逻辑（计时、任务、历史、事件）
styles.css       - 全部样式（深色主题）
tray-icon.png    - 托盘图标（16x16）
```

## 开发命令

```bash
npm start        # 启动应用
npm run lint     # 代码检查
npm run format   # 代码格式化
npm test         # 运行测试
npm run pack     # 本地打包预览
npm run build    # 生产打包分发
```

## 架构约定

- **安全**: contextIsolation: true, nodeIntegration: false，所有 Node 能力通过 preload.js 桥接
- **数据流**: 渲染进程 → `window.electronAPI` → IPC → 主进程 → 文件读写
- **中文 UI**: 所有界面文字默认为中文
- **深色主题**: 仅支持深色模式，不做明暗切换
