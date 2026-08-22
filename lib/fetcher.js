// 多平台价格抓取 — 纯 Node.js 内置模块
const https = require('https');
const http = require('http');
const { nextRedirect } = require('./net-policy');
const { sanitizeNumber, sanitizeName } = require('./validate');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function fetch(url, options = {}, hops = 0) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { headers: { 'User-Agent': USER_AGENT, ...options.headers }, timeout: 10000 }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const verdict = nextRedirect(res.headers.location, url, hops);
          if (!verdict.ok) return reject(new Error('redirect refused: ' + verdict.reason));
          return fetch(verdict.url, options, hops + 1).then(resolve).catch(reject);
        }
        resolve({ status: res.statusCode, body, headers: res.headers });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')); });
  });
}

// ====== Steam 市场 ======

async function getSteamPrice(marketHashName) {
  try {
    const encoded = encodeURIComponent(marketHashName);
    const url = "https://steamcommunity.com/market/priceoverview/?appid=730&currency=23&market_hash_name=" + encoded;
    const { body } = await fetch(url);
    const data = JSON.parse(body);
    if (!data || !data.success) return null;
    return {
      lowest: sanitizeNumber(data.lowest_price),
      median: sanitizeNumber(data.median_price),
      volume: sanitizeNumber(data.volume) || 0,
    };
  } catch (e) { console.error('[fetcher] steam failed: ' + e.message); return null; }
}

// ====== Buff163 ======

async function getBuffPrice(skinName) {
  try {
    const encoded = encodeURIComponent(skinName);
    const url = "https://buff.163.com/api/market/goods?game=csgo&page_num=1&page_size=5&search=" + encoded;
    const { body } = await fetch(url, {
      headers: { 'Accept': 'application/json', 'Referer': 'https://buff.163.com/' }
    });
    const data = JSON.parse(body);
    if (data.code !== 'OK' || !data.data || !data.data.items) return null;
    // 找最匹配的
    const items = data.data.items.filter(i => i.name === skinName);
    const item = items[0] || data.data.items[0];
    if (!item) return null;
    return {
      name: sanitizeName(item.name),
      minPrice: sanitizeNumber(item.sell_min_price != null ? item.sell_min_price : item.price),
      steamPrice: sanitizeNumber(item.steam_price_cny),
      volume: sanitizeNumber(item.sell_num) || 0,
      goodsId: item.id,
      icon: item.goods_info?.icon_url || ''
    };
  } catch (e) { console.error('[fetcher] buff failed: ' + e.message); return null; }
}

// 获取详细挂售列表
async function getBuffSellOrders(goodsId) {
  try {
    const url = "https://buff.163.com/api/market/goods/sell_order?game=csgo&goods_id=" + goodsId + "&page_num=1&page_size=10";
    const { body } = await fetch(url, {
      headers: { 'Accept': 'application/json', 'Referer': 'https://buff.163.com/' }
    });
    const data = JSON.parse(body);
    if (data.code !== 'OK' || !data.data) return [];
    return (data.data.items || []).map(i => ({ price: sanitizeNumber(i.price), wear: i.asset_info?.paintwear, stickers: i.asset_info?.stickers?.length || 0 }));
  } catch (e) { console.error('[fetcher] buff sell orders failed: ' + e.message); return []; }
}

// ====== 悠悠有品 ======

async function getYoupinPrice(skinName) {
  try {
    const encoded = encodeURIComponent(skinName);
    const url = "https://www.youpin898.com/api/search/goods?gameId=730&key=" + encoded + "&page=1&pageSize=5";
    const { body } = await fetch(url, {
      headers: { 'Accept': 'application/json', 'Referer': 'https://www.youpin898.com/' }
    });
    const data = JSON.parse(body);
    if (data.code !== 0 || !data.data || !data.data.list) return null;
    const items = data.data.list.filter(i => i.name === skinName);
    const item = items[0] || data.data.list[0];
    if (!item) return null;
    return { name: sanitizeName(item.name), minPrice: sanitizeNumber(item.price != null ? item.price : item.minPrice), volume: sanitizeNumber(item.onSaleCount) || 0 };
  } catch (e) { console.error('[fetcher] youpin failed: ' + e.message); return null; }
}

// ====== 汇总查询 ======

async function getAllPrices(skinName) {
  const [steam, buff, youpin] = await Promise.all([
    getSteamPrice(skinName),
    getBuffPrice(skinName),
    getYoupinPrice(skinName)
  ]);
  return { steam, buff, youpin, time: new Date().toISOString() };
}

// ====== 批量监控 ======

async function checkWatchlist(skins) {
  const results = {};
  for (const name of skins) {
    try {
      results[name] = await getAllPrices(name);
    } catch (e) {
      results[name] = { error: e.message };
    }
    // Steam 有频率限制，间隔一下
    await new Promise(r => setTimeout(r, 500));
  }
  return results;
}

module.exports = { getSteamPrice, getBuffPrice, getYoupinPrice, getAllPrices, checkWatchlist };
