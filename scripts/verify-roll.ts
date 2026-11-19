// 무작위 코스 1000개가 모두 출발 → 도착 가능한지 격자 BFS 로 검사 (공 반지름 + 구멍 반경 고려)
import { rollGame } from '../src/server/games/roll';
import { BALL_R, GOAL_R, HOLE_R, PASS_GAP, ROLL_H, ROLL_W, START, hitsRect, type Course } from '../src/shared/rollCourse';
const ok = (c: Course, x: number, y: number) =>
  x >= BALL_R && x <= ROLL_W - BALL_R && y >= BALL_R && y <= ROLL_H - BALL_R && !c.walls.some((w) => hitsRect(x, y, w)) && !c.holes.some((h) => Math.hypot(h.x - x, h.y - y) < HOLE_R + 0.5); // 게임보다 엄격하게 (구멍 가장자리도 피함)
let bad = 0;
let tight = 0;
let minT = Infinity;
for (let i = 0; i < 1000; i++) {
  const { data } = rollGame.create({} as any);
  const c = data.course;
  minT = Math.min(minT, data.minFinishMs);
  const seen = new Set<string>();
  const q: [number, number][] = [[START.x, START.y]];
  seen.add(`${START.x},${START.y}`);
  let reached = false;
  while (q.length) {
    const [x, y] = q.shift()!;
    if (Math.hypot(c.goal.x - x, c.goal.y - y) < GOAL_R) { reached = true; break; }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
      if (!seen.has(k) && ok(c, nx, ny)) { seen.add(k); q.push([nx, ny]); }
    }
  }
  if (!reached) { bad++; if (bad < 3) console.log('막힌 코스:', JSON.stringify(c)); }
  // 모든 구멍의 위·아래 틈이 공이 지나갈 만큼 넓은지 (구멍 x 범위에 걸친 벽/바닥까지 거리)
  for (const h of c.holes) {
    const over = c.walls.filter((w) => w.x < h.x + HOLE_R && w.x + w.w > h.x - HOLE_R);
    const above = Math.max(0, ...over.filter((w) => w.y + w.h <= h.y).map((w) => w.y + w.h));
    const below = Math.min(ROLL_H, ...over.filter((w) => w.y >= h.y).map((w) => w.y));
    const gapUp = h.y - HOLE_R - above;
    const gapDown = below - (h.y + HOLE_R);
    if (gapUp < PASS_GAP || gapDown < PASS_GAP) { tight++; if (tight < 3) console.log(`좁은 틈: 구멍 (${h.x},${h.y}) 위 ${gapUp.toFixed(1)} 아래 ${gapDown.toFixed(1)}`); }
  }
}
console.log(`코스 1000개 중 막힌 코스 ${bad}개 · 구멍 위아래 틈 부족 ${tight}개 · 최소 도착 기준 최솟값 ${(minT / 1000).toFixed(1)}초`);
process.exit(bad || tight ? 1 : 0);
