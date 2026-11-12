'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { serverNow } from '@/lib/socket';
import { vibrate } from '@/lib/sound';
import type { GameProps } from './common';
import { RhythmLane, type RhythmPayload } from './visuals';

export default function RhythmGame({ state, act }: GameProps) {
  const g = state.game!;
  const p = g.payload as RhythmPayload;
  const buf = useRef<number[]>([]);
  const [flash, setFlash] = useState<string | null>(null);
  const [stats, setStats] = useState({ PERFECT: 0, GREAT: 0, GOOD: 0, MISS: 0 });
  const judged = useRef(new Set<number>());

  // 300ms 마다 터치 시각 전송
  useEffect(() => {
    const flush = () => {
      if (!buf.current.length) return;
      const times = buf.current;
      buf.current = [];
      act({ type: 'taps', times });
    };
    const t = setInterval(flush, 300);
    return () => {
      clearInterval(t);
      flush();
    };
  }, [act]);

  const tap = useCallback(() => {
    const t = serverNow() - g.stepStartedAt;
    buf.current.push(t);
    vibrate(10);
    // 화면 표시용 즉시 판정 (최종 점수는 서버가 계산)
    let best = -1;
    let bestD = Infinity;
    p.beats.forEach((b, i) => {
      if (judged.current.has(i)) return;
      const d = Math.abs(b - t);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    const label = bestD <= 50 ? 'PERFECT' : bestD <= 100 ? 'GREAT' : bestD <= 150 ? 'GOOD' : 'MISS';
    if (label !== 'MISS') judged.current.add(best);
    setStats((s) => ({ ...s, [label]: s[label as keyof typeof s] + 1 }));
    setFlash(`${label}#${Date.now()}`);
  }, [g.stepStartedAt, p.beats]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        tap();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tap]);

  return (
    <div className="flex flex-1 flex-col gap-3 touch-game">
      <div className="flex justify-center gap-2 text-xs">
        <span className="chip text-amber-200">PERFECT {stats.PERFECT}</span>
        <span className="chip text-sky-200">GREAT {stats.GREAT}</span>
        <span className="chip">GOOD {stats.GOOD}</span>
        <span className="chip text-rose-300">헛 {stats.MISS}</span>
      </div>
      <RhythmLane p={p} stepStartedAt={g.stepStartedAt} metronome flash={flash} />
      <button
        onPointerDown={(e) => {
          e.preventDefault();
          tap();
        }}
        className="btn flex-1 rounded-3xl bg-gradient-to-r from-pink-500 to-amber-500 py-8 font-display text-5xl text-white active:scale-95"
      >
        TAP! <span className="ml-2 hidden text-lg sm:inline">(스페이스바)</span>
      </button>
    </div>
  );
}
