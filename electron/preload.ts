import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { NengyongBotBridge, HarnessEvent } from '../shared/bridge'

// The only surface the page gets: no Node, no raw ipcRenderer.
const bridge: NengyongBotBridge = {
  isMac: process.platform === 'darwin',
  getLanguage: () => ipcRenderer.invoke('nengyongbot:getLanguage'),
  setLanguage: (language) => ipcRenderer.invoke('nengyongbot:setLanguage', language),
  send: (botId, text, attachments, quoteSeq, miniAppId) =>
    ipcRenderer.invoke('nengyongbot:send', botId, text, attachments, quoteSeq, miniAppId),
  // the scheme main.ts serves from the library (ATTACHMENT_SCHEME)
  attachmentUrl: (path) => `nengyongbot-attachment://library/${path.split('/').map(encodeURIComponent).join('/')}`,
  // the scheme main.ts serves mini apps' pages from (MINI_APP_SCHEME); dataAt only makes a new URL once the data changes
  miniAppUrl: (botId, miniAppId, version, dataAt) =>
    `nengyongbot-app://page/${encodeURIComponent(botId)}/${encodeURIComponent(miniAppId)}/${version}?data=${dataAt ?? 0}`,
  askFromMiniApp: (botId, miniAppId, text) => ipcRenderer.invoke('nengyongbot:askFromMiniApp', botId, miniAppId, text),
  saveMiniAppData: (botId, miniAppId, data) =>
    ipcRenderer.invoke('nengyongbot:saveMiniAppData', botId, miniAppId, data),
  restoreMiniApp: (botId, miniAppId, version) =>
    ipcRenderer.invoke('nengyongbot:restoreMiniApp', botId, miniAppId, version),
  deleteMiniApp: (botId, miniAppId) => ipcRenderer.invoke('nengyongbot:deleteMiniApp', botId, miniAppId),
  miniAppHtml: (botId, miniAppId, version) => ipcRenderer.invoke('nengyongbot:miniAppHtml', botId, miniAppId, version),
  history: (botId) => ipcRenderer.invoke('nengyongbot:history', botId),
  deleteMessages: (botId, seqs) => ipcRenderer.invoke('nengyongbot:deleteMessages', botId, seqs),
  previews: () => ipcRenderer.invoke('nengyongbot:previews'),
  panel: (botId) => ipcRenderer.invoke('nengyongbot:panel', botId),
  tasksAndRoutines: () => ipcRenderer.invoke('nengyongbot:tasksAndRoutines'),
  context: (botId) => ipcRenderer.invoke('nengyongbot:context', botId),
  setDebug: (isOn) => ipcRenderer.invoke('nengyongbot:setDebug', isOn),
  setRoutineEnabled: (botId, routineId, isEnabled) =>
    ipcRenderer.invoke('nengyongbot:setRoutineEnabled', botId, routineId, isEnabled),
  openLibraryItem: (path) => ipcRenderer.invoke('nengyongbot:openLibraryItem', path),
  stopReply: (botId, runId) => ipcRenderer.invoke('nengyongbot:stopReply', botId, runId),
  stopTask: (botId, taskId) => ipcRenderer.invoke('nengyongbot:stopTask', botId, taskId),
  answerSkillOffer: (botId, offer, names) => ipcRenderer.invoke('nengyongbot:answerSkillOffer', botId, offer, names),
  uploadSkill: (botId, kind) => ipcRenderer.invoke('nengyongbot:uploadSkill', botId, kind),
  answerSkillUpload: (botId, offer, names) => ipcRenderer.invoke('nengyongbot:answerSkillUpload', botId, offer, names),
  removeSkills: (botId, names) => ipcRenderer.invoke('nengyongbot:removeSkills', botId, names),
  skillFiles: (ref) => ipcRenderer.invoke('nengyongbot:skillFiles', ref),
  skillFile: (ref, path) => ipcRenderer.invoke('nengyongbot:skillFile', ref, path),
  revealSkill: (botId, name) => ipcRenderer.invoke('nengyongbot:revealSkill', botId, name),
  getSidebar: () => ipcRenderer.invoke('nengyongbot:getSidebar'),
  needsOnboarding: () => ipcRenderer.invoke('nengyongbot:needsOnboarding'),
  saveSidebar: (sidebar) => ipcRenderer.invoke('nengyongbot:saveSidebar', sidebar),
  getDataDir: () => ipcRenderer.invoke('nengyongbot:getDataDir'),
  openDataDir: () => ipcRenderer.invoke('nengyongbot:openDataDir'),
  moveDataDir: () => ipcRenderer.invoke('nengyongbot:moveDataDir'),
  exportData: () => ipcRenderer.invoke('nengyongbot:exportData'),
  importData: () => ipcRenderer.invoke('nengyongbot:importData'),
  getModelServices: () => ipcRenderer.invoke('nengyongbot:getModelServices'),
  listModels: (accountId) => ipcRenderer.invoke('nengyongbot:listModels', accountId),
  saveAccount: (input, use) => ipcRenderer.invoke('nengyongbot:saveAccount', input, use),
  removeAccount: (accountId) => ipcRenderer.invoke('nengyongbot:removeAccount', accountId),
  setChatModel: (choice) => ipcRenderer.invoke('nengyongbot:setChatModel', choice),
  setSearchAccount: (accountId) => ipcRenderer.invoke('nengyongbot:setSearchAccount', accountId),
  getMcpConfig: () => ipcRenderer.invoke('nengyongbot:getMcpConfig'),
  setMcpConfig: (text) => ipcRenderer.invoke('nengyongbot:setMcpConfig', text),
  getLimits: () => ipcRenderer.invoke('nengyongbot:getLimits'),
  setLimits: (limits) => ipcRenderer.invoke('nengyongbot:setLimits', limits),
  usage: () => ipcRenderer.invoke('nengyongbot:usage'),
  setModelPrice: (model, price) => ipcRenderer.invoke('nengyongbot:setModelPrice', model, price),
  onboard: (choices) => ipcRenderer.invoke('nengyongbot:onboard', choices),
  getDevices: () => ipcRenderer.invoke('nengyongbot:getDevices'),
  setLanAccess: (isOn) => ipcRenderer.invoke('nengyongbot:setLanAccess', isOn),
  removeDevice: (deviceId) => ipcRenderer.invoke('nengyongbot:removeDevice', deviceId),
  answerPairing: (requestId, code) => ipcRenderer.invoke('nengyongbot:answerPairing', requestId, code),
  checkForUpdate: () => ipcRenderer.invoke('nengyongbot:checkForUpdate'),
  installUpdate: () => ipcRenderer.invoke('nengyongbot:installUpdate'),
  onEvent: (cb) => {
    const listener = (_e: IpcRendererEvent, event: HarnessEvent) => cb(event)
    ipcRenderer.on('nengyongbot:event', listener)
    return () => ipcRenderer.removeListener('nengyongbot:event', listener)
  },
}

contextBridge.exposeInMainWorld('nengyongbot', bridge)
