'use client';
import { useEffect, useState } from 'react';
import { serverNow } from './socket';

/** 서버 기준 현재 시각을 interval 마다 갱신 */
export function useServerNow(intervalMs = 100) {
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    const t = setInterval(() => setNow(serverNow()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** 마감 시각까지 남은 ms (일시정지 중이면 고정값) */
export function useRemaining(endsAt: number | null | undefined, pausedRemain?: number | null, intervalMs = 100) {
  const now = useServerNow(intervalMs);
  if (pausedRemain != null) return Math.max(0, pausedRemain);
  if (!endsAt) return 0;
  return Math.max(0, endsAt - now);
}
