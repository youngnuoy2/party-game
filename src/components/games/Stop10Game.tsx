'use client';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { serverNow } from '@/lib/socket';
import { sfx, vibrate } from '@/lib/sound';
import { useServerNow } from '@/lib/useNow';
import { cx } from '../ui';
import type { GameProps } from './common';

export default function Stop10Game({ state, me, act, setView }: GameProps) {
  const g = state.game!;
  const pl = g.payload as { target: number; visibleMs: number };
  const v = me.view as { pressed: number | null; error: number | null } | null;
  const now = useServerNow(30);
  const [busy, setBusy] = useState(false);
  const elapsed = Math.max(0, now - g.stepStartedAt);
  const visible = elapsed < pl.visibleMs;
  const pressed = v?.pressed ?? null;

  const stop = async () => {
    if (busy || pressed !== null) return;
    const e = serverNow() - g.stepStartedAt; // 누른 순간의 경과시간 (서버 시계 기준)
    setBusy(true);
    vibrate(40);
    sfx.go();
    const r = await act({ type: 'stop', elapsed: e });
    setBusy(false);
    if (r.ok) setView(r.data);
  };

  return (
    <div className="flex flex-1 flex-col items-center gap-6 touch-game">
      <div className="text-center text-white/70">정확히 <b className="text-amber-200">10.00초</b>라고 생각될 때 누르세요!</div>
      <div className="card flex w-full flex-col items-center p-6">
        <div className={cx('font-display tabular-nums', pressed !== null ? 'text-6xl text-sky-300' : 'text-7xl')}>
          {pressed !== null ? `${(pressed / 1000).toFixed(2)}초` : visible ? (elapsed / 1000).toFixed(2) : '??.??'}
        </div>
        {pressed === null && !visible && <div className="mt-2 text-white/50">타이머가 숨겨졌어요... 마음속으로 세어 보세요</div>}
        {pressed !== null && v?.error != null && (
          <div className="mt-2 text-xl">
            오차 <b className={v.error < 300 ? 'text-emerald-300' : v.error < 1000 ? 'text-amber-200' : 'text-rose-300'}>{(v.error / 1000).toFixed(2)}초</b>
          </div>
        )}
      </div>
      <motion.button
        whileTap={{ scale: 0.92 }}
        onPointerDown={(e) => {
          e.preventDefault();
          stop();
        }}
        disabled={pressed !== null || busy}
        className="flex h-60 w-60 items-center justify-center rounded-full font-display text-6xl text-white shadow-[0_0_60px_rgba(34,197,94,.6)] disabled:opacity-40"
        style={{ background: 'radial-gradient(circle at 35% 30%, #86efac, #16a34a 55%, #14532d)' }}
      >
        {pressed !== null ? '완료' : 'STOP'}
      </motion.button>
      <p className="text-sm text-white/40">기회는 단 한 번! 모두 누르면 바로 결과 집계</p>
    </div>
  );
}
