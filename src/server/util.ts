import { randomBytes, randomInt, timingSafeEqual } from 'crypto';

export const rand = (min: number, max: number) => randomInt(min, max + 1); // 양 끝 포함

export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const pick = <T>(arr: readonly T[]): T => arr[randomInt(0, arr.length)];

export const token = (bytes = 24) => randomBytes(bytes).toString('base64url');

export function newId(prefix: string) {
  return `${prefix}_${randomBytes(6).toString('base64url')}`;
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function roomCode(len = 4) {
  let s = '';
  for (let i = 0; i < len; i++) s += CODE_CHARS[randomInt(0, CODE_CHARS.length)];
  return s;
}

export function safeEqual(a: string, b: string) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
