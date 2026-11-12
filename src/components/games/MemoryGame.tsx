'use client';
import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { sfx, vibrate } from '@/lib/sound';
import { cx, SecondsLeft, TimerBar } from '../ui';
import type { GameProps } from './common';

type Mode = 'loading' | 'show' | 'input' | 'feedback' | 'done';

export default function MemoryGame({ state, me, act }: GameProps) {
  const g = state.game!;
  const v = me.view as { level: number; best: number; done: boolean; lastFail: { expected: string; got: string } | null } | null;
  const [mode, setMode] = useState<Mode>(v?.done ? 'done' : 'loading');
  const [digits, setDigits] = useState<string | null>(null);
  const [level, setLevel] = useState(v?.level ?? 4);
  const [best, setBest] = useState(v?.best ?? 0);
  const [input, setInput] = useState('');
  const [feedback, setFeedback] = useState<{ ok: boolean; expected?: string } | null>(v?.lastFail ? { ok: false, expected: v.lastFail.expected } : null);
  const [showUntil, setShowUntil] = useState(0);
  const busy = useRef(false);

  const next = async () => {
    setMode('loading');
    setInput('');
    const r = await act({ type: 'next' });
    if (!r.ok) {
      setMode('done');
      return;
    }
    const d = r.data as { digits: string | null; showMs: number };
    if (d.digits && d.showMs > 0) {
      setDigits(d.digits);
      setShowUntil(Date.now() + d.showMs);
      setMode('show');
      setTimeout(() => setMode((m) => (m === 'show' ? 'input' : m)), d.showMs);
    } else {
      setDigits(null);
      setMode('input');
    }
  };

  useEffect(() => {
    if (!v?.done) next();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async () => {
    if (busy.current || !input) return;
    busy.current = true;
    const r = await act({ type: 'answer', value: input });
    busy.current = false;
    if (!r.ok) {
      setMode('done');
      return;
    }
    const d = r.data as { correct: boolean; best: number; level: number; done: boolean; lastFail: { expected: string } | null };
    setBest(d.best);
    setLevel(d.level);
    if (d.correct) {
      sfx.correct();
      vibrate(25);
      setFeedback({ ok: true });
    } else {
      sfx.wrong();
      vibrate([60, 40, 60]);
      setFeedback({ ok: false, expected: d.lastFail?.expected });
    }
    setMode('feedback');
    setTimeout(() => (d.done ? setMode('done') : next()), d.correct ? 900 : 2200);
  };

  const press = (k: string) => {
    if (mode !== 'input') return;
    vibrate(8);
    if (k === '⌫') setInput((s) => s.slice(0, -1));
    else if (k === '확인') submit();
    else setInput((s) => (s.length < 16 ? s + k : s));
  };

  return (
    <div className="flex flex-1 flex-col gap-3 touch-game">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="chip">🎯 {level}자리 도전</span>
          <span className="chip">🏅 최고 {best}자리</span>
          <SecondsLeft endsAt={g.stepEndsAt} className="font-display text-2xl" />
        </div>
        <TimerBar startedAt={g.stepStartedAt} endsAt={g.stepEndsAt} />
      </div>

      <div className="card flex min-h-[9rem] flex-col items-center justify-center p-4 text-center">
        {mode === 'show' && digits && (
          <>
            <motion.div key={digits} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="break-all font-display text-5xl tracking-[0.2em] text-sky-300">
              {digits}
            </motion.div>
            <ShowBar until={showUntil} />
          </>
        )}
        {mode === 'input' && (
          <>
            <div className="text-sm text-white/50">기억한 숫자를 입력하세요</div>
            <div className="mt-2 min-h-[3.5rem] break-all font-display text-5xl tracking-[0.2em]">{input || <span className="text-white/20">_</span>}</div>
          </>
        )}
        {mode === 'feedback' && feedback && (
          <div className={cx('font-display text-4xl', feedback.ok ? 'text-emerald-300' : 'text-rose-300')}>
            {feedback.ok ? '정답! 다음은 한 자리 더!' : '틀렸어요!'}
            {!feedback.ok && feedback.expected && <div className="mt-2 text-xl text-white/70">정답: {feedback.expected}</div>}
          </div>
        )}
        {mode === 'done' && (
          <div>
            <div className="font-display text-4xl text-amber-200">최종 기록 {best}자리</div>
            <div className="mt-2 text-white/60">다른 참가자를 기다리는 중...</div>
          </div>
        )}
        {mode === 'loading' && <div className="text-white/50">준비 중...</div>}
      </div>

      <div className="grid flex-1 grid-cols-3 gap-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '확인'].map((k) => (
          <button
            key={k}
            onPointerDown={(e) => {
              e.preventDefault();
              press(k);
            }}
            disabled={mode !== 'input'}
            className={cx(
              'btn rounded-2xl border border-white/10 font-display text-3xl disabled:opacity-30',
              k === '확인' ? 'bg-gradient-to-r from-neon-blue to-neon-purple text-2xl' : 'bg-white/[0.07]',
            )}
          >
            {k}
          </button>
        ))}
      </div>
    </div>
  );
}

function ShowBar({ until }: { until: number }) {
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((x) => x + 1), 50);
    return () => clearInterval(t);
  }, []);
  const ratio = Math.max(0, Math.min(1, (until - Date.now()) / 3000));
  return (
    <div className="mt-3 h-2 w-40 overflow-hidden rounded-full bg-white/10">
      <div className="h-full bg-sky-400" style={{ width: `${ratio * 100}%` }} />
    </div>
  );
}
