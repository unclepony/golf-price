import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

export function writeText(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text, 'utf8');
}

export function loadConfig() {
  return readJson(join(ROOT, 'config', 'products.json'));
}

export function loadLinks() {
  const links = readJson(join(ROOT, 'config', 'links.json'), {});
  return Object.fromEntries(
    Object.entries(links).filter(([k, v]) => !k.startsWith('_') && typeof v === 'string' && v.startsWith('https://')),
  );
}

export function historyDir(demo) {
  return join(ROOT, demo ? 'data-demo' : 'data', 'history');
}

// 한국 시간 기준 날짜 (YYYY-MM-DD)
export function todayKst(offsetDays = 0) {
  // 시험용: TODAY_OVERRIDE=YYYY-MM-DD 로 오늘 날짜를 바꿔 빌드할 수 있다
  if (process.env.TODAY_OVERRIDE) return new Date(Date.parse(process.env.TODAY_OVERRIDE) + offsetDays * 86400e3).toISOString().slice(0, 10);
  return new Date(Date.now() + 9 * 3600e3 + offsetDays * 86400e3).toISOString().slice(0, 10);
}

// 제목 비교용: 태그 제거, 소문자, 공백·하이픈 제거
export function normalize(s) {
  return String(s).replace(/<[^>]+>/g, '').toLowerCase().replace(/[\s\-_·.]/g, '');
}

export function stripTags(s) {
  return String(s)
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}
