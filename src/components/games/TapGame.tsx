'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { serverNow } from '@/lib/socket';
import { sfx, vibrate } from '@/lib/sound';
import { SecondsLeft, TimerBar } from '../ui';
import type { GameProps } from './common';

export default function TapGame({ state, me, act }: GameProps) {
  const g = state.game!;
  const initial = (me.view?.count as number) ?? 0;
  const count = useRef(initial);
  const sent = useRef(initial);
  const [display, setDisplay] = useState(initial);
  const [pops, setPops] = useState<{ id: number; x: number; y: number }[]>([]);
  const popId = useRef(0);
  const [pressed, setPressed] = useState(false);

  // 250ms 마다 누적 횟수 전송 (서버가 속도 상한 검증)
  useEffect(() => {
    const flush = () => {
      if (count.current !== sent.current) {
        const c = count.current;
        sent.current = c;
        act({ type: 'tap', count: c });
      }
    };
    const t = setInterval(flush, 250);
    const endT = setTimeout(flush, Math.max(0, g.stepEndsAt - serverNow() + 50));
    return () => {
      clearInterval(t);
      clearTimeout(endT);
      flush();
    };
  }, [act, g.stepEndsAt]);

  const onDown = (e: React.PointerEvent) => {
    if (serverNow() > g.stepEndsAt) return;
    count.current += 1;
    setDisplay(count.current);
    sfx.tap();
    vibrate(12);
    setPressed(true);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const id = popId.current++;
    setPops((p) => [...p.slice(-12), { id, x: e.clientX - rect.left, y: e.clientY - rect.top }]);
    setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), 600);
  };

  const ended = serverNow() > g.stepEndsAt;

  return (
    <div className="flex flex-1 flex-col items-center gap-4 touch-game">
      <div className="w-full space-y-2">
        <div className="flex items-end justify-between">
          <span className="text-white/60">남은 시간</span>
          <SecondsLeft endsAt={g.stepEndsAt} className="font-display text-3xl" />
        </div>
        <TimerBar startedAt={g.stepStartedAt} endsAt={g.stepEndsAt} />
      </div>
      <motion.div key={display} initial={{ scale: 1.3 }} animate={{ scale: 1 }} className="font-display text-7xl tabular-nums gold-text">
        {display}
      </motion.div>
      <div className="relative flex flex-1 items-center justify-center">
        <button
          onPointerDown={onDown}
          onPointerUp={() => setPressed(false)}
          onPointerLeave={() => setPressed(false)}
          onContextMenu={(e) => e.preventDefault()}
          disabled={ended}
          className="relative h-64 w-64 rounded-full font-display text-5xl text-white shadow-[0_0_60px_rgba(244,63,94,.6)] outline-none transition-transform duration-75 disabled:opacity-50 sm:h-72 sm:w-72"
          style={{
            background: 'radial-gradient(circle at 35% 30%, #fb7185, #e11d48 55%, #9f1239)',
            transform: pressed ? 'scale(0.92)' : 'scale(1)',
          }}
        >
          {ended ? '끝!' : 'TAP!'}
          <AnimatePresence>
            {pops.map((p) => (
              <motion.span
                key={p.id}
                initial={{ opacity: 1, y: 0, scale: 0.8 }}
                animate={{ opacity: 0, y: -80, scale: 1.4 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.55 }}
                className="pointer-events-none absolute text-3xl text-amber-200"
                style={{ left: p.x - 15, top: p.y - 20 }}
              >
                +1
              </motion.span>
            ))}
          </AnimatePresence>
        </button>
      </div>
      <p className="pb-2 text-sm text-white/40">여러 손가락으로 번갈아 누르면 더 빨라요!</p>
    </div>
  );
}
