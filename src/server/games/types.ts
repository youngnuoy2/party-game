import type { GameId, LiveBoardRow, RoomSettings } from '../../shared/types';

export interface StepDef {
  kind: string; // 'play' | 'question' | 'reveal' ...
  durationMs: number;
  index?: number; // 문제 번호 등
}

/** 라운드 런타임 상태 (JSON 직렬화 가능해야 함 → 서버 재시작 시 복구) */
export interface Round<D = any, P = any> {
  no: number;
  gameId: GameId;
  data: D;
  players: Record<string, P>;
  participants: string[];
  steps: StepDef[];
  stepIndex: number;
  stepStartedAt: number;
  stepEndsAt: number;
}

export interface CreateCtx {
  settings: RoomSettings;
  participants: string[];
  /** 문제 은행에서 이번 대회에 아직 안 쓴 문제를 우선으로 n개 선택 */
  takeQuestions<T extends { id: string }>(bank: string, pool: T[], n: number): T[];
}

export interface ActionEnv {
  now: number;
  /** 현재 단계가 진행 중인지 (일시정지 아님 + 마감 + 유예시간 이내) */
  active: boolean;
  emitTo(playerId: string, payload: unknown): void;
  /** 서버 타이머 (라운드가 끝나거나 취소되면 자동 무효) */
  schedule(ms: number, fn: () => void): void;
  /** 상태 변경 알림 (개인 화면 갱신) */
  touch(playerId: string): void;
}

export interface FinalEntry {
  /** relative 모드: 높을수록 좋은 성과 (1등 대비로 0~1000 환산) */
  perf?: number;
  /** absolute 모드: 이미 0~1000 으로 계산된 점수 */
  score?: number;
  metric: string;
}

export interface ActionResult {
  ok: boolean;
  error?: string;
  data?: unknown;
}

export interface GameModule<D = any, P = any> {
  id: GameId;
  pausable: boolean;
  scoring: 'relative' | 'absolute';
  create(ctx: CreateCtx): { data: D; steps: StepDef[] };
  initPlayer(round: Round<D, P>, playerId: string): P;
  onStepStart?(round: Round<D, P>, env: ActionEnv): void;
  publicPayload(round: Round<D, P>): unknown;
  playerView(round: Round<D, P>, playerId: string, now: number): unknown;
  onAction(round: Round<D, P>, playerId: string, action: any, env: ActionEnv): ActionResult;
  submittedCount(round: Round<D, P>): number;
  liveBoard?(round: Round<D, P>, nick: (id: string) => string): LiveBoardRow[];
  finalize(round: Round<D, P>): Record<string, FinalEntry>;
}

/** 지연시간 보정용 유예 (마감 후에도 이 시간 안에 도착한 제출은 인정) */
export const GRACE_MS = 600;
