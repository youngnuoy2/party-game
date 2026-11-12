// 문제 은행: 기본 내장 문제 + 관리자가 추가한 사용자 문제(JSON 파일)
import fs from 'fs';
import path from 'path';
import { CHOSUNG } from '../data/chosung';
import { NONSENSE } from '../data/nonsense';
import { OX } from '../data/ox';
import type { ChoiceQuestion, ChosungItem, OxItem, QuestionBankKind } from '../data/types';
import { toChosung } from '../shared/hangul';
import { newId } from './util';

export interface Bank {
  nonsense: ChoiceQuestion[];
  chosung: ChosungItem[];
  ox: OxItem[];
}

const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
const CUSTOM_FILE = path.join(DATA_DIR, 'custom-questions.json');

let custom: Bank = { nonsense: [], chosung: [], ox: [] };

function loadCustom() {
  try {
    if (fs.existsSync(CUSTOM_FILE)) {
      const raw = JSON.parse(fs.readFileSync(CUSTOM_FILE, 'utf8'));
      custom = { nonsense: raw.nonsense ?? [], chosung: raw.chosung ?? [], ox: raw.ox ?? [] };
    }
  } catch (e) {
    console.error('[questions] 사용자 문제 파일을 읽지 못했습니다:', e);
  }
}
loadCustom();

function saveCustom() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = CUSTOM_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(custom, null, 2));
  fs.renameSync(tmp, CUSTOM_FILE);
}

export function getBank(): Bank {
  return {
    nonsense: [...NONSENSE, ...custom.nonsense],
    chosung: [...CHOSUNG, ...custom.chosung],
    ox: [...OX, ...custom.ox],
  };
}

export function listQuestions() {
  return { builtin: { nonsense: NONSENSE, chosung: CHOSUNG, ox: OX }, custom };
}

const s = (v: unknown, max = 120) => String(v ?? '').trim().slice(0, max);

/** 사용자 문제 추가 - 형식 검증 후 저장 (정답은 사람이 입력한 고정값만 사용) */
export function addQuestion(kind: QuestionBankKind, input: any): { ok: boolean; error?: string } {
  const difficulty = ([1, 2, 3].includes(Number(input?.difficulty)) ? Number(input.difficulty) : 2) as 1 | 2 | 3;
  const category = s(input?.category, 20) || '사용자';
  if (kind === 'nonsense') {
    const q = s(input?.q);
    const choices = (Array.isArray(input?.choices) ? input.choices : []).map((c: unknown) => s(c, 30));
    if (!q || choices.length !== 4 || choices.some((c: string) => !c)) return { ok: false, error: '문제와 보기 4개(첫 번째가 정답)를 입력하세요' };
    if (new Set(choices).size !== 4) return { ok: false, error: '보기가 중복됩니다' };
    custom.nonsense.push({ id: newId('cn'), q, choices: choices as ChoiceQuestion['choices'], explain: s(input?.explain), difficulty, category });
  } else if (kind === 'chosung') {
    const answer = s(input?.answer, 20).replace(/\s+/g, '');
    if (!/^[가-힣]{2,10}$/.test(answer)) return { ok: false, error: '정답은 2~10자의 완성형 한글이어야 합니다' };
    const cho = toChosung(answer);
    if (getBank().chosung.some((c) => toChosung(c.answer) === cho)) return { ok: false, error: `같은 초성(${cho})의 문제가 이미 있어 모호합니다` };
    const aliases = (Array.isArray(input?.aliases) ? input.aliases : []).map((a: unknown) => s(a, 20)).filter(Boolean);
    custom.chosung.push({ id: newId('cc'), answer, category, aliases, difficulty, explain: s(input?.explain) || undefined });
  } else if (kind === 'ox') {
    const q = s(input?.q);
    const answer = input?.answer === 'O' ? 'O' : input?.answer === 'X' ? 'X' : null;
    if (!q || !answer) return { ok: false, error: '문제와 정답(O/X)을 입력하세요' };
    custom.ox.push({ id: newId('co'), q, answer, explain: s(input?.explain) || '해설 없음', difficulty, category });
  } else return { ok: false, error: 'unknown kind' };
  saveCustom();
  return { ok: true };
}

export function deleteQuestion(kind: QuestionBankKind, id: string) {
  const list = custom[kind] as { id: string }[];
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) return { ok: false, error: '사용자 추가 문제만 삭제할 수 있습니다' };
  list.splice(i, 1);
  saveCustom();
  return { ok: true };
}
