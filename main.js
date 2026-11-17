const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

if (process.env.INVOICE_GEN_USERDATA) app.setPath('userData', process.env.INVOICE_GEN_USERDATA);

// only one copy at a time
if (!app.requestSingleInstanceLock()) app.quit();

/* ---------- backup ---------- */
const SUB = 'Invoice Generator Backup';
const MAIN_FILE = 'invoice-data.json';
const cfgFile = () => path.join(app.getPath('userData'), 'backup-config.json');
const readCfg = () => { try { return JSON.parse(fs.readFileSync(cfgFile(), 'utf8')); } catch { return {}; } };
const writeCfg = c => fs.writeFileSync(cfgFile(), JSON.stringify(c));
const isDir = p => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };

// Google Drive for desktop mounts as "G:\My Drive" (drive letter) or inside the user folder
function findGoogleDrive() {
  const home = os.homedir();
  const cands = [path.join(home, 'My Drive'), path.join(home, 'Google Drive', 'My Drive'), path.join(home, 'Google Drive')];
  for (const L of 'DEFGHIJKLMNOPQRSTUVWXYZ') cands.push(`${L}:\\My Drive`);
  return cands.find(isDir) || null;
}

async function chooseFolder(win) {
  let base = null;
  const drive = findGoogleDrive();
  if (drive) {
    const r = await dialog.showMessageBox(win, {
      type: 'question', title: 'Set up backup', message: 'Google Drive found',
      detail: `Back up automatically to:\n${path.join(drive, SUB)}`,
      buttons: ['Use Google Drive', 'Choose another folder…', 'Cancel'], defaultId: 0, cancelId: 2
    });
    if (r.response === 2) return null;
    if (r.response === 0) base = drive;
  } else {
    await dialog.showMessageBox(win, {
      type: 'info', title: 'Set up backup', message: 'Google Drive folder not found',
      detail: 'Install and sign in to Google Drive for desktop to back up to the cloud, or just pick any folder (for example a USB drive) on the next screen.',
      buttons: ['Choose folder…']
    });
  }
  if (!base) {
    const r = await dialog.showOpenDialog(win, { title: 'Choose a backup folder', properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || !r.filePaths[0]) return null;
    base = r.filePaths[0];
  }
  return path.basename(base) === SUB ? base : path.join(base, SUB);
}

function readExisting(folder) {
  try { return fs.readFileSync(path.join(folder, MAIN_FILE), 'utf8'); } catch { return null; }
}

ipcMain.handle('backup:status', () => ({ folder: readCfg().folder || null }));

ipcMain.handle('backup:read', () => {
  const f = readCfg().folder;
  return f ? readExisting(f) : null;
});

ipcMain.handle('backup:setup', async e => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const folder = await chooseFolder(win);
  if (!folder) return null;
  try { fs.mkdirSync(folder, { recursive: true }); } catch (err) {
    await dialog.showMessageBox(win, { type: 'error', message: 'Could not use that folder', detail: err.message });
    return null;
  }
  writeCfg({ ...readCfg(), folder });
  return { folder, existing: readExisting(folder) };
});

ipcMain.handle('backup:manage', async e => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const folder = readCfg().folder;
  const r = await dialog.showMessageBox(win, {
    type: 'info', title: 'Backup', message: 'Automatic backup is on',
    detail: `Saving to:\n${folder}\n\nA new backup is written every time you change something, plus one dated copy per day (the last 30 days are kept).`,
    buttons: ['Back up now', 'Change folder…', 'Open folder', 'Close'], defaultId: 3, cancelId: 3
  });
  if (r.response === 0) return { action: 'now', folder };
  if (r.response === 2) { shell.openPath(folder); return { action: 'none', folder }; }
  if (r.response === 1) {
    const nf = await chooseFolder(win);
    if (!nf) return { action: 'none', folder };
    try { fs.mkdirSync(nf, { recursive: true }); } catch (err) {
      await dialog.showMessageBox(win, { type: 'error', message: 'Could not use that folder', detail: err.message });
      return { action: 'none', folder };
    }
    writeCfg({ ...readCfg(), folder: nf });
    return { action: 'changed', folder: nf, existing: readExisting(nf) };
  }
  return { action: 'none', folder };
});

ipcMain.handle('backup:write', (e, json) => {
  const folder = readCfg().folder;
  if (!folder) return { ok: false, error: 'No backup folder set' };
  try {
    fs.mkdirSync(folder, { recursive: true });
    const main = path.join(folder, MAIN_FILE);
    fs.writeFileSync(main + '.tmp', json);
    fs.renameSync(main + '.tmp', main);
    const day = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(path.join(folder, `invoice-data-${day}.json`), json);
    fs.readdirSync(folder)
      .filter(f => /^invoice-data-\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .sort().reverse().slice(30)
      .forEach(f => { try { fs.unlinkSync(path.join(folder, f)); } catch {} });
    return { ok: true, time: Date.now() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

/* ---------- window ---------- */
function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    title: 'Invoice Generator',
    autoHideMenuBar: true,
    show: false,
    backgroundColor: '#f3f4f6',
    webPreferences: { contextIsolation: true, nodeIntegration: false, spellcheck: false, preload: path.join(__dirname, 'preload.js') }
  });
  // show once the page has painted, so there's no blank white flash
  win.once('ready-to-show', () => win.show());
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'index.html'));
  // links/popups never open inside the app
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

app.whenReady().then(createWindow);
app.on('second-instance', () => {
  const [w] = BrowserWindow.getAllWindows();
  if (w) { if (w.isMinimized()) w.restore(); w.focus(); }
});
app.on('window-all-closed', () => app.quit());
