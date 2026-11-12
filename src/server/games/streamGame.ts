// "개인별 연속 문제" 게임 공통 로직 (사칙연산 / 색깔 함정 / 숫자 비교)
// - 각 참가자는 자기 속도로 문제를 풀고, 정답 판정은 서버에서만 수행
// - 문제의 정답은 서버에만 존재하고, 클라이언트에는 보기만 전송
import type { GameId, RoomSettings } from '../../shared/types';
import { clamp } from '../util';
import type { GameModule, Round } from './types';

export interface StreamQuestion {
  pub: Record<string, unknown>; // 클라이언트로 전송할 문제 (정답 제외)
  answer: number; // 정답 보기 인덱스
}

interface PState {
  seq: number;
  cur: { id: number; pub: Record<string, unknown>; answer: number; issuedAt: number } | null;
  correct: number;
  wrong: number;
  points: number;
  lockedUntil: number;
  last: { correct: boolean; answer: number; chosen: number; gain: number } | null;
  streak: number;
}

interface Opts {
  id: GameId;
  durationMs: number;
  wrongLockMs: number;
  gen(settings: RoomSettings): StreamQuestion;
}

const CORRECT_BASE = 100;
const SPEED_BONUS_MAX = 50;
const WRONG_PENALTY = 30;

export function makeStreamGame(o: Opts): GameModule<{ settings: RoomSettings }, PState> {
  const issue = (round: Round<{ settings: RoomSettings }, PState>, p: PState, now: number) => {
    const q = o.gen(round.data.settings);
    p.seq += 1;
    p.cur = { id: p.seq, pub: q.pub, answer: q.answer, issuedAt: now };
  };

  const mod: GameModule<{ settings: RoomSettings }, PState> = {
    id: o.id,
    pausable: false,
    scoring: 'relative',
    create(ctx) {
      return { data: { settings: ctx.settings }, steps: [{ kind: 'play', durationMs: o.durationMs }] };
    },
    initPlayer() {
      return { seq: 0, cur: null, correct: 0, wrong: 0, points: 0, lockedUntil: 0, last: null, streak: 0 };
    },
    onStepStart(round, env) {
      for (const pid of round.participants) {
        const p = round.players[pid];
        if (p && !p.cur) issue(round, p, env.now);
      }
    },
    publicPayload() {
      return {};
    },
    playerView(round, pid) {
      const p = round.players[pid];
      if (!p) return null;
      return {
        q: p.cur ? { id: p.cur.id, ...p.cur.pub } : null,
        correct: p.correct,
        wrong: p.wrong,
        points: Math.max(0, p.points),
        lockedUntil: p.lockedUntil,
        last: p.last,
        streak: p.streak,
      };
    },
    onAction(round, pid, action, env) {
      const p = round.players[pid];
      if (!p) return { ok: false, error: '이번 라운드 참가자가 아닙니다' };
      if (!env.active) return { ok: false, error: '시간 종료' };
      if (action?.type !== 'answer') return { ok: false, error: 'bad action' };
      if (!p.cur || action.qid !== p.cur.id) return { ok: false, error: '이미 처리된 문제입니다' };
      if (env.now < p.lockedUntil - 100) return { ok: false, error: '잠시 대기' };
      const choice = Number(action.choice);
      const isCorrect = choice === p.cur.answer;
      let gain: number;
      if (isCorrect) {
        const sec = (env.now - Math.max(p.cur.issuedAt, p.lockedUntil)) / 1000;
        const bonus = Math.round(SPEED_BONUS_MAX * clamp((6 - sec) / 5, 0, 1));
        gain = CORRECT_BASE + bonus;
        p.correct += 1;
        p.streak += 1;
      } else {
        gain = -WRONG_PENALTY;
        p.wrong += 1;
        p.streak = 0;
        p.lockedUntil = env.now + o.wrongLockMs;
      }
      p.points += gain;
      p.last = { correct: isCorrect, answer: p.cur.answer, chosen: choice, gain };
      issue(round, p, env.now);
      return { ok: true, data: mod.playerView(round, pid, env.now) };
    },
    submittedCount(round) {
      return Object.values(round.players).filter((p) => p.correct + p.wrong > 0).length;
    },
    liveBoard(round, nick) {
      return Object.entries(round.players)
        .filter(([, p]) => p.correct + p.wrong > 0)
        .sort((a, b) => b[1].points - a[1].points)
        .slice(0, 5)
        .map(([id, p]) => ({ nickname: nick(id), value: `${p.correct}문제` }));
    },
    finalize(round) {
      const out: Record<string, { perf: number; metric: string }> = {};
      for (const pid of round.participants) {
        const p = round.players[pid];
        if (!p) continue;
        const total = p.correct + p.wrong;
        const acc = total ? Math.round((p.correct / total) * 100) : 0;
        out[pid] = {
          perf: Math.max(0, p.points),
          metric: total ? `${p.correct}개 정답 (정확도 ${acc}%)` : '미응답',
        };
      }
      return out;
    },
  };
  return mod;
}
