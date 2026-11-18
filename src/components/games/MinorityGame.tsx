'use client';
import { motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { sfx, vibrate } from '@/lib/sound';
import { cx, SecondsLeft, TimerBar } from '../ui';
import type { GameProps } from './common';

export interface MinorityPayload {
  index: number;
  total: number;
  options: [string, string];
  reveal?: { a: number; b: number; winner: 0 | 1 | 'tie' | null };
}

export default function MinorityGame({ state, me, act, setView }: GameProps) {
  const g = state.game!;
  const p = g.payload as MinorityPayload;
  const v = me.view as { index: number; pick: 0 | 1 | null; result: { points: number } | null } | null;
  const mine = v && v.index === p.index ? v : null;
  const reveal = g.stepKind === 'reveal' ? p.reveal : undefined;
  const played = useRef(-1);

  useEffect(() => {
    if (reveal && mine?.result && played.current !== p.index) {
      played.current = p.index;
      if (mine.result.points > 0) sfx.correct();
      else sfx.wrong();
    }
  }, [reveal, mine?.result, p.index]);

  const pick = async (c: 0 | 1) => {
    if (mine?.pick != null || reveal) return;
    vibrate(20);
    sfx.click();
    const r = await act({ type: 'pick', index: p.index, choice: c });
    if (r.ok) setView(r.data);
  };

  return (
    <div className="flex flex-1 flex-col gap-4 touch-game">
      <div className="flex items-center justify-between">
        <span className="chip">
          문제 {p.index + 1} / {p.total}
        </span>
        <span className="chip">적은 쪽이 생존!</span>
        {!reveal && <SecondsLeft endsAt={g.stepEndsAt} paused={state.paused} pausedRemain={state.pausedRemainMs} className="font-display text-2xl" />}
      </div>
      {!reveal && <TimerBar startedAt={g.stepStartedAt} endsAt={g.stepEndsAt} paused={state.paused} pausedRemain={state.pausedRemainMs} />}
      <div className="grid flex-1 grid-rows-2 gap-3">
        {p.options.map((label, i) => {
          const c = i as 0 | 1;
          const chosen = mine?.pick === c;
          const count = reveal ? (c === 0 ? reveal.a : reveal.b) : null;
          const win = reveal && (reveal.winner === c || reveal.winner === 'tie');
          return (
            <button
              key={i}
              onClick={() => pick(c)}
              disabled={mine?.pick != null || !!reveal || state.paused}
              className={cx(
                'btn relative flex-col rounded-3xl border-4 font-display text-white disabled:opacity-100',
                i === 0 ? 'bg-sky-600/40' : 'bg-rose-600/40',
                chosen ? 'border-amber-300 shadow-gold' : 'border-transparent',
                mine?.pick != null && !chosen && !reveal && 'opacity-40',
                reveal && !win && 'opacity-40',
              )}
            >
              <span className="text-2xl text-white/60">{i === 0 ? 'A' : 'B'}</span>
              <span className="text-4xl">{label}</span>
              {count !== null && (
                <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="mt-2 text-3xl">
                  {count}명 {win ? '🎉' : ''}
                </motion.span>
              )}
              {chosen && <span className="absolute right-4 top-3 text-base text-amber-200">내 선택</span>}
            </button>
          );
        })}
      </div>
      {!reveal && mine?.pick != null && <div className="card p-3 text-center text-white/70">결과는 마감 후 공개됩니다 🤫</div>}
      {reveal && (
        <div className={cx('card p-3 text-center font-display text-2xl', (mine?.result?.points ?? 0) > 0 ? 'text-emerald-300' : 'text-rose-300')}>
          {reveal.winner === null
            ? '생존자 없음! (한쪽으로 몰렸어요)'
            : mine?.pick == null
              ? '선택하지 않았어요 😢'
              : (mine.result?.points ?? 0) > 0
                ? `생존! +${mine.result!.points}`
                : '다수파... 탈락 😢'}
        </div>
      )}
    </div>
  );
}
