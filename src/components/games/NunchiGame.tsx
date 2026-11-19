'use client';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { sfx, vibrate } from '@/lib/sound';
import { cx, SecondsLeft, TimerBar } from '../ui';
import type { GameProps } from './common';

type V = { pick: number | null; result: { unique: boolean; place: number | null; sameCount: number; winner: number | null } | null };

export default function NunchiGame({ state, me, act, setView }: GameProps) {
  const g = state.game!;
  const v = me.view as V | null;
  const [sel, setSel] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const picked = v?.pick ?? null;
  const reveal = g.stepKind === 'reveal';

  const submit = async () => {
    if (sel == null || busy) return;
    setBusy(true);
    const r = await act({ type: 'pick', n: sel });
    setBusy(false);
    if (r.ok) {
      sfx.click();
      vibrate(20);
      setView(r.data);
    } else setErr(r.error ?? '실패');
  };

  if (reveal && v?.result) {
    const r = v.result;
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
        <div className="text-white/60">내가 고른 숫자</div>
        <div className="font-display text-8xl gold-text">{picked ?? '-'}</div>
        <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={cx('font-display text-4xl', r.unique ? 'text-emerald-300' : 'text-rose-300')}>
          {picked == null ? '선택하지 않았어요 😢' : r.unique ? (r.place === 1 ? '🏆 1등! 아무도 안 겹쳤어요!' : `생존! 안 겹친 숫자 중 ${r.place}번째`) : `${r.sameCount}명과 겹쳤어요 💥`}
        </motion.div>
        <div className="card px-6 py-3 text-lg">우승 숫자: <b className="text-amber-200">{r.winner ?? '없음'}</b></div>
      </div>
    );
  }

  if (picked != null)
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <div className="text-white/60">내 선택</div>
        <div className="font-display text-8xl gold-text">{picked}</div>
        <div className="text-white/70">다른 사람과 안 겹치길... 🤞</div>
        <div className="text-sm text-white/40">모두 고르면 바로 결과가 공개됩니다</div>
      </div>
    );

  return (
    <div className="flex flex-1 flex-col gap-3 touch-game">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="chip">겹치지 않는 가장 큰 숫자가 승리!</span>
          <SecondsLeft endsAt={g.stepEndsAt} className="font-display text-2xl" />
        </div>
        <TimerBar startedAt={g.stepStartedAt} endsAt={g.stepEndsAt} />
      </div>
      <div className="grid grid-cols-10 gap-1">
        {Array.from({ length: 100 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            onClick={() => {
              setSel(n);
              vibrate(5);
            }}
            className={cx('aspect-square rounded-md text-[13px] font-bold tabular-nums transition', sel === n ? 'scale-110 bg-amber-400 text-ink-950' : 'bg-white/[0.07] text-white/90 active:bg-white/20')}
          >
            {n}
          </button>
        ))}
      </div>
      {err && <div className="text-center text-sm text-rose-300">{err}</div>}
      <button className="btn-gold w-full py-4 text-2xl" onClick={submit} disabled={sel == null || busy}>
        {sel == null ? '숫자를 고르세요' : `${sel} 으로 결정!`}
      </button>
      <p className="text-center text-xs text-white/40">한 번 결정하면 바꿀 수 없어요</p>
    </div>
  );
}
