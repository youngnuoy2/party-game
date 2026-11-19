'use client';
import { useEffect, useRef, useState } from 'react';
import { serverNow } from '@/lib/socket';
import { sfx, vibrate } from '@/lib/sound';
import { BALL_R, HOLE_R, GOAL_R, MAX_SPEED, ROLL_H, ROLL_W, START, hitsRect, rollProgress, type Course } from '@/shared/rollCourse';
import { cx, SecondsLeft, TimerBar } from '../ui';
import type { GameProps } from './common';
import { RollCourse } from './visuals';

type Mode = 'checking' | 'permission' | 'sensor' | 'touch';
const ACCEL = 140; // 기울기 최대일 때 가속도 (단위/초²)
const TILT_FULL = 22; // 이 각도(도)만큼 기울이면 최대 가속

export default function RollGame({ state, me, act, setView }: GameProps) {
  const g = state.game!;
  const pl = g.payload as { course: Course; holeR: number; goalR: number };
  const v = me.view as { progress: number; finishMs: number | null; falls: number } | null;
  const [mode, setMode] = useState<Mode>('checking');
  const [msg, setMsg] = useState<string | null>(null);
  const [finished, setFinished] = useState<number | null>(v?.finishMs ?? null);
  const ballRef = useRef<SVGCircleElement>(null);
  const tilt = useRef({ x: 0, y: 0 });
  const base = useRef<{ b: number; g: number } | null>(null);
  const sim = useRef({ x: START.x, y: START.y, vx: 0, vy: 0, best: v?.progress ?? 0, frozenUntil: 0, falls: 0, done: v?.finishMs != null });
  const keys = useRef(new Set<string>());
  const drag = useRef<{ x: number; y: number } | null>(null);

  // ── 기울기 센서 ──
  const onOrient = useRef((e: DeviceOrientationEvent) => {
    if (e.beta == null || e.gamma == null) return;
    if (!base.current) base.current = { b: e.beta, g: e.gamma };
    tilt.current = {
      x: Math.max(-1, Math.min(1, (e.gamma - base.current.g) / TILT_FULL)),
      y: Math.max(-1, Math.min(1, (e.beta - base.current.b) / TILT_FULL)),
    };
    setMode((m) => (m === 'checking' || m === 'permission' ? 'sensor' : m));
  });

  const listen = () => {
    window.addEventListener('deviceorientation', onOrient.current);
    // 1.2초 안에 센서 값이 안 오면 터치 조작으로 전환
    setTimeout(() => setMode((m) => (m === 'checking' ? 'touch' : m)), 1200);
  };

  useEffect(() => {
    const DOE = typeof window !== 'undefined' ? (window as any).DeviceOrientationEvent : undefined;
    if (!DOE) setMode('touch');
    else if (typeof DOE.requestPermission === 'function') setMode('permission'); // iOS: 사용자 터치로 권한 요청 필요
    else listen();
    const kd = (e: KeyboardEvent) => keys.current.add(e.key);
    const ku = (e: KeyboardEvent) => keys.current.delete(e.key);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    const handler = onOrient.current;
    return () => {
      window.removeEventListener('deviceorientation', handler);
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const askPermission = async () => {
    try {
      const r = await (window as any).DeviceOrientationEvent.requestPermission();
      if (r === 'granted') {
        setMode('checking');
        listen();
      } else setMode('touch');
    } catch {
      setMode('touch');
    }
  };

  // ── 물리 루프 ──
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let lastReport = 0;
    const s = sim.current;
    const c = pl.course;
    const report = (fell = false) => act({ type: 'progress', p: s.best, fell }).then((r) => r.ok && setView(r.data));

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const ended = serverNow() > g.stepEndsAt;
      if (!s.done && !ended && now > s.frozenUntil) {
        // 입력: 키보드 > 드래그 > 센서
        let ax = tilt.current.x;
        let ay = tilt.current.y;
        const k = keys.current;
        if (k.size) {
          ax = (k.has('ArrowRight') ? 1 : 0) - (k.has('ArrowLeft') ? 1 : 0);
          ay = (k.has('ArrowDown') ? 1 : 0) - (k.has('ArrowUp') ? 1 : 0);
        }
        s.vx += ax * ACCEL * dt;
        s.vy += ay * ACCEL * dt;
        const fr = 1 - Math.min(1, 1.1 * dt);
        s.vx *= fr;
        s.vy *= fr;
        const sp = Math.hypot(s.vx, s.vy);
        if (sp > MAX_SPEED) {
          s.vx *= MAX_SPEED / sp;
          s.vy *= MAX_SPEED / sp;
        }
        // x, y 축을 따로 이동하며 벽 충돌 처리 (부딪히면 살짝 튕김)
        const blocked = (x: number, y: number) => x < BALL_R || x > ROLL_W - BALL_R || y < BALL_R || y > ROLL_H - BALL_R || c.walls.some((w) => hitsRect(x, y, w));
        const nx = s.x + s.vx * dt;
        if (blocked(nx, s.y)) s.vx = -s.vx * 0.3;
        else s.x = nx;
        const ny = s.y + s.vy * dt;
        if (blocked(s.x, ny)) s.vy = -s.vy * 0.3;
        else s.y = ny;
        s.best = Math.max(s.best, rollProgress(c, s.y));

        // 구멍
        if (c.holes.some((h) => Math.hypot(h.x - s.x, h.y - s.y) < HOLE_R - 1)) {
          s.falls += 1;
          s.x = START.x;
          s.y = START.y;
          s.vx = s.vy = 0;
          s.frozenUntil = now + 700;
          vibrate([120, 60, 120]);
          sfx.wrong();
          setMsg('퐁당! 출발점으로 😵');
          setTimeout(() => setMsg(null), 900);
          report(true);
        }
        // 도착
        if (Math.hypot(c.goal.x - s.x, c.goal.y - s.y) < GOAL_R) {
          s.done = true;
          const t = serverNow() - g.stepStartedAt;
          report().then(() =>
            act({ type: 'finish', t }).then((r) => {
              if (r.ok) {
                setView(r.data);
                setFinished(t);
                sfx.fanfare();
                vibrate([50, 50, 200]);
              } else {
                s.done = false;
                setMsg(r.error ?? '');
              }
            }),
          );
        }
        if (now - lastReport > 400) {
          lastReport = now;
          report();
        }
      }
      if (ballRef.current) {
        ballRef.current.setAttribute('cx', String(s.x));
        ballRef.current.setAttribute('cy', String(s.y));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 터치 조이스틱 (센서가 없을 때) ──
  const onDown = (e: React.PointerEvent) => {
    if (mode !== 'touch') return;
    drag.current = { x: e.clientX, y: e.clientY };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (mode !== 'touch' || !drag.current) return;
    tilt.current = {
      x: Math.max(-1, Math.min(1, (e.clientX - drag.current.x) / 50)),
      y: Math.max(-1, Math.min(1, (e.clientY - drag.current.y) / 50)),
    };
  };
  const onUp = () => {
    drag.current = null;
    if (mode === 'touch') tilt.current = { x: 0, y: 0 };
  };

  return (
    <div className="flex flex-1 flex-col gap-2 touch-game">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="chip">
            {finished != null ? `🏁 ${(finished / 1000).toFixed(2)}초` : `진행 ${Math.round((v?.progress ?? 0) * 100)}%`} · 🕳️ {v?.falls ?? 0}
          </span>
          <span className="chip text-xs">{mode === 'sensor' ? '📱 기울기' : mode === 'touch' ? '👆 드래그' : '...'}</span>
          <SecondsLeft endsAt={g.stepEndsAt} className="font-display text-2xl" />
        </div>
        <TimerBar startedAt={g.stepStartedAt} endsAt={g.stepEndsAt} />
      </div>
      <div className="relative flex flex-1 justify-center" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <RollCourse course={pl.course} holeR={pl.holeR} goalR={pl.goalR} className="h-[64dvh] w-auto max-w-full">
          <circle ref={ballRef} cx={START.x} cy={START.y} r={BALL_R} fill="url(#ballg)" stroke="#fff" strokeWidth={0.6} />
          <defs>
            <radialGradient id="ballg" cx="0.35" cy="0.35">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="0.4" stopColor="#7dd3fc" />
              <stop offset="1" stopColor="#1d4ed8" />
            </radialGradient>
          </defs>
        </RollCourse>
        {msg && <div className="pointer-events-none absolute inset-x-0 top-1/3 text-center font-display text-4xl text-amber-200 drop-shadow">{msg}</div>}
        {finished != null && <div className="pointer-events-none absolute inset-x-0 top-1/3 text-center font-display text-5xl text-emerald-300 drop-shadow">도착! 🎉</div>}
        {mode === 'permission' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-2xl bg-black/70 p-6 text-center">
            <div className="text-5xl">📱</div>
            <div className="text-lg">폰을 기울여서 조작하려면 센서를 켜 주세요</div>
            <button className="btn-gold w-full py-4 text-xl" onClick={askPermission}>
              기울기 센서 켜기
            </button>
            <button className="btn-ghost w-full" onClick={() => setMode('touch')}>
              그냥 화면 드래그로 할래요
            </button>
          </div>
        )}
      </div>
      <div className="flex items-center justify-center gap-2 text-xs text-white/50">
        {mode === 'sensor' ? (
          <>
            폰을 평평하게 들고 기울여 보세요
            <button className="chip text-xs" onClick={() => (base.current = null)}>
              기준 다시 잡기
            </button>
          </>
        ) : (
          '화면을 누른 채 굴리고 싶은 방향으로 드래그 (PC는 방향키)'
        )}
      </div>
    </div>
  );
}
