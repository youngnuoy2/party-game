'use client';
// 넌센스 / 초성 / OX (전원 동시 진행 퀴즈)
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { sfx, vibrate } from '@/lib/sound';
import { cx, SecondsLeft, TimerBar } from '../ui';
import type { GameProps } from './common';

interface Payload {
  index: number;
  total: number;
  prompt: string;
  hint?: string;
  big?: string;
  choices: string[] | null;
  inputMode: boolean;
  reveal?: { correctIndex: number | null; answerText: string; explain: string; dist: number[]; correctCount: number; answered: number };
}

export default function QuizGame({ state, me, act, setView }: GameProps) {
  const g = state.game!;
  const p = g.payload as Payload;
  const v = me.view as { index: number; submitted: { choice: number | null; text: string | null } | null; result: { correct: boolean; points: number; missed?: boolean } | null } | null;
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isReveal = g.stepKind === 'reveal';
  const submitted = v && v.index === p.index ? v.submitted : null;
  const result = v && v.index === p.index ? v.result : null;
  const played = useRef<number>(-1);

  useEffect(() => {
    setText('');
    setErr(null);
  }, [p.index]);

  useEffect(() => {
    if (isReveal && result && played.current !== p.index) {
      played.current = p.index;
      if (result.correct) {
        sfx.correct();
        vibrate([30, 30, 60]);
      } else sfx.wrong();
    }
  }, [isReveal, result, p.index]);

  const submit = async (choice: number | null, txt?: string) => {
    if (busy || submitted || isReveal) return;
    setBusy(true);
    sfx.click();
    const r = await act({ type: 'answer', index: p.index, choice, text: txt });
    setBusy(false);
    if (r.ok) setView(r.data);
    else setErr(r.error ?? '제출 실패');
  };

  const isOX = g.gameId === 'ox';

  return (
    <div className="flex flex-1 flex-col gap-4 touch-game">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="chip">
            문제 {p.index + 1} / {p.total}
          </span>
          {p.hint && <span className="chip">🏷️ {p.hint}</span>}
          {!isReveal && <SecondsLeft endsAt={g.stepEndsAt} paused={state.paused} pausedRemain={state.pausedRemainMs} className="font-display text-2xl" />}
        </div>
        {!isReveal && <TimerBar startedAt={g.stepStartedAt} endsAt={g.stepEndsAt} paused={state.paused} pausedRemain={state.pausedRemainMs} />}
      </div>

      <motion.div key={p.index} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="card p-5 text-center">
        {p.big ? (
          <>
            <div className="text-sm text-white/50">{p.prompt}</div>
            <div className="mt-2 font-display text-6xl tracking-[0.25em] text-emerald-300 drop-shadow-[0_0_20px_rgba(52,211,153,.5)]">{p.big}</div>
          </>
        ) : (
          <div className="text-2xl font-bold leading-snug">{p.prompt}</div>
        )}
      </motion.div>

      {state.paused && <div className="card p-3 text-center text-amber-200">⏸ 사회자가 잠시 멈췄어요</div>}

      {/* 보기 */}
      {p.choices ? (
        <div className={cx('grid flex-1 gap-3', isOX ? 'grid-cols-2' : 'grid-cols-1')}>
          {p.choices.map((c, i) => {
            const mine = submitted?.choice === i;
            const correct = isReveal && p.reveal?.correctIndex === i;
            const wrongMine = isReveal && mine && !correct;
            return (
              <button
                key={i}
                onClick={() => submit(i)}
                disabled={!!submitted || isReveal || busy || state.paused}
                className={cx(
                  'btn relative rounded-3xl border-2 text-left font-bold transition-all',
                  isOX ? 'min-h-[10rem] justify-center font-display text-8xl' : 'min-h-[4rem] justify-start px-5 text-xl',
                  correct
                    ? 'border-emerald-400 bg-emerald-500/30 text-white shadow-[0_0_30px_rgba(52,211,153,.5)] disabled:opacity-100'
                    : wrongMine
                      ? 'border-rose-400 bg-rose-500/25 disabled:opacity-100'
                      : mine
                        ? 'border-neon-blue bg-neon-blue/25 disabled:opacity-100'
                        : 'border-white/10 bg-white/[0.06] disabled:opacity-60',
                  isOX && i === 0 && !correct && !mine && 'text-sky-300',
                  isOX && i === 1 && !correct && !mine && 'text-rose-300',
                )}
              >
                {!isOX && <span className="mr-3 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-base">{i + 1}</span>}
                <span>{c}</span>
                {isReveal && p.reveal && !isOX && <span className="ml-auto pl-2 text-sm text-white/50">{p.reveal.dist[i] ?? 0}명</span>}
                {isReveal && p.reveal && isOX && <span className="absolute bottom-2 text-base text-white/60">{p.reveal.dist[i] ?? 0}명</span>}
              </button>
            );
          })}
        </div>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) submit(null, text);
          }}
        >
          <input
            className="input text-center text-2xl"
            placeholder="정답 입력 (띄어쓰기 무관)"
            value={submitted?.text ?? text}
            onChange={(e) => setText(e.target.value)}
            disabled={!!submitted || isReveal || state.paused}
            autoComplete="off"
            enterKeyHint="send"
          />
          <button className="btn-primary w-full py-4 text-xl" disabled={!!submitted || isReveal || busy || !text.trim()}>
            제출
          </button>
        </form>
      )}

      {err && !submitted && <div className="text-center text-sm text-rose-300">{err}</div>}

      <AnimatePresence mode="wait">
        {!isReveal && submitted && (
          <motion.div key="wait" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card p-4 text-center text-white/70">
            ✅ 제출 완료! 정답 공개를 기다려 주세요
          </motion.div>
        )}
        {isReveal && p.reveal && (
          <motion.div key="reveal" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="card space-y-2 p-4 text-center">
            <div className={cx('font-display text-3xl', result?.correct ? 'text-emerald-300' : 'text-rose-300')}>
              {result?.correct ? `정답! +${result.points}` : result?.missed ? '시간 초과 😢' : '아쉬워요 😢'}
            </div>
            <div className="text-lg">
              정답: <b className="text-amber-200">{p.reveal.answerText}</b>
            </div>
            <div className="text-sm text-white/60">{p.reveal.explain}</div>
            <div className="text-xs text-white/40">
              정답자 {p.reveal.correctCount} / {p.reveal.answered}명
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
