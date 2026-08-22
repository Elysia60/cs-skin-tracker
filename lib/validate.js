// 输入清洗与校验 — 外部数据进入程序的所有边界都要过这里
// 修复审计发现 F2(无类型校验)与 F3(终端 ANSI 注入)
const ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]/g;

function stripANSI(s) {
  return String(s == null ? '' : s).replace(ANSI_RE, '');
}

// 数字清洗:接受 number 或带货币符号/千分位的字符串;NaN/越界返回 null
function sanitizeNumber(v, opts) {
  opts = opts || {};
  const min = opts.min == null ? 0 : opts.min;
  const max = opts.max == null ? 1e9 : opts.max;
  let n;
  if (typeof v === 'number') {
    n = v;
  } else {
    n = parseFloat(stripANSI(String(v)).replace(/[^\d.]/g, ''));
  }
  if (!isFinite(n) || n < min || n > max) return null;
  return n;
}

// 名称清洗:去 ANSI/首尾空白,限长防滥用
function sanitizeName(s, maxLen) {
  maxLen = maxLen == null ? 200 : maxLen;
  const clean = stripANSI(s).trim();
  return clean.length > maxLen ? clean.slice(0, maxLen) : clean;
}

module.exports = { stripANSI, sanitizeNumber, sanitizeName };
