const { app, BrowserWindow, ipcMain } = require('electron');
const activeWin = require('active-win');
const path = require('path');

let mainWindow;
let focusTimer = 0;
let isTracking = false;
let monitorInterval;
let ALLOWED_APPS = [];

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 500,
    height: 400,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }
  });

  mainWindow.loadFile('index.html');
}

// 창 감시 핵심 로직
async function startMonitoring() {
  if (monitorInterval) clearInterval(monitorInterval);
  
  monitorInterval = setInterval(async () => {
    if (!isTracking) return;

    const currentApp = await activeWin();
    
    if (currentApp) {
      // 사용자가 입력한 리스트 중 하나라도 프로세스 이름이나 창 제목에 포함되는지 검사
      const isAllowed = ALLOWED_APPS.some(app => 
        currentApp.owner.name.toLowerCase().includes(app.toLowerCase()) ||
        currentApp.title.toLowerCase().includes(app.toLowerCase())
      );

      if (isAllowed) {
        focusTimer++;
        mainWindow.webContents.send('update-timer', focusTimer);
      } else {
        if (focusTimer > 0) {
          isTracking = false;
          const stoppedApp = currentApp.owner.name;
          focusTimer = 0;
          mainWindow.webContents.send('reset-timer', stoppedApp);
        }
      }
    }
  }, 1000);
}

// IPC 통신 설정
ipcMain.on('set-allowed-apps', (event, appList) => {
  ALLOWED_APPS = appList.split(',').map(app => app.trim()).filter(app => app !== "");
  console.log("새로운 허용 앱 리스트:", ALLOWED_APPS);
});

ipcMain.on('start-session', () => {
  isTracking = true;
  focusTimer = 0;
  startMonitoring();
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
