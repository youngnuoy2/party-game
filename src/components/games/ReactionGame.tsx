'use client';
import { useEffect, useRef, useState } from 'react';
import { getSocket, serverNow } from '@/lib/socket';
import { sfx, vibrate } from '@/lib/sound';
import { cx } from '../ui';
import type { GameProps } from './common';

type Mode = 'idle' | 'wait' | 'go' | 'result' | 'done';

export default function ReactionGame({ state, me, act }: GameProps) {
  const g = state.game!;
  const v = me.view as { trials: number; results: string[]; attempt: number; done: boolean } | null;
  const [mode, setMode] = useState<Mode>('idle');
  const [msg, setMsg] = useState('');
  const [results, setResults] = useState<string[]>(v?.results ?? []);
  const attempt = useRef(v?.attempt ?? 0);
  const goAt = useRef(0);
  const modeRef = useRef<Mode>('idle');
  const trials = v?.trials ?? 3;

  const setM = (m: Mode) => {
    modeRef.current = m;
    setMode(m);
  };

  const ready = async () => {
    if (attempt.current >= trials || serverNow() > g.stepEndsAt) {
      setM('done');
      return;
    }
    setM('wait');
    const r = await act({ type: 'ready', attempt: attempt.current });
    if (!r.ok) {
      setMsg(r.error ?? '');
      setM('done');
    }
  };

  // 서버의 GO 신호 수신 (각자 다른 무작위 시점)
  useEffect(() => {
    const s = getSocket();
    const onPush = (p: { type: string; attempt: number }) => {
      if (p.type === 'go' && p.attempt === attempt.current && modeRef.current === 'wait') {
        goAt.current = performance.now();
        setM('go');
        sfx.go();
      }
    };
    s.on('game:push', onPush);
    return () => {
      s.off('game:push', onPush);
    };
  }, []);

  // 시작 시 자동으로 첫 시도 준비
  useEffect(() => {
    if (v && v.done) setM('done');
    else ready();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finishTrial = (label: string) => {
    attempt.current += 1;
    setResults((r) => [...r, label]);
    setMsg(label);
    setM('result');
    setTimeout(() => ready(), 1400);
  };

  const onTouch = async () => {
    const m = modeRef.current;
    if (m === 'wait') {
      setM('result');
      vibrate([80, 40, 80]);
      sfx.wrong();
      await act({ type: 'foul', attempt: attempt.current });
      finishTrial('반칙! 너무 빨랐어요 🚫');
    } else if (m === 'go') {
      const ms = Math.round(performance.now() - goAt.current);
      setM('result');
      vibrate(30);
      const r = await act({ type: 'hit', attempt: attempt.current, ms });
      const label = r.ok ? String((r.data as any)?.result ?? `${ms}ms`) : `${ms}ms`;
      finishTrial(label === '반칙' ? '반칙! 🚫' : label);
    }
  };

  const bg =
    mode === 'wait' ? 'bg-rose-600' : mode === 'go' ? 'bg-emerald-500' : mode === 'result' ? 'bg-indigo-700' : 'bg-ink-800';

  return (
    <div className="flex flex-1 flex-col gap-3 touch-game">
      <div className="flex justify-center gap-2">
        {Array.from({ length: trials }, (_, i) => (
          <span key={i} className={cx('chip', results[i] && 'border-neon-blue/40')}>
            {i + 1}차: {results[i] ?? '-'}
          </span>
        ))}
      </div>
      <button
        onPointerDown={(e) => {
          e.preventDefault();
          onTouch();
        }}
        className={cx('flex min-h-[60dvh] flex-1 flex-col items-center justify-center rounded-[2rem] text-center text-white transition-colors duration-75', bg)}
      >
        {mode === 'wait' && (
          <>
            <div className="font-display text-5xl">기다리세요...</div>
            <div className="mt-3 text-lg text-white/80">초록색이 되면 터치!</div>
          </>
        )}
        {mode === 'go' && <div className="font-display text-7xl">지금 터치!</div>}
        {mode === 'result' && <div className="font-display text-5xl">{msg}</div>}
        {mode === 'idle' && <div className="font-display text-4xl">준비하세요</div>}
        {mode === 'done' && (
          <>
            <div className="font-display text-4xl">측정 완료!</div>
            <div className="mt-3 text-white/70">{msg || '다른 참가자를 기다리는 중...'}</div>
          </>
        )}
      </button>
    </div>
  );
}
