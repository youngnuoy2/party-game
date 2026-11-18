'use client';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { sfx, vibrate } from '@/lib/sound';
import { useServerNow } from '@/lib/useNow';
import { cx } from '../ui';
import type { GameProps } from './common';

type V = { holding: number[]; since: number | null; holdMs: number; passes: number; exploded: boolean; over: boolean };

export default function PotatoGame({ state, me, act, setView }: GameProps) {
  const g = state.game!;
  const v = me.view as V | null;
  const now = useServerNow(100);
  const [busy, setBusy] = useState(false);
  const has = !!v?.holding.length;
  const reveal = g.stepKind === 'reveal' || v?.over;

  // 폭탄을 받으면 진동 + 경고음
  useEffect(() => {
    if (has && !reveal) {
      vibrate([200, 80, 200]);
      sfx.wrong();
    }
  }, [has, v?.since]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (reveal && v?.exploded) {
      vibrate([400, 100, 400]);
      sfx.drum();
    }
  }, [reveal, v?.exploded]);

  const pass = async () => {
    if (!has || busy) return;
    setBusy(true);
    const r = await act({ type: 'pass', bomb: v!.holding[0] });
    setBusy(false);
    if (r.ok) {
      sfx.click();
      setView(r.data);
    }
  };

  if (reveal)
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <motion.div initial={{ scale: 0.3 }} animate={{ scale: 1 }} className="text-[8rem] leading-none">
          {v?.exploded ? '💥' : '😎'}
        </motion.div>
        <div className={cx('font-display text-4xl', v?.exploded ? 'text-rose-300' : 'text-emerald-300')}>{v?.exploded ? '펑! 내 손에서 터졌어요' : '살아남았어요!'}</div>
        <div className="text-white/60">
          폭탄 보유 {((v?.holdMs ?? 0) / 1000).toFixed(1)}초 · {v?.passes ?? 0}번 넘김
        </div>
      </div>
    );

  const heldSec = has && v?.since ? Math.max(0, (now - v.since) / 1000) : 0;
  return (
    <div className={cx('flex flex-1 flex-col items-center justify-center gap-6 rounded-3xl text-center touch-game transition-colors', has ? 'animate-pulse bg-red-600/30' : '')}>
      {has ? (
        <>
          <motion.div animate={{ rotate: [-8, 8, -8], scale: [1, 1.08, 1] }} transition={{ repeat: Infinity, duration: 0.4 }} className="text-[9rem] leading-none">
            🧨
          </motion.div>
          <div className="font-display text-4xl text-amber-200">폭탄이 왔어요!</div>
          <div className="text-white/70">{heldSec.toFixed(1)}초째 들고 있어요</div>
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              pass();
            }}
            disabled={busy}
            className="btn w-full max-w-xs rounded-3xl bg-gradient-to-r from-orange-500 to-red-600 py-8 font-display text-5xl text-white shadow-[0_0_40px_rgba(239,68,68,.7)] active:scale-95"
          >
            넘기기! 👉
          </button>
        </>
      ) : (
        <>
          <div className="text-[7rem] leading-none">😌</div>
          <div className="font-display text-3xl">휴~ 지금은 폭탄이 없어요</div>
          <div className="text-white/60">폭탄이 오면 진동과 함께 알려 드려요. 화면을 켜 두세요!</div>
          <div className="chip">지금까지 {((v?.holdMs ?? 0) / 1000).toFixed(1)}초 보유 · {v?.passes ?? 0}번 넘김</div>
        </>
      )}
    </div>
  );
}
