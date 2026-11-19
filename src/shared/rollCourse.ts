// 데굴데굴 코스 정의 + 물리 상수 (서버 생성 / 클라이언트 시뮬레이션 공용)
export const ROLL_W = 100;
export const ROLL_H = 160;
export const BALL_R = 3.2;
export const HOLE_R = 4.5;
/** 구멍 위·아래로 공이 지나가려면 필요한 최소 틈 (공 지름 + 여유) */
export const PASS_GAP = BALL_R * 2 + 2;
export const GOAL_R = 7;
export const MAX_SPEED = 55; // 단위/초
export const START = { x: 50, y: 150 };

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Course {
  walls: Rect[];
  holes: { x: number; y: number }[];
  goal: { x: number; y: number };
}

/** 진행률 0~1: 출발(아래) → 도착(위) 세로 거리 기준 */
export function rollProgress(c: Course, y: number) {
  const span = START.y - c.goal.y;
  return Math.max(0, Math.min(1, (START.y - y) / span));
}

/** 공(원)과 사각형 벽 충돌 */
export function hitsRect(x: number, y: number, r: Rect) {
  const cx = Math.max(r.x, Math.min(x, r.x + r.w));
  const cy = Math.max(r.y, Math.min(y, r.y + r.h));
  return (x - cx) ** 2 + (y - cy) ** 2 < BALL_R ** 2;
}
