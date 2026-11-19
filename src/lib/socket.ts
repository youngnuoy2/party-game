'use client';
import { io, type Socket } from 'socket.io-client';
import type { Ack } from '@/shared/types';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io({
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 3000,
    });
  }
  return socket;
}

export function emitAck<T = any>(ev: string, data?: unknown, timeoutMs = 8000): Promise<Ack<T>> {
  const s = getSocket();
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve({ ok: false, error: '서버 응답이 없습니다. 네트워크를 확인해 주세요' }), timeoutMs);
    s.emit(ev, data, (res: Ack<T>) => {
      clearTimeout(t);
      resolve(res);
    });
  });
}

// ─────────── 서버 시계 동기화 ───────────
// NTP 방식: 여러 번 왕복 측정 후 RTT 가 가장 짧은 표본으로 오프셋 계산
let offset = 0;
let synced = false;

export const serverNow = () => Date.now() + offset;
export const isSynced = () => synced;

export async function syncClock(samples = 6) {
  const results: { rtt: number; off: number }[] = [];
  for (let i = 0; i < samples; i++) {
    const t0 = Date.now();
    const r = await emitAck<number>('time:ping', null, 3000);
    const t1 = Date.now();
    if (r.ok && typeof r.data === 'number') results.push({ rtt: t1 - t0, off: r.data - (t0 + t1) / 2 });
    await new Promise((res) => setTimeout(res, 60));
  }
  if (!results.length) return;
  results.sort((a, b) => a.rtt - b.rtt);
  offset = results[0].off;
  synced = true;
}

let syncStarted = false;
export function startClockSync() {
  if (syncStarted) return;
  syncStarted = true;
  const s = getSocket();
  const run = () => syncClock().catch(() => {});
  if (s.connected) run();
  s.on('connect', run);
  setInterval(run, 30_000);
}
