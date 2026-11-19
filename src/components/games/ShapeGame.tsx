'use client';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { sfx, vibrate } from '@/lib/sound';
import { useServerNow } from '@/lib/useNow';
import { rotate, type Cell } from '@/shared/shapes';
import { cx, SecondsLeft, TimerBar } from '../ui';
import type { GameProps } from './common';

function Grid({ cells, kind }: { cells: Cell[]; kind: 'hole' | 'piece' }) {
  const w = Math.max(...cells.map((c) => c[0])) + 1;
  const h = Math.max(...cells.map((c) => c[1])) + 1;
  const S = 34;
  return (
    <svg width={w * S} height={h * S} viewBox={`0 0 ${w * S} ${h * S}`}>
      {cells.map(([x, y], i) => (
        <rect
          key={i}
          x={x * S + 2}
          y={y * S + 2}
          width={S - 4}
          height={S - 4}
          rx={6}
          fill={kind === 'hole' ? 'rgba(255,255,255,.04)' : 'url(#pg)'}
          stroke={kind === 'hole' ? 'rgba(255,255,255,.6)' : '#67e8f9'}
          strokeDasharray={kind === 'hole' ? '5 4' : undefined}
          strokeWidth={2}
        />
      ))}
      <defs>
        <linearGradient id="pg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#16a34a" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export default function ShapeGame({ state, me, act, setView }: GameProps) {
  const g = state.game!;
  const v = me.view as { q: { id: number; hole: Cell[]; piece: Cell[] } | null; correct: number; wrong: number; lockedUntil: number; last: { correct: boolean } | null } | null;
  const [k, setK] = useState(0);
  const [busy, setBusy] = useState(false);
  const now = useServerNow(100);
  const qid = v?.q?.id;
  useEffect(() => setK(0), [qid]);
  if (!v?.q) return <div className="py-20 text-center text-white/60">문제를 불러오는 중...</div>;
  const q = v.q;
  const locked = v.lockedUntil > now;

  const submit = async () => {
    if (busy || locked) return;
    setBusy(true);
    const r = await act({ type: 'answer', qid: q.id, choice: k % 4 });
    setBusy(false);
    if (r.ok) {
      const nv = r.data as typeof v;
      setView(nv);
      if (nv?.last?.correct) {
        sfx.correct();
        vibrate(20);
      } else {
        sfx.wrong();
        vibrate([40, 40, 40]);
      }
    }
  };

  return (
    <div className="flex flex-1 flex-col gap-4 touch-game">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="chip">
            ✅ {v.correct} <span className="text-white/30">|</span> ❌ {v.wrong}
          </span>
          <SecondsLeft endsAt={g.stepEndsAt} className="font-display text-2xl" />
        </div>
        <TimerBar startedAt={g.stepStartedAt} endsAt={g.stepEndsAt} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="card flex flex-col items-center gap-2 p-3">
          <div className="text-sm text-white/50">빈칸</div>
          <div className="flex min-h-[150px] items-center">
            <Grid cells={q.hole} kind="hole" />
          </div>
        </div>
        <button
          className="card relative flex flex-col items-center gap-2 p-3 active:bg-white/10"
          onClick={() => {
            sfx.tap();
            vibrate(8);
            setK((x) => x + 1);
          }}
          disabled={locked}
        >
          <div className="text-sm text-white/50">조각 (터치해서 회전 ↻)</div>
          <div className="flex min-h-[150px] items-center">
            <motion.div key={`${q.id}-${k}`} initial={{ rotate: -90, opacity: 0.4 }} animate={{ rotate: 0, opacity: 1 }} transition={{ duration: 0.18 }}>
              <Grid cells={rotate(q.piece, k)} kind="piece" />
            </motion.div>
          </div>
          {locked && <div className="absolute inset-0 flex items-center justify-center rounded-3xl bg-rose-900 font-display text-2xl">땡!</div>}
        </button>
      </div>
      <button className={cx('btn-gold w-full py-5 text-2xl')} onClick={submit} disabled={busy || locked}>
        🧩 맞추기!
      </button>
      <p className="text-center text-xs text-white/40">조각을 돌려서 빈칸과 똑같은 모양이 되면 맞추기를 누르세요</p>
    </div>
  );
}
