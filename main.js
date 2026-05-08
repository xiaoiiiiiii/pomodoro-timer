const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  Notification,
  nativeImage,
  dialog
} = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let tray;
let isQuitting = false;

const dataPath = path.join(app.getPath('userData'), 'pomodoro-data.json');
const configPath = path.join(app.getPath('userData'), 'pomodoro-config.json');

function loadData() {
  try {
    if (fs.existsSync(dataPath)) {
      return JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
    }
  } catch (_e) {
    /* ignore */
  }
  return { history: [], tasks: [] };
}

function saveData(data) {
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
}

function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch (_e) {
    /* ignore */
  }
  return {};
}

function saveConfig(config) {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

async function handleClose(e) {
  if (isQuitting) return;

  const config = loadConfig();
  const action = config.closeAction;

  if (action === 'quit') {
    isQuitting = true;
    app.quit();
    return;
  }

  if (action === 'tray') {
    e.preventDefault();
    mainWindow.hide();
    return;
  }

  // No preference saved — ask the user
  e.preventDefault();
  const { response, checkboxChecked } = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    title: '番茄钟',
    message: '关闭窗口',
    detail: '请选择关闭行为：',
    buttons: ['最小化到托盘', '退出程序'],
    defaultId: 0,
    cancelId: 0,
    checkboxLabel: '记住我的选择，不再询问',
    checkboxChecked: false
  });

  if (response === 1) {
    // 退出程序
    isQuitting = true;
    app.quit();
  } else {
    // 最小化到托盘
    mainWindow.hide();
  }

  if (checkboxChecked) {
    config.closeAction = response === 1 ? 'quit' : 'tray';
    saveConfig(config);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 710,
    resizable: true,
    alwaysOnTop: true,
    title: '番茄钟',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('index.html');
  mainWindow.setMenuBarVisibility(false);

  mainWindow.on('close', (e) => {
    handleClose(e);
  });
}

function createTray() {
  const trayIconPath = path.join(__dirname, 'tray-icon.png');
  const icon = nativeImage.createFromPath(trayIconPath);
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示窗口',
      click: () => {
        mainWindow.show();
        mainWindow.focus();
      }
    },
    {
      label: '开始 / 暂停',
      click: () => mainWindow.webContents.send('tray-toggle')
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('番茄钟');
  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    mainWindow.show();
    mainWindow.focus();
  });
}

// IPC handlers
ipcMain.handle('get-data', () => loadData());
ipcMain.handle('get-config', () => loadConfig());

ipcMain.handle('save-data', (_event, data) => {
  saveData(data);
  return true;
});

ipcMain.handle('save-config', (_event, config) => {
  saveConfig(config);
  return true;
});

ipcMain.handle('reset-close-action', () => {
  const config = loadConfig();
  delete config.closeAction;
  saveConfig(config);
  return true;
});

ipcMain.handle('send-notification', (_event, { title, body }) => {
  if (Notification.isSupported()) {
    const notification = new Notification({ title, body, silent: false });
    notification.show();
  }
  return true;
});

ipcMain.handle('set-always-on-top', (_event, flag) => {
  if (mainWindow) {
    mainWindow.setAlwaysOnTop(flag);
  }
  return true;
});

ipcMain.handle('update-tray-tooltip', (_event, text) => {
  if (tray) {
    tray.setToolTip(text);
  }
  return true;
});

app.whenReady().then(() => {
  createWindow();
  createTray();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
});
