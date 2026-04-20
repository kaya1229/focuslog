const { app, BrowserWindow, ipcMain } = require('electron');
const activeWin = require('active-win');
const path = require('path');

let mainWindow;
let focusTimer = 0;
let isTracking = false;
let monitorInterval;

// 감시할 앱 리스트 (프로세스 이름 기준)
const ALLOWED_APPS = ["Code", "Notion", "Obsidian", "chrome"]; 

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 450,
    height: 350,
    frame: false,          // 빔프로젝터 컨셉을 위해 상단바 제거
    transparent: true,     // 배경 투명 설정
    alwaysOnTop: true,     // 집중을 위해 항상 위에 기록
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }
  });

  mainWindow.loadFile('index.html');
}

// 1초마다 실행되는 감시 함수
async function startMonitoring() {
  monitorInterval = setInterval(async () => {
    if (!isTracking) return;

    const currentApp = await activeWin();
    
    if (currentApp) {
      // 허용된 앱 중 하나라도 포함되어 있는지 확인
      const isAllowed = ALLOWED_APPS.some(app => 
        currentApp.owner.name.toLowerCase().includes(app.toLowerCase())
      );

      if (isAllowed) {
        focusTimer++;
        mainWindow.webContents.send('update-timer', focusTimer);
      } else {
        // 허용되지 않은 앱 사용 시 리셋
        if (focusTimer > 0) {
          focusTimer = 0;
          isTracking = false; // 리셋 시 잠시 멈춤 (사용자 재시작 유도)
          mainWindow.webContents.send('reset-timer', currentApp.owner.name);
          console.log(`[경고] ${currentApp.owner.name} 감지됨. 초기화.`);
        }
      }
    }
  }, 1000);
}

// IPC 통신: UI에서 시작 버튼 클릭 시
ipcMain.on('start-session', () => {
  isTracking = true;
  focusTimer = 0;
  if (!monitorInterval) startMonitoring();
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
