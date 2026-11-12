// 숫자 기억력: 참가자별로 레벨 진행. 정답은 서버가 판정.
import { rand } from '../util';
import type { GameModule } from './types';

const DURATION = 60_000;
const START_DIGITS = 4;
const MAX_DIGITS = 16;
const SHOW_MS = 3000;
const INPUT_LIMIT_MS = 15_000;

interface PState {
  level: number; // 이번에 도전할 자릿수
  best: number; // 성공한 최대 자릿수
  inputMsSum: number;
  successes: number;
  cur: { digits: string; shownAt: number } | null;
  done: boolean;
  lastFail: { expected: string; got: string } | null;
}

export const memoryGame: GameModule<{}, PState> = {
  id: 'memory',
  pausable: false,
  scoring: 'relative',
  create() {
    return { data: {}, steps: [{ kind: 'play', durationMs: DURATION }] };
  },
  initPlayer() {
    return { level: START_DIGITS, best: 0, inputMsSum: 0, successes: 0, cur: null, done: false, lastFail: null };
  },
  publicPayload() {
    return { showMs: SHOW_MS, startDigits: START_DIGITS };
  },
  playerView(round, pid) {
    const p = round.players[pid];
    if (!p) return null;
    return {
      level: p.level,
      best: p.best,
      done: p.done,
      showing: p.cur ? true : false,
      lastFail: p.lastFail,
      showMs: SHOW_MS,
    };
  },
  onAction(round, pid, action, env) {
    const p = round.players[pid];
    if (!p) return { ok: false, error: '이번 라운드 참가자가 아닙니다' };
    if (!env.active) return { ok: false, error: '시간 종료' };
    if (p.done) return { ok: false, error: '이미 종료되었습니다' };

    if (action?.type === 'next') {
      if (!p.cur) {
        let d = String(rand(1, 9));
        while (d.length < p.level) d += String(rand(0, 9));
        p.cur = { digits: d, shownAt: env.now };
      }
      // 재요청(새로고침) 시 같은 숫자를 다시 보여주지 않도록 경과시간을 반영
      const remain = Math.max(0, SHOW_MS - (env.now - p.cur.shownAt));
      return { ok: true, data: { digits: remain > 0 ? p.cur.digits : null, showMs: remain } };
    }

    if (action?.type === 'answer') {
      if (!p.cur) return { ok: false, error: '문제가 없습니다' };
      const got = String(action.value ?? '').replace(/\D/g, '').slice(0, 20);
      const inputMs = env.now - (p.cur.shownAt + SHOW_MS);
      const tooLate = inputMs > INPUT_LIMIT_MS + 1000;
      const correct = !tooLate && got === p.cur.digits;
      if (correct) {
        p.best = p.level;
        p.successes += 1;
        p.inputMsSum += Math.max(0, inputMs);
        p.level = Math.min(MAX_DIGITS, p.level + 1);
        if (p.best >= MAX_DIGITS) p.done = true;
        p.lastFail = null;
      } else {
        p.done = true;
        p.lastFail = { expected: p.cur.digits, got: tooLate ? '(시간 초과)' : got };
      }
      p.cur = null;
      return { ok: true, data: { correct, best: p.best, level: p.level, done: p.done, lastFail: p.lastFail } };
    }
    return { ok: false, error: 'bad action' };
  },
  submittedCount(round) {
    return Object.values(round.players).filter((p) => p.done).length;
  },
  liveBoard(round, nick) {
    return Object.entries(round.players)
      .filter(([, p]) => p.best > 0)
      .sort((a, b) => b[1].best - a[1].best)
      .slice(0, 5)
      .map(([id, p]) => ({ nickname: nick(id), value: `${p.best}자리` }));
  },
  finalize(round) {
    const out: Record<string, { perf: number; metric: string }> = {};
    for (const pid of round.participants) {
      const p = round.players[pid];
      if (!p) continue;
      if (p.best === 0) {
        out[pid] = { perf: 0, metric: '기록 없음' };
        continue;
      }
      const avgInput = p.inputMsSum / Math.max(1, p.successes);
      // 자릿수 우선, 동점이면 평균 입력속도가 빠를수록 소폭 가산 (1자리 차이를 넘지 않음)
      const speed = 1 - Math.min(avgInput, INPUT_LIMIT_MS) / INPUT_LIMIT_MS;
      out[pid] = { perf: p.best + 0.99 * speed, metric: `${p.best}자리 (평균 ${(avgInput / 1000).toFixed(1)}초)` };
    }
    return out;
  },
};
