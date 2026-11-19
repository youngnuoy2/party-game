'use client';
import { useEffect, useRef } from 'react';
import { sfx, vibrate } from '@/lib/sound';
import { cx, SecondsLeft, TimerBar } from '../ui';
import type { GameProps } from './common';
import { CupsBoard, cupsCaption, type CupsPayload } from './visuals';

export default function CupsGame({ state, me, act, setView }: GameProps) {
  const g = state.game!;
  const p = g.payload as CupsPayload;
  const v = me.view as { index: number; chosen: number | null; result: { correct: boolean; points: number; missed?: boolean } | null } | null;
  const mine = v && v.index === p.index ? v : null;
  const played = useRef(-1);

  useEffect(() => {
    if (g.stepKind === 'reveal' && mine?.result && played.current !== p.index) {
      played.current = p.index;
      if (mine.result.correct) sfx.correct();
      else sfx.wrong();
    }
  }, [g.stepKind, mine?.result, p.index]);

  const pick = async (slot: number) => {
    if (mine?.chosen != null) return;
    vibrate(15);
    sfx.click();
    const r = await act({ type: 'answer', index: p.index, choice: slot });
    if (r.ok) setView(r.data);
  };

  return (
    <div className="flex flex-1 flex-col gap-4 touch-game">
      <div className="flex items-center justify-between">
        <span className="chip">
          문제 {p.index + 1} / {p.total} · 컵 {p.n}개
        </span>
        {g.stepKind === 'question' && <SecondsLeft endsAt={g.stepEndsAt} className="font-display text-2xl" />}
      </div>
      {g.stepKind === 'question' && <TimerBar startedAt={g.stepStartedAt} endsAt={g.stepEndsAt} />}
      <div className="card p-4 text-center text-xl font-bold">{cupsCaption(g.stepKind)}</div>
      <div className="flex flex-1 items-center">
        <CupsBoard p={p} stepKind={g.stepKind} stepStartedAt={g.stepStartedAt} chosen={mine?.chosen} onPick={mine?.chosen == null ? pick : undefined} />
      </div>
      {g.stepKind === 'question' && mine?.chosen != null && <div className="card p-3 text-center text-white/70">✅ {mine.chosen + 1}번 컵 선택! 정답 공개를 기다려요</div>}
      {g.stepKind === 'reveal' && (
        <div className={cx('card p-4 text-center font-display text-3xl', mine?.result?.correct ? 'text-emerald-300' : 'text-rose-300')}>
          {mine?.result?.correct ? `정답! +${mine.result.points}` : mine?.result?.missed || !mine ? '시간 초과 😢' : '아쉬워요 😢'}
        </div>
      )}
    </div>
  );
}
