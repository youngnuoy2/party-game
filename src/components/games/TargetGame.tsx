'use client';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { sfx, vibrate } from '@/lib/sound';
import { cx, SecondsLeft, TimerBar } from '../ui';
import type { GameProps } from './common';

type T = { id: number; x1: number; y1: number; x2: number; y2: number; size: number; lifeMs: number };
type V = { t: T | null; hits: number; misses: number; points: number; level: number };

export default function TargetGame({ state, me, act, setView }: GameProps) {
  const g = state.game!;
  const v = me.view as V | null;
  const [flash, setFlash] = useState<'hit' | 'miss' | null>(null);
  const t = v?.t;

  // 과녁 수명이 끝나면 다음 과녁 요청
  useEffect(() => {
    if (!t) return;
    const timer = setTimeout(async () => {
      const r = await act({ type: 'expire', id: t.id });
      if (r.ok) setView(r.data);
    }, t.lifeMs);
    return () => clearTimeout(timer);
  }, [t?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!flash) return;
    const x = setTimeout(() => setFlash(null), 250);
    return () => clearTimeout(x);
  }, [flash]);

  const hit = async (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!t) return;
    sfx.correct();
    vibrate(20);
    setFlash('hit');
    const r = await act({ type: 'hit', id: t.id });
    if (r.ok) setView(r.data);
  };
  const miss = async () => {
    sfx.wrong();
    vibrate(40);
    setFlash('miss');
    const r = await act({ type: 'miss' });
    if (r.ok) setView(r.data);
  };

  return (
    <div className="flex flex-1 flex-col gap-3 touch-game">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="chip">🎯 {v?.hits ?? 0}회 명중 · 빗나감 {v?.misses ?? 0}</span>
          <span className="chip">Lv.{(v?.level ?? 0) + 1}</span>
          <SecondsLeft endsAt={g.stepEndsAt} className="font-display text-2xl" />
        </div>
        <TimerBar startedAt={g.stepStartedAt} endsAt={g.stepEndsAt} />
      </div>
      <div
        onPointerDown={(e) => {
          e.preventDefault();
          miss();
        }}
        className={cx(
          'relative min-h-[60dvh] flex-1 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] transition-colors',
          flash === 'hit' && 'bg-emerald-500/20',
          flash === 'miss' && 'bg-rose-500/20',
        )}
      >
        {t && (
          <motion.div
            key={t.id}
            initial={{ left: `${t.x1}%`, top: `${t.y1}%`, scale: 0.3 }}
            animate={{ left: `${t.x2}%`, top: `${t.y2}%`, scale: 1 }}
            transition={{ left: { duration: t.lifeMs / 1000, ease: 'linear' }, top: { duration: t.lifeMs / 1000, ease: 'linear' }, scale: { duration: 0.15 } }}
            onPointerDown={hit}
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              width: `${t.size}%`,
              aspectRatio: '1',
              background: 'radial-gradient(circle, #fff 0 14%, #ef4444 15% 34%, #fff 35% 54%, #ef4444 55% 74%, #fff 75% 100%)',
              boxShadow: '0 0 24px rgba(239,68,68,.7)',
            }}
          />
        )}
      </div>
      <p className="text-center text-xs text-white/40">과녁을 맞히면 다음 과녁은 더 작고 빨라져요 · 빈 곳 터치는 감점</p>
    </div>
  );
}
