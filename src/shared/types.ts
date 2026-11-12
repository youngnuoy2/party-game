// 서버와 클라이언트가 공유하는 타입 정의

export const PHASES = [
  'LOBBY',
  'GAME_INTRO',
  'COUNTDOWN',
  'PLAYING',
  'CALCULATING',
  'ROUND_RESULT',
  'TOTAL_RANKING',
  'FINISHED',
] as const;
export type Phase = (typeof PHASES)[number];

export type GameId =
  | 'tap'
  | 'math'
  | 'nonsense'
  | 'chosung'
  | 'reaction'
  | 'ox'
  | 'color'
  | 'memory'
  | 'compare'
  | 'order'
  | 'typing'
  | 'sense'
  | 'target'
  | 'cups'
  | 'stop10'
  | 'shape'
  | 'rhythm';

export type MathDifficulty = 'easy' | 'normal' | 'hard';
export type ChosungMode = 'choice' | 'input';

export interface RoomSettings {
  title: string;
  totalRounds: number;
  enabledGames: GameId[];
  allowLateJoin: boolean;
  mathDifficulty: MathDifficulty;
  chosungMode: ChosungMode;
}

export interface PublicPlayer {
  id: string;
  nickname: string;
  connected: boolean;
  total: number;
  rank: number;
}

/** 라운드 결과 한 줄 */
export interface RoundEntry {
  playerId: string;
  nickname: string;
  rank: number;
  score: number; // 0~1000
  metric: string; // 사람이 읽는 기록 ("87회", "231ms" ...)
  total: number; // 라운드 반영 후 누적
  totalRank: number;
  prevTotalRank: number | null; // 이전 라운드 누적 순위 (첫 라운드면 null)
}

export interface RoundResult {
  roundNo: number;
  gameId: GameId;
  entries: RoundEntry[]; // 라운드 순위순
}

export interface RankingEntry {
  playerId: string;
  nickname: string;
  rank: number;
  total: number;
  prevRank: number | null;
  wins: number; // 라운드 1위 횟수
  lastScore: number;
}

export interface LiveBoardRow {
  nickname: string;
  value: string;
}

/** 모든 참가자/스크린이 받는 공개 상태 (정답 정보 없음) */
export interface PublicState {
  code: string;
  settings: RoomSettings;
  phase: Phase;
  roundNo: number;
  gameId: GameId | null;
  phaseStartedAt: number;
  phaseEndsAt: number | null; // 서버 시각 기준
  paused: boolean;
  pausedRemainMs: number | null;
  players: PublicPlayer[];
  playerCount: number;
  connectedCount: number;
  game: GamePublic | null;
  liveBoard: LiveBoardRow[];
  submitted: number; // 현재 문제/게임 제출 인원
  participantCount: number;
  roundResult: RoundResult | null;
  ranking: RankingEntry[];
  playedGames: GameId[];
  serverNow: number;
}

/** 게임 공개 정보: 현재 단계(step)와 게임별 공개 페이로드 */
export interface GamePublic {
  gameId: GameId;
  stepIndex: number;
  stepCount: number;
  stepKind: string;
  stepStartedAt: number;
  stepEndsAt: number;
  pausable: boolean;
  payload: any;
}

/** 각 참가자 개인에게만 보내는 정보 */
export interface MeState {
  playerId: string;
  nickname: string;
  total: number;
  rank: number;
  participating: boolean;
  view: any; // 게임별 개인 화면 데이터
  lastRound: RoundEntry | null;
}

export interface HostPlayer extends PublicPlayer {
  joinedAt: number;
  lastSeen: number;
}

export interface HostState {
  players: HostPlayer[];
  questionUsage: Record<string, number>;
}

export interface Ack<T = unknown> {
  ok: boolean;
  error?: string;
  data?: T;
}
