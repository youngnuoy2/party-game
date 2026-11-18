'use client';
import { motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { sfx, vibrate } from '@/lib/sound';
import { cx, SecondsLeft, TimerBar } from '../ui';
import type { GameProps } from './common';
import { HORSE_COLORS, HorseTrack, type HorsePayload } from './visuals';

export default function HorseGame({ state, me, act, setView }: GameProps) {
  const g = state.game!;
  const p = g.payload as HorsePayload;
  const v = me.view as { pick: number | null; place: number | null } | null;
  const played = useRef(false);

  useEffect(() => {
    if (g.stepKind === 'reveal' && v?.place && !played.current) {
      played.current = true;
      if (v.place <= 3) sfx.fanfare();
      else sfx.wrong();
    }
  }, [g.stepKind, v?.place]);

  const choose = async (h: number) => {
    if (v?.pick != null) return;
    vibrate(20);
    sfx.click();
    const r = await act({ type: 'pick', horse: h });
    if (r.ok) setView(r.data);
  };

  if (g.stepKind === 'pick')
    return (
      <div className="flex flex-1 flex-col gap-3 touch-game">
        <div className="flex items-center justify-between">
          <span className="chip">우승할 말을 고르세요!</span>
          <SecondsLeft endsAt={g.stepEndsAt} className="font-display text-2xl" />
        </div>
        <TimerBar startedAt={g.stepStartedAt} endsAt={g.stepEndsAt} />
        <div className="grid flex-1 gap-2">
          {Array.from({ length: p.horses }, (_, h) => (
            <button
              key={h}
              onClick={() => choose(h)}
              disabled={v?.pick != null}
              className={cx(
                'btn justify-start gap-4 rounded-2xl border-4 px-5 font-display text-3xl text-white disabled:opacity-100',
                v?.pick === h ? 'border-amber-300 shadow-gold' : 'border-transparent',
                v?.pick != null && v.pick !== h && 'opacity-40',
              )}
              style={{ background: `${HORSE_COLORS[h]}55` }}
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full text-2xl" style={{ background: HORSE_COLORS[h] }}>
                {h + 1}
              </span>
              <span>{h + 1}번 말</span>
              <span className="ml-auto -scale-x-100 text-4xl">🏇</span>
            </button>
          ))}
        </div>
        {v?.pick != null && <div className="card p-3 text-center text-white/70">{v.pick + 1}번 말에 걸었어요! 경주를 기다려요 🏁</div>}
      </div>
    );

  const raceStart = g.stepKind === 'race' ? g.stepStartedAt : g.stepStartedAt - 99_999; // 공개 단계: 결승선 위치
  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="text-center font-display text-2xl">{g.stepKind === 'race' ? '🏁 경주 중! 내 말 힘내라!' : '🏆 경주 결과'}</div>
      <HorseTrack p={p} raceStartedAt={raceStart} mine={v?.pick} />
      <div className="card p-4 text-center">
        {v?.pick == null ? (
          <span className="text-white/60">말을 고르지 않았어요</span>
        ) : g.stepKind === 'reveal' && v.place ? (
          <motion.div initial={{ scale: 0.6 }} animate={{ scale: 1 }} className={cx('font-display text-3xl', v.place <= 3 ? 'text-emerald-300' : 'text-rose-300')}>
            {v.pick + 1}번 말 {v.place}등! {v.place === 1 ? '🎉 +1000' : v.place === 2 ? '+500' : v.place === 3 ? '+250' : '😢'}
          </motion.div>
        ) : (
          <span className="text-lg">
            내 말: <b style={{ color: HORSE_COLORS[v.pick] }}>{v.pick + 1}번</b>
          </span>
        )}
      </div>
    </div>
  );
}
