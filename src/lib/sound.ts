'use client';
// 효과음: 외부 파일 없이 Web Audio 로 합성 (로딩/저작권 문제 없음)

let ctx: AudioContext | null = null;
let enabled = true;

try {
  enabled = typeof window !== 'undefined' ? localStorage.getItem('sound') !== 'off' : true;
} catch {}

export const isSoundOn = () => enabled;
export function setSound(on: boolean) {
  enabled = on;
  try {
    localStorage.setItem('sound', on ? 'on' : 'off');
  } catch {}
  if (on) unlockAudio();
}

/** iOS 는 사용자 터치 이후에만 오디오 재생 가능 → 첫 터치 시 호출 */
export function unlockAudio() {
  if (typeof window === 'undefined') return;
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch {}
}

function tone(freq: number, dur = 0.1, type: OscillatorType = 'sine', vol = 0.15, delay = 0, slideTo?: number) {
  if (!enabled || !ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export const sfx = {
  tap: () => tone(660 + Math.random() * 120, 0.05, 'square', 0.06),
  click: () => tone(520, 0.06, 'triangle', 0.1),
  tick: () => tone(880, 0.08, 'square', 0.1),
  go: () => {
    tone(523, 0.12, 'square', 0.12);
    tone(784, 0.25, 'square', 0.12, 0.1);
  },
  correct: () => {
    tone(784, 0.1, 'triangle', 0.15);
    tone(1175, 0.18, 'triangle', 0.15, 0.08);
  },
  wrong: () => tone(220, 0.25, 'sawtooth', 0.1, 0, 110),
  end: () => {
    tone(880, 0.15, 'square', 0.1);
    tone(660, 0.15, 'square', 0.1, 0.15);
    tone(440, 0.3, 'square', 0.1, 0.3);
  },
  drum: () => {
    for (let i = 0; i < 14; i++) tone(120 + Math.random() * 40, 0.06, 'triangle', 0.18, i * 0.07);
  },
  fanfare: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.15, i * 0.12));
    tone(1047, 0.6, 'square', 0.08, 0.5);
  },
  join: () => tone(990, 0.08, 'sine', 0.08),
};

export function vibrate(pattern: number | number[]) {
  try {
    if (enabled && typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern);
  } catch {}
}
