// 도형 퍼즐용 폴리오미노 회전 유틸 (서버 판정 + 클라이언트 표시 공용)
export type Cell = [number, number];

export function normalize(cells: Cell[]): Cell[] {
  const mx = Math.min(...cells.map((c) => c[0]));
  const my = Math.min(...cells.map((c) => c[1]));
  return cells.map(([x, y]) => [x - mx, y - my] as Cell).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}

/** 시계 방향 90도 × k 회전 */
export function rotate(cells: Cell[], k: number): Cell[] {
  let out = cells;
  for (let i = 0; i < ((k % 4) + 4) % 4; i++) out = out.map(([x, y]) => [-y, x] as Cell);
  return normalize(out);
}

export const sameShape = (a: Cell[], b: Cell[]) => JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));

export const POLYOMINOES: { name: string; cells: Cell[]; hard: boolean }[] = [
  { name: 'T', cells: [[0, 0], [1, 0], [2, 0], [1, 1]], hard: false },
  { name: 'L', cells: [[0, 0], [0, 1], [0, 2], [1, 2]], hard: false },
  { name: 'J', cells: [[1, 0], [1, 1], [1, 2], [0, 2]], hard: false },
  { name: 'S', cells: [[1, 0], [2, 0], [0, 1], [1, 1]], hard: false },
  { name: 'Z', cells: [[0, 0], [1, 0], [1, 1], [2, 1]], hard: false },
  { name: 'P', cells: [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2]], hard: true },
  { name: 'F', cells: [[1, 0], [2, 0], [0, 1], [1, 1], [1, 2]], hard: true },
  { name: 'Y', cells: [[0, 1], [1, 0], [1, 1], [1, 2], [1, 3]], hard: true },
  { name: 'N', cells: [[0, 0], [0, 1], [1, 1], [1, 2], [1, 3]], hard: true },
  { name: 'L5', cells: [[0, 0], [0, 1], [0, 2], [0, 3], [1, 3]], hard: true },
  { name: 'V', cells: [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]], hard: true },
  { name: 'W', cells: [[0, 0], [0, 1], [1, 1], [1, 2], [2, 2]], hard: true },
];
