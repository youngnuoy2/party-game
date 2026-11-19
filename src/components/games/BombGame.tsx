'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { sfx, vibrate } from '@/lib/sound';
import { cx, SecondsLeft, TimerBar } from '../ui';
import type { GameProps } from './common';

type Item = { id: number; kind: 'gift' | 'bomb'; x: number; y: number; lifeMs: number };
type V = { item: Item | null; gifts: number; bombs: number; points: number };

export default function BombGame({ state, me, act, setView }: GameProps) {
  const g = state.game!;
  const v = me.view as V | null;
  const item = v?.item;
  const [flash, setFlash] = useState<'gift' | 'bomb' | null>(null);

  useEffect(() => {
    if (!item) return;
    const t = setTimeout(async () => {
      const r = await act({ type: 'expire', id: item.id });
      if (r.ok) setView(r.data);
    }, item.lifeMs);
    return () => clearTimeout(t);
  }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 300);
    return () => clearTimeout(t);
  }, [flash]);

  const tap = async (e: React.PointerEvent) => {
    e.preventDefault();
    if (!item) return;
    if (item.kind === 'gift') {
      sfx.correct();
      vibrate(15);
    } else {
      sfx.wrong();
      vibrate([80, 40, 120]);
    }
    setFlash(item.kind);
    const r = await act({ type: 'tap', id: item.id });
    if (r.ok) setView(r.data);
  };

  return (
    <div className="flex flex-1 flex-col gap-3 touch-game">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="chip">
            🎁 {v?.gifts ?? 0} <span className="text-white/30">|</span> 💣 {v?.bombs ?? 0}
          </span>
          <SecondsLeft endsAt={g.stepEndsAt} className="font-display text-2xl" />
        </div>
        <TimerBar startedAt={g.stepStartedAt} endsAt={g.stepEndsAt} />
      </div>
      <div className={cx('relative min-h-[60dvh] flex-1 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] transition-colors', flash === 'gift' && 'bg-emerald-500/20', flash === 'bomb' && 'bg-red-600/50')}>
        <AnimatePresence>
          {item && (
            <motion.button
              key={item.id}
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 18 }}
              onPointerDown={tap}
              className="absolute -translate-x-1/2 -translate-y-1/2 text-[5.5rem] leading-none drop-shadow-[0_0_20px_rgba(255,255,255,.5)]"
              style={{ left: `${item.x}%`, top: `${item.y}%` }}
            >
              {item.kind === 'gift' ? '🎁' : '💣'}
            </motion.button>
          )}
        </AnimatePresence>
        {flash === 'bomb' && <div className="pointer-events-none absolute inset-0 flex items-center justify-center font-display text-6xl">💥 펑!</div>}
      </div>
      <p className="text-center text-xs text-white/40">🎁는 터치, 💣는 그냥 두세요! 점점 빨라져요</p>
    </div>
  );
}
