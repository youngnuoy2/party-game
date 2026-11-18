'use client';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { serverNow } from '@/lib/socket';
import { sfx, vibrate } from '@/lib/sound';
import { cx, SecondsLeft, TimerBar } from '../ui';
import type { GameProps } from './common';

type Mover = { t0: number; v: number; w: number; p0: number };
type V = { blocks: [number, number][]; mover: Mover | null; floors: number; perfects: number; over: boolean };

function moverX(m: Mover, t: number) {
  const span = 100 - m.w;
  if (span <= 0) return 0;
  const d = m.p0 + (Math.max(0, t - m.t0) / 1000) * m.v;
  const r = d % (2 * span);
  return r <= span ? r : 2 * span - r;
}

const ROW = 7; // 블록 한 층 높이 (%)
const COLORS = ['#f59e0b', '#84cc16', '#22d3ee', '#a855f7', '#ec4899', '#f97316'];

export default function StackGame({ state, me, act, setView }: GameProps) {
  const g = state.game!;
  const v = me.view as V | null;
  const [now, setNow] = useState(() => serverNow());
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      setNow(serverNow());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 700);
    return () => clearTimeout(t);
  }, [msg]);

  if (!v) return null;
  const t = now - g.stepStartedAt;
  const shown = v.blocks; // 최근 8개 (맨 아래가 가장 오래된 것)
  const baseFloor = v.floors + 1 - shown.length; // shown[0] 의 층 번호

  const drop = async () => {
    if (busy || !v.mover || v.over) return;
    const tt = serverNow() - g.stepStartedAt;
    if (tt < v.mover.t0) return;
    setBusy(true);
    const r = await act({ type: 'drop', t: tt });
    setBusy(false);
    if (!r.ok) return;
    const d = r.data as V & { result: 'perfect' | 'cut' | 'miss' };
    setView(d);
    if (d.result === 'perfect') {
      sfx.correct();
      vibrate([20, 20, 40]);
      setMsg('PERFECT!');
    } else if (d.result === 'cut') {
      sfx.tap();
      vibrate(20);
    } else {
      sfx.wrong();
      vibrate([80, 40, 80]);
      setMsg('와르르! 💥');
    }
  };

  return (
    <div className="flex flex-1 flex-col gap-3 touch-game">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="chip">🧱 {v.floors}층 · PERFECT {v.perfects}</span>
          <SecondsLeft endsAt={g.stepEndsAt} className="font-display text-2xl" />
        </div>
        <TimerBar startedAt={g.stepStartedAt} endsAt={g.stepEndsAt} />
      </div>
      <button
        onPointerDown={(e) => {
          e.preventDefault();
          drop();
        }}
        className="relative min-h-[62dvh] flex-1 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-indigo-950/60 to-black/40"
      >
        {shown.map(([L, R], i) => (
          <div
            key={baseFloor + i}
            className="absolute rounded-md border border-white/20"
            style={{ left: `${L}%`, width: `${R - L}%`, bottom: `${8 + i * ROW}%`, height: `${ROW}%`, background: COLORS[(baseFloor + i) % COLORS.length] }}
          />
        ))}
        {v.mover && !v.over && (
          <div
            className="absolute rounded-md border-2 border-white/70"
            style={{ left: `${moverX(v.mover, t)}%`, width: `${v.mover.w}%`, bottom: `${8 + shown.length * ROW}%`, height: `${ROW}%`, background: COLORS[(v.floors + 1) % COLORS.length], opacity: t < v.mover.t0 ? 0.4 : 1 }}
          />
        )}
        {msg && (
          <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="absolute inset-x-0 top-[12%] text-center font-display text-5xl text-amber-200">
            {msg}
          </motion.div>
        )}
        {v.over && <div className="absolute inset-x-0 top-[30%] text-center font-display text-4xl">최종 {v.floors}층! 🏁</div>}
        <span className={cx('absolute bottom-2 inset-x-0 text-center text-sm text-white/40')}>{v.over ? '' : '아무 곳이나 터치해서 떨어뜨리기'}</span>
      </button>
    </div>
  );
}
