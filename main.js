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
let currentSessionClips = []; // 현재 세션에서 생성된 영상 파일 경로들

const videoDir = path.join(app.getPath('userData'), 'study_vlogs');
if (!fs.existsSync(videoDir)) fs.mkdirSync(videoDir);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 700, height: 600,
    frame: false, transparent: true, alwaysOnTop: true,
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  });
  mainWindow.loadFile('index.html');
}

// 1. 자막 입히기 및 조각 저장
ipcMain.on('process-clip', (event, { tempPath, date, targetTime, phase }) => {
  const fileName = `clip_${phase}_${Date.now()}.mp4`;
  const outputPath = path.join(videoDir, fileName);

  ffmpeg(tempPath)
    .videoFilters([
      {
        filter: 'drawtext',
        options: {
          text: `DATE: ${date} | TARGET: ${targetTime} | PHASE: ${phase}`,
          fontcolor: 'white', fontsize: 24, box: 1, boxcolor: 'black@0.5',
          x: '(w-text_w)/2', y: 40
        }
      }
    ])
    .output(outputPath)
    .on('end', () => {
      currentSessionClips.push(outputPath);
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      console.log(`조각 생성 완료: ${phase}`);
    })
    .run();
});

// 2. 최종 병합 (브이로그 완성)
ipcMain.on('merge-vlogs', () => {
  if (currentSessionClips.length < 2) return;

  const finalPath = path.join(videoDir, `VLOG_${Date.now()}.mp4`);
  let mergeCommand = ffmpeg();

  currentSessionClips.forEach(clip => { mergeCommand = mergeCommand.input(clip); });

  mergeCommand
    .on('end', () => {
      console.log('최종 브이로그 완성:', finalPath);
      currentSessionClips = []; // 리스트 초기화
    })
    .mergeToFile(finalPath, app.getPath('temp'));
});

// 기존 감시 로직
ipcMain.on('set-allowed-apps', (event, appList) => {
  ALLOWED_APPS = appList.split(',').map(app => app.trim()).filter(app => app !== "");
});

ipcMain.on('start-session', () => {
  isTracking = true;
  focusTimer = 0;
  currentSessionClips = []; 
  if (!monitorInterval) {
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
          mainWindow.webContents.send('reset-timer', currentApp.owner.name);
          focusTimer = 0;
        }
      }
    }, 1000);
  }
});

app.whenReady().then(createWindow);
