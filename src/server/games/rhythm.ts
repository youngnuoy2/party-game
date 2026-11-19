// 리듬 마스터: 서버가 정한 박자표를 모든 화면이 서버 시각 기준으로 재생.
// 참가자는 터치 시각(서버 시계 기준, 단계 시작부터 ms)을 묶어서 전송 → 서버가 판정.
import { pick } from '../util';
import type { GameModule } from './types';

const LEAD_MS = 2500; // 첫 노트가 떨어져 내려오는 준비 시간
const TRAVEL_MS = 1500; // 노트가 화면 위에서 판정선까지 내려오는 시간
const WINDOWS = [
  { ms: 50, pts: 100, label: 'PERFECT' },
  { ms: 100, pts: 70, label: 'GREAT' },
  { ms: 150, pts: 40, label: 'GOOD' },
];
const EXTRA_PENALTY = 20;

interface Data {
  beats: number[];
  travelMs: number;
  bpm: number;
}
interface PState {
  taps: number[];
}

export function judge(beats: number[], taps: number[]) {
  const used = new Set<number>();
  const counts = { PERFECT: 0, GREAT: 0, GOOD: 0, MISS: 0 } as Record<string, number>;
  let sum = 0;
  for (const b of beats) {
    let best = -1;
    let bestD = Infinity;
    taps.forEach((t, i) => {
      if (used.has(i)) return;
      const d = Math.abs(t - b);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    const w = WINDOWS.find((x) => bestD <= x.ms);
    if (w && best >= 0) {
      used.add(best);
      sum += w.pts;
      counts[w.label]++;
    } else counts.MISS++;
  }
  const extra = taps.length - used.size;
  sum -= extra * EXTRA_PENALTY;
  return { sum: Math.max(0, sum), max: beats.length * 100, counts, extra };
}

export const rhythmGame: GameModule<Data, PState> = {
  id: 'rhythm',
  pausable: false,
  scoring: 'absolute',
  create() {
    const bpm = pick([100, 110, 120]);
    const beat = Math.round(60_000 / bpm);
    const beats: number[] = [];
    let t = LEAD_MS;
    while (beats.length < 18 && t < LEAD_MS + 10_500) {
      beats.push(t);
      // 대부분 4분음표, 가끔 8분음표(엇박)로 변화
      t += beats.length > 4 && Math.random() < 0.3 ? Math.round(beat / 2) : beat;
    }
    const duration = beats[beats.length - 1] + 1200;
    return { data: { beats, travelMs: TRAVEL_MS, bpm }, steps: [{ kind: 'play', durationMs: duration }] };
  },
  initPlayer() {
    return { taps: [] };
  },
  publicPayload(round) {
    return { beats: round.data.beats, travelMs: round.data.travelMs, bpm: round.data.bpm };
  },
  playerView(round, pid) {
    const p = round.players[pid];
    return p ? { tapCount: p.taps.length } : null;
  },
  onAction(round, pid, action, env) {
    const p = round.players[pid];
    if (!p) return { ok: false, error: '이번 라운드 참가자가 아닙니다' };
    if (!env.active) return { ok: false, error: '시간 종료' };
    if (action?.type !== 'taps' || !Array.isArray(action.times)) return { ok: false, error: 'bad action' };
    const serverElapsed = env.now - round.stepStartedAt;
    const last = p.taps[p.taps.length - 1] ?? -Infinity;
    const limit = round.data.beats.length * 3;
    for (const raw of action.times.slice(0, 40)) {
      const t = Math.round(Number(raw));
      // 미래 시각 / 너무 오래된 시각 / 순서 역전은 무시 (실시간으로 보낸 터치만 인정)
      if (!Number.isFinite(t) || t > serverElapsed + 150 || t < serverElapsed - 3000 || t <= last) continue;
      if (p.taps.length >= limit) break;
      p.taps.push(t);
    }
    return { ok: true, data: { tapCount: p.taps.length } };
  },
  submittedCount(round) {
    return Object.values(round.players).filter((p) => p.taps.length > 0).length;
  },
  liveBoard(round, nick) {
    const beats = round.data.beats;
    return Object.entries(round.players)
      .filter(([, p]) => p.taps.length)
      .map(([id, p]) => ({ id, s: judge(beats, p.taps).sum }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 5)
      .map((x) => ({ nickname: nick(x.id), value: `${x.s}점` }));
  },
  finalize(round) {
    const out: Record<string, { score: number; metric: string }> = {};
    for (const pid of round.participants) {
      const p = round.players[pid];
      if (!p) continue;
      if (!p.taps.length) {
        out[pid] = { score: 0, metric: '미참여' };
        continue;
      }
      const j = judge(round.data.beats, p.taps);
      out[pid] = {
        score: Math.round((1000 * j.sum) / j.max),
        metric: `P${j.counts.PERFECT} · G${j.counts.GREAT} · O${j.counts.GOOD} · 헛${j.extra}`,
      };
    }
    return out;
  },
};
