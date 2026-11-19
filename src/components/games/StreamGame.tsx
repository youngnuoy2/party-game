'use client';
// 사칙연산 / 색깔 함정 / 숫자 비교 (개인별 연속 문제)
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { serverNow } from '@/lib/socket';
import { sfx, vibrate } from '@/lib/sound';
import { useServerNow } from '@/lib/useNow';
import { cx, SecondsLeft, TimerBar } from '../ui';
import type { GameProps } from './common';

export default function StreamGame({ state, me, act, setView }: GameProps) {
  const g = state.game!;
  const v = me.view as {
    q: { id: number; text?: string; word?: string; ink?: string; choices: string[] } | null;
    correct: number;
    wrong: number;
    points: number;
    lockedUntil: number;
    last: { correct: boolean } | null;
    streak: number;
  } | null;
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<number[]>([]);
  const [typed, setTyped] = useState('');
  const qid = me.view?.q?.id;
  useEffect(() => {
    setPicked([]);
    setTyped('');
  }, [qid]);
  const [flash, setFlash] = useState<'ok' | 'no' | null>(null);
  const now = useServerNow(100);
  const locked = v ? v.lockedUntil > now : false;
  const ended = now > g.stepEndsAt;

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 350);
    return () => clearTimeout(t);
  }, [flash]);

  if (!v || !v.q) return <div className="py-20 text-center text-white/60">문제를 불러오는 중...</div>;
  const q = v.q;

  const answer = async (i: number | string) => {
    if (busy || locked || ended) return;
    setBusy(true);
    const r = await act({ type: 'answer', qid: q.id, choice: i });
    setBusy(false);
    if (r.ok && r.data) {
      const nv = r.data as typeof v;
      setView(nv);
      if (nv?.last?.correct) {
        sfx.correct();
        vibrate(20);
        setFlash('ok');
      } else {
        sfx.wrong();
        vibrate([40, 40, 40]);
        setFlash('no');
      }
    }
  };

  const gid = g.gameId;
  const tapOrder = (i: number) => {
    if (busy || locked || ended || picked.includes(i)) return;
    const next = [...picked, i];
    vibrate(10);
    if (next.length >= q.choices.length) {
      setPicked([]);
      answer(next.join(''));
    } else setPicked(next);
  };
  return (
    <div className={cx('flex flex-1 flex-col gap-4 touch-game transition-colors', flash === 'ok' && 'bg-emerald-500/10', flash === 'no' && 'bg-rose-500/15')}>
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="chip">
            ✅ {v.correct} <span className="text-white/30">|</span> ❌ {v.wrong}
          </span>
          {v.streak >= 3 && <span className="chip border-amber-300/40 text-amber-200">🔥 {v.streak}연속</span>}
          <SecondsLeft endsAt={g.stepEndsAt} className="font-display text-2xl" />
        </div>
        <TimerBar startedAt={g.stepStartedAt} endsAt={g.stepEndsAt} />
      </div>

      <motion.div
        key={q.id}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        className="card relative flex min-h-[9rem] flex-col items-center justify-center p-5 text-center"
      >
        {gid === 'math' && <div className="font-display text-5xl tabular-nums">{q.text}</div>}
        {gid === 'color' && (
          <>
            <div className="mb-1 text-sm text-white/50">글자의 &quot;색깔&quot;은?</div>
            <div className="font-display text-7xl" style={{ color: q.ink }}>
              {q.word}
            </div>
          </>
        )}
        {gid === 'compare' && <div className="text-xl font-bold text-white/70">더 큰 쪽을 터치!</div>}
        {gid === 'sense' && (
          <>
            <div className="mb-1 text-sm text-white/50">가장 가까운 값은? (어림셈)</div>
            <div className="font-display text-5xl tabular-nums">{q.text}</div>
          </>
        )}
        {gid === 'order' && <div className="text-xl font-bold text-white/80">작은 것부터 순서대로 터치! ({picked.length}/{q.choices.length})</div>}
        {gid === 'typing' && (
          <>
            <div className="mb-2 text-sm text-white/50">아래 문장을 그대로 입력하세요</div>
            <div className="select-none text-3xl font-bold leading-snug text-sky-200">{q.text}</div>
          </>
        )}
        {locked && (
          <div className="absolute inset-0 flex items-center justify-center rounded-3xl bg-rose-900 font-display text-3xl">
            땡! 잠깐만요
          </div>
        )}
      </motion.div>

      {gid === 'typing' ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (typed.trim()) answer(typed);
          }}
        >
          <input
            className="input text-center text-2xl"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onPaste={(e) => e.preventDefault()}
            placeholder="여기에 입력 후 엔터"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="send"
            disabled={ended}
            autoFocus
          />
          <button className="btn-primary w-full py-4 text-xl" onMouseDown={(e) => e.preventDefault()} disabled={busy || locked || ended || !typed.trim()}>
            제출
          </button>
        </form>
      ) : gid === 'order' ? (
        <div className="grid flex-1 grid-cols-2 grid-rows-2 gap-3">
          {q.choices.map((c, i) => {
            const n = picked.indexOf(i);
            return (
              <button
                key={`${q.id}-${i}`}
                onPointerDown={(e) => {
                  e.preventDefault();
                  tapOrder(i);
                }}
                disabled={busy || locked || ended}
                className={cx(
                  'btn relative min-h-[5.5rem] rounded-3xl border-2 font-display text-3xl text-white',
                  n >= 0 ? 'border-neon-blue bg-neon-blue/25' : 'border-white/10 bg-white/[0.07]',
                )}
              >
                {n >= 0 && <span className="absolute left-3 top-2 text-lg text-amber-300">{n + 1}</span>}
                {c}
              </button>
            );
          })}
          {picked.length > 0 && (
            <button className="btn-ghost col-span-2 py-2 text-sm" onClick={() => setPicked([])}>
              다시 고르기
            </button>
          )}
        </div>
      ) : (
        <div className={cx('grid flex-1 gap-3', gid === 'compare' ? 'grid-cols-2' : 'grid-cols-2 grid-rows-2')}>
        {q.choices.map((c, i) => (
          <button
            key={`${q.id}-${i}`}
            onPointerDown={(e) => {
              e.preventDefault();
              answer(i);
            }}
            disabled={busy || locked || ended}
            className={cx(
              'btn min-h-[5.5rem] rounded-3xl border-2 border-white/10 bg-white/[0.07] font-display text-white active:bg-white/20',
              gid === 'compare' ? 'text-4xl' : 'text-4xl',
            )}
          >
            {c}
          </button>
        ))}
      </div>
      )}
      <div className="pb-1 text-center text-xs text-white/40">틀리면 감점 + 잠시 대기 · 빠를수록 보너스</div>
    </div>
  );
}

export const streamNow = serverNow;
