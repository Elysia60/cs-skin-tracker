// 本地 JSON 数据库 — 无需任何第三方依赖
const fs = require('fs');
const path = require('path');
const { sanitizeNumber } = require('./validate');

const DATA_DIR = path.join(__dirname, '..', 'data');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJSON(file) {
  ensureDir();
  const filepath = path.join(DATA_DIR, file);
  if (!fs.existsSync(filepath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
  } catch (e) {
    // 修复 F4:数据文件损坏时先备份再重置,而不是静默清零历史
    const backup = filepath + '.corrupt-' + Date.now();
    try { fs.renameSync(filepath, backup); console.warn('[db] ' + file + ' 解析失败,已备份到 ' + path.basename(backup)); }
    catch (e2) { console.error('[db] ' + file + ' 解析失败且备份失败: ' + e2.message); }
    return {};
  }
}

function writeJSON(file, data) {
  ensureDir();
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));
}

// ====== 持仓管理 ======

function loadPositions() {
  return readJSON('positions.json');
}

function savePositions(positions) {
  writeJSON('positions.json', positions);
}

// 买入记录
function buyItem(name, buyPrice, platform, date) {
  const positions = loadPositions();
  const id = name + '_' + Date.now();
  positions[id] = { name, buyPrice, platform, buyDate: date || new Date().toISOString(), sold: false };
  savePositions(positions);
  return id;
}

// 卖出记录
function sellItem(id, sellPrice, date) {
  const positions = loadPositions();
  if (!positions[id]) return null;
  positions[id].sold = true;
  positions[id].sellPrice = sellPrice;
  positions[id].sellDate = date || new Date().toISOString();
  positions[id].profit = (sellPrice - positions[id].buyPrice).toFixed(2);
  savePositions(positions);
  return positions[id];
}

// ====== 价格历史 ======

function savePrice(skinName, steamPrice, buffPrice, youpinPrice) {
  const history = readJSON('price_history.json');
  if (!history[skinName]) history[skinName] = [];
  // 修复 F2:入库前全部过数字清洗,脏数据归 null
  const clean = {
    steam: sanitizeNumber(steamPrice),
    buff: sanitizeNumber(buffPrice),
    youpin: sanitizeNumber(youpinPrice),
  };
  const last = history[skinName][history[skinName].length - 1];
  // 修复 F2:与上一条偏差 >50% 视为可疑数据,告警但保留(由人判断)
  for (const k of ['steam', 'buff', 'youpin']) {
    if (clean[k] && last && last[k] && Math.abs(clean[k] - last[k]) / last[k] > 0.5) {
      console.warn('[db] 可疑价格偏差 ' + skinName + ' ' + k + ': ' + last[k] + ' -> ' + clean[k] + ' (已记录,请核实来源)');
    }
  }
  history[skinName].push({ time: new Date().toISOString(), ...clean });
  // 只保留最近 200 条
  if (history[skinName].length > 200) history[skinName] = history[skinName].slice(-200);
  writeJSON('price_history.json', history);
}

function getPriceHistory(skinName) {
  const history = readJSON('price_history.json');
  return history[skinName] || [];
}

// ====== 告警设置 ======

function loadAlerts() {
  return readJSON('alerts.json');
}

function setAlert(skinName, thresholdPrice, direction) {
  const alerts = loadAlerts();
  const id = skinName + '_' + direction;
  alerts[id] = { skinName, thresholdPrice, direction, active: true, createdAt: new Date().toISOString() };
  writeJSON('alerts.json', alerts);
  return id;
}

function getAllAlerts() {
  return Object.values(loadAlerts()).filter(a => a.active);
}

// ====== 盈亏统计 ======

function getStats() {
  const positions = loadPositions();
  const sold = Object.values(positions).filter(p => p.sold);
  const holding = Object.values(positions).filter(p => !p.sold);
  let totalProfit = 0, totalCost = 0;
  sold.forEach(p => { totalProfit += parseFloat(p.profit || 0); totalCost += parseFloat(p.buyPrice); });
  return {
    totalTrades: sold.length,
    totalProfit: totalProfit.toFixed(2),
    totalCost: totalCost.toFixed(2),
    roi: totalCost > 0 ? ((totalProfit / totalCost) * 100).toFixed(2) + '%' : '0%',
    holding: holding.length,
    holdingValue: holding.reduce((s, p) => s + parseFloat(p.buyPrice), 0).toFixed(2)
  };
}

module.exports = { buyItem, sellItem, loadPositions, savePositions, savePrice, getPriceHistory, setAlert, getAllAlerts, getStats };
