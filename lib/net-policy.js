// 网络策略 — 重定向与主机白名单(纯函数,便于测试)
// 修复审计发现 F1:重定向跟随无深度限制、不校验协议/主机
const ALLOWED_HOSTS = new Set([
  'steamcommunity.com',
  'www.steamcommunity.com',
  'buff.163.com',
  'www.buff.163.com',
  'youpin898.com',
  'www.youpin898.com',
]);

function hostAllowed(hostname) {
  return ALLOWED_HOSTS.has(String(hostname || '').toLowerCase());
}

// 判断是否允许跟随重定向。
// 返回 { ok: true, url } 或 { ok: false, reason }
function nextRedirect(location, currentUrl, hops, maxHops) {
  maxHops = maxHops == null ? 5 : maxHops;
  if (hops >= maxHops) {
    return { ok: false, reason: 'too many redirects (>=' + maxHops + ')' };
  }
  let target;
  try {
    target = new URL(location, currentUrl);
  } catch (e) {
    return { ok: false, reason: 'invalid redirect location' };
  }
  if (target.protocol !== 'https:') {
    return { ok: false, reason: 'redirect refuses non-HTTPS target: ' + target.protocol };
  }
  if (!hostAllowed(target.hostname)) {
    return { ok: false, reason: 'redirect refuses non-whitelisted host: ' + target.hostname };
  }
  return { ok: true, url: target.toString() };
}

module.exports = { ALLOWED_HOSTS, hostAllowed, nextRedirect };
