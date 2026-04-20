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
let currentSessionClips = [];

// 저장 경로 설정
const videoDir = path.join(app.getPath('userData'), 'study_vlogs');
if (!fs.existsSync(videoDir)) fs.mkdirSync(videoDir, { recursive: true });

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800, height: 600,
    frame: false, transparent: true, alwaysOnTop: true,
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  });
  mainWindow.loadFile('index.html');
}

// 영상 처리 (자막 입히기)
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
    })
    .on('error', (err) => console.error('FFmpeg Clip Error:', err))
    .run();
});

// 최종 병합
ipcMain.on('merge-vlogs', () => {
  if (currentSessionClips.length === 0) return;
  const finalPath = path.join(videoDir, `VLOG_${Date.now()}.mp4`);
  let mergeCommand = ffmpeg();
  currentSessionClips.forEach(clip => { if(fs.existsSync(clip)) mergeCommand.input(clip); });

  mergeCommand
    .on('end', () => { 
        console.log('Vlog Completed:', finalPath);
        currentSessionClips = [];
    })
    .on('error', (err) => console.error('Merge Error:', err))
    .mergeToFile(finalPath, app.getPath('temp'));
});

ipcMain.on('set-config', (event, appList) => {
  ALLOWED_APPS = appList.split(',').map(app => app.trim()).filter(app => app !== "");
});

ipcMain.on('start-session', () => {
  isTracking = true;
  focusTimer = 0;
  currentSessionClips = [];
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
        mainWindow.webContents.send('reset-timer', currentApp.owner.name);
        focusTimer = 0;
      }
    }
  }, 1000);
});

app.whenReady().then(createWindow);
