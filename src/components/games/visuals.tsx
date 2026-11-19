'use client';
// 휴대폰과 대형 스크린이 같은 서버 시각 기준으로 똑같이 재생하는 시각 요소
import { useEffect, useRef, useState } from 'react';
import { serverNow } from '@/lib/socket';
import { sfx } from '@/lib/sound';
import { ROLL_H, ROLL_W, START, type Course } from '@/shared/rollCourse';
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

// ───────────────────────── 경마 ─────────────────────────
export interface HorsePayload {
  horses: number;
  finish?: number[];
  curves?: number[][];
  counts?: number[];
  order?: number[] | null;
}
export const HORSE_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7'];

function horseProgress(p: HorsePayload, h: number, t: number) {
  if (!p.finish || !p.curves) return 0;
  const f = p.finish[h];
  if (t >= f) return 1;
  if (t <= 0) return 0;
  const seg = f / p.curves[h].length;
  const k = Math.floor(t / seg);
  const prev = k === 0 ? 0 : p.curves[h][k - 1];
  const next = p.curves[h][k];
  return prev + (next - prev) * ((t - k * seg) / seg);
}

// 결승선 위치 (레인 너비 %): 대형 화면은 오른쪽 순위 표시 바로 앞, 휴대폰은 좁아서 조금 앞쪽
const FINISH_X = { big: 85, small: 76 };
const START_X = 9; // 출발선 (말 코끝 기준)
const RUN_OUT = 3; // 결승선 통과 후 더 달려가는 거리

export function HorseTrack({ p, raceStartedAt, mine, big = false }: { p: HorsePayload; raceStartedAt: number | null; mine?: number | null; big?: boolean }) {
  const now = useFrameNow();
  const t = raceStartedAt ? now - raceStartedAt : 0;
  const finishX = big ? FINISH_X.big : FINISH_X.small;
  return (
    <div className={cx('relative w-full space-y-2 rounded-3xl border border-white/10 bg-gradient-to-r from-emerald-900/50 to-emerald-800/30 p-3', big && 'space-y-4 p-6')}>
      {Array.from({ length: p.horses }, (_, h) => {
        const f = p.finish?.[h];
        const finished = raceStartedAt != null && f != null && t >= f;
        // 말의 코끝 위치: 도착 순간 정확히 결승선, 도착 후에는 결승선을 지나 조금 더 달려가 멈춤
        const nose = !raceStartedAt
          ? START_X
          : finished
            ? finishX + Math.min(RUN_OUT, ((t - f!) / 600) * RUN_OUT)
            : START_X + horseProgress(p, h, t) * (finishX - START_X);
        // 도착 순위: 결승선을 넘은 말부터 실시간 표시
        const place = finished && p.finish ? p.finish.filter((x) => x <= f!).length : null;
        return (
          <div key={h} className={cx('relative flex items-center overflow-hidden rounded-full bg-black/25', big ? 'h-24' : 'h-12', mine === h && 'ring-4 ring-amber-300')}>
            <span className={cx('absolute left-3 z-10 font-display text-white/50', big ? 'text-4xl' : 'text-lg')}>{h + 1}</span>
            {/* 결승선 (체커 무늬) */}
            <div
              className={cx('absolute inset-y-0', big ? 'w-3' : 'w-2')}
              style={{ left: `${finishX}%`, background: 'repeating-conic-gradient(#fff 0 25%, #111 0 50%) 0 0 / 8px 8px' }}
            />
            {/* 말: 오른쪽 끝(코끝)이 위치 기준 */}
            <div className="absolute" style={{ left: `${nose}%` }}>
              <div className={cx('relative -translate-x-full leading-none', big ? 'text-7xl' : 'text-4xl')}>
                <span className="inline-block -scale-x-100">🏇</span>
                <span className="absolute -bottom-1 left-1/2 h-2 w-8 -translate-x-1/2 rounded-full" style={{ background: HORSE_COLORS[h] }} />
              </div>
            </div>
            {place ? (
              <span className={cx('absolute right-3 font-display', big ? 'text-5xl' : 'text-lg', place === 1 ? 'text-amber-300' : 'text-white/80')}>🏁{place}등</span>
            ) : (
              p.counts && <span className={cx('absolute right-3 text-white/60', big ? 'text-3xl' : 'text-sm')}>👥{p.counts[h]}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ───────────────────────── 버블팝 ─────────────────────────
export interface BubbleT {
  id: number;
  kind: 'blue' | 'gold' | 'red';
  x: number;
  size: number;
  spawnAt: number;
  riseMs: number;
}
const BUBBLE_STYLE: Record<BubbleT['kind'], string> = {
  blue: 'radial-gradient(circle at 30% 30%, #ffffff 0 10%, #7dd3fc 25%, #2563eb 85%)',
  gold: 'radial-gradient(circle at 30% 30%, #ffffff 0 10%, #fde68a 25%, #f59e0b 85%)',
  red: 'radial-gradient(circle at 30% 30%, #ffffff 0 10%, #fca5a5 25%, #dc2626 85%)',
};
const BUBBLE_LABEL = { blue: '+10', gold: '+50', red: '−30' };

export function BubbleField({ bubbles, stepStartedAt, popped, onPop, big = false }: { bubbles: BubbleT[]; stepStartedAt: number; popped?: Set<number>; onPop?: (b: BubbleT) => void; big?: boolean }) {
  const now = useFrameNow();
  const t = now - stepStartedAt;
  return (
    <div className={cx('relative w-full overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-sky-950/40 to-indigo-950/40', big ? 'h-[760px]' : 'min-h-[60dvh] flex-1')}>
      {bubbles.map((b) => {
        const age = t - b.spawnAt;
        if (age < 0 || age > b.riseMs || popped?.has(b.id)) return null;
        const y = 105 - (age / b.riseMs) * 120; // 아래 → 위
        return (
          <button
            key={b.id}
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              onPop?.(b);
            }}
            className={cx('absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full font-display text-white shadow-[0_0_18px_rgba(255,255,255,.35)]', big ? 'text-3xl' : 'text-sm')}
            style={{ left: `${b.x}%`, top: `${y}%`, width: `${b.size}%`, aspectRatio: '1', background: BUBBLE_STYLE[b.kind] }}
          >
            {BUBBLE_LABEL[b.kind]}
          </button>
        );
      })}
    </div>
  );
}

// ───────────────────────── 데굴데굴 코스 ─────────────────────────
export function RollCourse({ course, holeR, goalR, className, children }: { course: Course; holeR: number; goalR: number; className?: string; children?: React.ReactNode }) {
  return (
    <svg viewBox={`0 0 ${ROLL_W} ${ROLL_H}`} className={cx('rounded-2xl bg-gradient-to-b from-emerald-900/70 to-teal-950/70', className)} preserveAspectRatio="xMidYMid meet">
      <rect x={0.5} y={0.5} width={ROLL_W - 1} height={ROLL_H - 1} rx={3} fill="none" stroke="rgba(255,255,255,.4)" strokeWidth={1} />
      {/* 도착점 */}
      <circle cx={course.goal.x} cy={course.goal.y} r={goalR} fill="url(#goalg)" stroke="#fde68a" strokeWidth={0.8} />
      <text x={course.goal.x} y={course.goal.y + 2} textAnchor="middle" fontSize={6}>
        🏁
      </text>
      {/* 출발점 */}
      <circle cx={START.x} cy={START.y} r={4.5} fill="none" stroke="rgba(255,255,255,.35)" strokeDasharray="1.5 1.5" strokeWidth={0.6} />
      {course.walls.map((w, i) => (
        <rect key={i} x={w.x} y={w.y} width={w.w} height={w.h} rx={1} fill="#a16207" stroke="#fbbf24" strokeWidth={0.4} />
      ))}
      {course.holes.map((h, i) => (
        <circle key={i} cx={h.x} cy={h.y} r={holeR} fill="#020617" stroke="#475569" strokeWidth={0.6} />
      ))}
      <defs>
        <radialGradient id="goalg">
          <stop offset="0" stopColor="#fde68a" />
          <stop offset="1" stopColor="#f59e0b" />
        </radialGradient>
      </defs>
      {children}
    </svg>
  );
}
