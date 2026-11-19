'use client';
import { useState } from 'react';
import { sfx, vibrate } from '@/lib/sound';
import { cx, SecondsLeft, TimerBar } from '../ui';
import type { GameProps } from './common';
import { BubbleField, type BubbleT } from './visuals';

export default function BubbleGame({ state, me, act, setView }: GameProps) {
  const g = state.game!;
  const bubbles = (g.payload as { bubbles: BubbleT[] }).bubbles;
  const v = me.view as { popped: number[]; points: number; counts: { blue: number; gold: number; red: number } } | null;
  const [local, setLocal] = useState<Set<number>>(() => new Set(v?.popped ?? []));
  const [flash, setFlash] = useState<string | null>(null);

  const pop = async (b: BubbleT) => {
    if (local.has(b.id)) return;
    setLocal((s) => new Set(s).add(b.id));
    if (b.kind === 'red') {
      sfx.wrong();
      vibrate([60, 30, 60]);
    } else {
      sfx.tap();
      vibrate(b.kind === 'gold' ? [20, 20, 20] : 10);
    }
    setFlash(b.kind);
    setTimeout(() => setFlash(null), 200);
    const r = await act({ type: 'pop', id: b.id });
    if (r.ok) setView(r.data);
  };

  return (
    <div className={cx('flex flex-1 flex-col gap-3 touch-game transition-colors', flash === 'red' && 'bg-red-600/20', flash === 'gold' && 'bg-amber-400/15')}>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="chip font-display text-lg">{v?.points ?? 0}점</span>
          <span className="chip text-xs">
            🔵{v?.counts.blue ?? 0} 🟡{v?.counts.gold ?? 0} 🔴{v?.counts.red ?? 0}
          </span>
          <SecondsLeft endsAt={g.stepEndsAt} className="font-display text-2xl" />
        </div>
        <TimerBar startedAt={g.stepStartedAt} endsAt={g.stepEndsAt} />
      </div>
      <BubbleField bubbles={bubbles} stepStartedAt={g.stepStartedAt} popped={local} onPop={pop} />
      <p className="text-center text-xs text-white/40">🔵 +10 · 🟡 +50 · 🔴 −30 — 빨간 방울은 피하세요!</p>
    </div>
  );
}
