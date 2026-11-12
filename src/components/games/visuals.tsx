'use client';
// 휴대폰과 대형 스크린이 같은 서버 시각 기준으로 똑같이 재생하는 시각 요소
import { useEffect, useRef, useState } from 'react';
import { serverNow } from '@/lib/socket';
import { sfx } from '@/lib/sound';
import { cx } from '../ui';

function useFrameNow() {
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      setNow(serverNow());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return now;
}

// ───────────────────────── 컵 속 공 찾기 ─────────────────────────
export interface CupsPayload {
  index: number;
  total: number;
  n: number;
  swapMs: number;
  ball: number | null;
  swaps: [number, number][] | null;
  reveal?: { answer: number; dist: number[]; correctCount: number };
}

/** 컵 id → 슬롯 (k번째 교환까지 적용) */
function slotsAfter(n: number, swaps: [number, number][], k: number) {
  const slotOf = Array.from({ length: n }, (_, i) => i);
  for (let i = 0; i < k && i < swaps.length; i++) {
    const [a, b] = swaps[i];
    for (let c = 0; c < n; c++) {
      if (slotOf[c] === a) slotOf[c] = b;
      else if (slotOf[c] === b) slotOf[c] = a;
    }
  }
  return slotOf;
}

export function CupsBoard({
  p,
  stepKind,
  stepStartedAt,
  chosen,
  onPick,
  big = false,
}: {
  p: CupsPayload;
  stepKind: string;
  stepStartedAt: number;
  chosen?: number | null;
  onPick?: (slot: number) => void;
  big?: boolean;
}) {
  const now = useFrameNow();
  const swaps = p.swaps ?? [];
  const elapsed = Math.max(0, now - stepStartedAt);
  // 현재 교환 진행 상황
  let k = swaps.length;
  let frac = 1;
  if (stepKind === 'shuffle') {
    k = Math.min(swaps.length, Math.floor(elapsed / p.swapMs));
    frac = k >= swaps.length ? 1 : (elapsed - k * p.swapMs) / p.swapMs;
  } else if (stepKind === 'show') {
    k = 0;
    frac = 1;
  }
  const before = slotsAfter(p.n, swaps, k);
  const after = slotsAfter(p.n, swaps, k + 1);
  const ease = frac < 0.5 ? 2 * frac * frac : 1 - Math.pow(-2 * frac + 2, 2) / 2;

  // 공 위치(슬롯): 보여주기 단계는 p.ball, 공개 단계는 정답 슬롯
  const ballSlot = stepKind === 'show' ? p.ball : stepKind === 'reveal' ? p.reveal?.answer ?? null : null;
  const lastTick = useRef(-1);
  useEffect(() => {
    if (stepKind === 'shuffle' && k !== lastTick.current && k < swaps.length) {
      lastTick.current = k;
      sfx.tap();
    }
  }, [k, stepKind, swaps.length]);

  const W = 100 / p.n;
  return (
    <div className={cx('relative w-full select-none', big ? 'h-[420px]' : 'h-48')}>
      {Array.from({ length: p.n }, (_, cup) => {
        const moving = stepKind === 'shuffle' && k < swaps.length && before[cup] !== after[cup];
        const slot = moving ? before[cup] + (after[cup] - before[cup]) * ease : before[cup];
        const dir = moving ? (after[cup] > before[cup] ? -1 : 1) : 0;
        const arc = moving ? Math.sin(Math.PI * frac) * dir * (big ? 60 : 24) : 0;
        const finalSlot = before[cup];
        const lifted = ballSlot !== null && finalSlot === ballSlot && stepKind !== 'shuffle';
        const isChosen = chosen != null && chosen === finalSlot;
        const isAnswer = stepKind === 'reveal' && p.reveal?.answer === finalSlot;
        return (
          <button
            key={cup}
            type="button"
            disabled={!onPick || stepKind !== 'question'}
            onClick={() => onPick?.(finalSlot)}
            className="absolute bottom-0 flex flex-col items-center"
            style={{ left: `${slot * W}%`, width: `${W}%`, transform: `translateY(${arc}px)` }}
          >
            {/* 공 */}
            {lifted && (
              <div
                className={cx('absolute bottom-1 z-10 rounded-full border-white', big ? 'h-20 w-20 border-[6px]' : 'h-10 w-10 border-[3px]')}
                style={{
                  background: 'radial-gradient(circle at 35% 30%, #ffffff 0 18%, #a3ff3c 22%, #39ff14 60%, #16a34a 100%)',
                  boxShadow: '0 0 18px 6px rgba(57,255,20,.85), 0 0 50px rgba(57,255,20,.6)',
                }}
              />
            )}
            {/* 컵 */}
            <div
              className={cx(
                'relative transition-transform duration-300',
                big ? 'h-56 w-40' : 'h-28 w-20 max-w-[85%]',
                lifted && (big ? '-translate-y-28' : '-translate-y-14'),
              )}
              style={{
                clipPath: 'polygon(12% 0, 88% 0, 100% 100%, 0 100%)',
                background: isAnswer
                  ? 'linear-gradient(180deg,#4ade80,#15803d)'
                  : isChosen
                    ? 'linear-gradient(180deg,#38bdf8,#1d4ed8)'
                    : 'linear-gradient(180deg,#f87171,#b91c1c)',
                boxShadow: 'inset 0 -12px 0 rgba(0,0,0,.25)',
              }}
            >
              {stepKind === 'reveal' && p.reveal && (
                <span className={cx('absolute inset-x-0 bottom-2 text-center font-bold text-white', big ? 'text-4xl' : 'text-sm')}>{p.reveal.dist[finalSlot] ?? 0}명</span>
              )}
            </div>
            <div className={cx('mt-1 font-display text-white/60', big ? 'text-4xl' : 'text-lg')}>{finalSlot + 1}</div>
          </button>
        );
      })}
    </div>
  );
}

export function cupsCaption(stepKind: string) {
  return stepKind === 'show' ? '👀 공이 든 컵을 기억하세요!' : stepKind === 'shuffle' ? '🌀 섞는 중... 눈을 떼지 마세요!' : stepKind === 'question' ? '👉 공이 든 컵을 고르세요!' : '🎉 정답 공개';
}

// ───────────────────────── 리듬 마스터 ─────────────────────────
export interface RhythmPayload {
  beats: number[];
  travelMs: number;
  bpm: number;
}

export const HIT_LINE = 82; // 판정선 위치 (% from top)

export function RhythmLane({ p, stepStartedAt, big = false, metronome = false, flash }: { p: RhythmPayload; stepStartedAt: number; big?: boolean; metronome?: boolean; flash?: string | null }) {
  const now = useFrameNow();
  const t = now - stepStartedAt;
  const lastBeat = useRef(-1);
  useEffect(() => {
    if (!metronome) return;
    const idx = p.beats.findLastIndex((b) => b <= t);
    if (idx > lastBeat.current) {
      lastBeat.current = idx;
      if (idx >= 0) sfx.tick();
    }
  }, [t, metronome, p.beats]);
  return (
    <div className={cx('relative w-full overflow-hidden rounded-3xl border border-white/10 bg-black/40', big ? 'h-[620px]' : 'h-[46dvh]')}>
      <div className="absolute inset-x-0 border-t-4 border-amber-300 shadow-gold" style={{ top: `${HIT_LINE}%` }} />
      {p.beats.map((b, i) => {
        const dt = b - t; // 판정까지 남은 시간
        if (dt > p.travelMs || dt < -300) return null;
        const y = HIT_LINE - (dt / p.travelMs) * HIT_LINE;
        return (
          <div
            key={i}
            className={cx(
              'absolute left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-pink-400 to-fuchsia-600 shadow-[0_0_20px_rgba(236,72,153,.8)]',
              big ? 'h-24 w-24' : 'h-14 w-14',
              dt < 0 && 'opacity-40',
            )}
            style={{ top: `${y}%` }}
          />
        );
      })}
      {t < p.beats[0] - p.travelMs && (
        <div className={cx('absolute inset-0 flex items-center justify-center font-display text-white/70', big ? 'text-7xl' : 'text-3xl')}>곧 시작! 준비~</div>
      )}
      {flash && (
        <div key={flash + t} className={cx('absolute inset-x-0 text-center font-display text-amber-200', big ? 'text-6xl' : 'text-3xl')} style={{ top: `${HIT_LINE + 4}%` }}>
          {flash.split('#')[0]}
        </div>
      )}
    </div>
  );
}
