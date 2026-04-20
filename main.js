const { app, BrowserWindow, ipcMain } = require('electron');
const activeWin = require('active-win');
const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');

let mainWindow;
let focusTimer = 0;
let isTracking = false;
let monitorInterval;
let ALLOWED_APPS = [];

// 영상 저장 폴더 생성
const videoDir = path.join(app.getPath('userData'), 'study_vlogs');
if (!fs.existsSync(videoDir)) fs.mkdirSync(videoDir);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 600, height: 500,
    frame: false, transparent: true, alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }
  });
  mainWindow.loadFile('index.html');
}

// 창 감시 로직
async function startMonitoring() {
  if (monitorInterval) clearInterval(monitorInterval);
  monitorInterval = setInterval(async () => {
    if (!isTracking) return;

    const currentApp = await activeWin();
    if (currentApp) {
      const isAllowed = ALLOWED_APPS.some(app => 
        currentApp.owner.name.toLowerCase().includes(app.toLowerCase()) ||
        currentApp.title.toLowerCase().includes(app.toLowerCase())
      );

      if (isAllowed) {
        focusTimer++;
        mainWindow.webContents.send('update-timer', focusTimer);
      } else if (focusTimer > 0) {
        isTracking = false;
        const stoppedApp = currentApp.owner.name;
        focusTimer = 0;
        mainWindow.webContents.send('reset-timer', stoppedApp);
      }
    }
  }, 1000);
}

// [2단계 핵심] 영상 조각에 자막 입히기
ipcMain.on('process-clip', (event, { tempPath, date, targetTime, phase }) => {
  const fileName = `clip_${Date.now()}.mp4`;
  const outputPath = path.join(videoDir, fileName);

  ffmpeg(tempPath)
    .videoFilters([
      {
        filter: 'drawtext',
        options: {
          text: `DATE: ${date}  TARGET: ${targetTime}  PHASE: ${phase}`,
          fontcolor: 'white', fontsize: 24,
          box: 1, boxcolor: 'black@0.5',
          x: '(w-text_w)/2', y: 30 // 상단 중앙
        }
      }
    ])
    .output(outputPath)
    .on('end', () => {
      console.log(`성공: ${phase} 영상 저장됨 -> ${outputPath}`);
      // 원본 임시 파일 삭제
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    })
    .on('error', (err) => console.error('FFmpeg 에러:', err))
    .run();
});

ipcMain.on('set-allowed-apps', (event, appList) => {
  ALLOWED_APPS = appList.split(',').map(app => app.trim()).filter(app => app !== "");
});

ipcMain.on('start-session', () => {
  isTracking = true;
  focusTimer = 0;
  startMonitoring();
});

app.whenReady().then(createWindow);
