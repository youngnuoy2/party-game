'use client';
import { useEffect, useState } from 'react';
import type { ChoiceQuestion, ChosungItem, OxItem, QuestionBankKind } from '@/data/types';
import { emitAck } from '@/lib/socket';
import { toChosung } from '@/shared/hangul';

interface Lists {
  builtin: { nonsense: ChoiceQuestion[]; chosung: ChosungItem[]; ox: OxItem[] };
  custom: { nonsense: ChoiceQuestion[]; chosung: ChosungItem[]; ox: OxItem[] };
}

const LABEL: Record<QuestionBankKind, string> = { nonsense: '🤣 넌센스', chosung: '🔤 초성', ox: '🙆 OX' };

export default function QuestionManager({ password }: { password: string }) {
  const [kind, setKind] = useState<QuestionBankKind>('nonsense');
  const [lists, setLists] = useState<Lists | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    const r = await emitAck<Lists>('admin:questions', { password, op: 'list' });
    if (r.ok) setLists(r.data!);
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const f = (k: string) => form[k] ?? '';
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  const add = async () => {
    let item: Record<string, unknown>;
    if (kind === 'nonsense') item = { q: f('q'), choices: [f('c0'), f('c1'), f('c2'), f('c3')], explain: f('explain'), category: f('category') };
    else if (kind === 'chosung') item = { answer: f('answer'), category: f('category'), aliases: f('aliases').split(',').map((s) => s.trim()).filter(Boolean), explain: f('explain') };
    else item = { q: f('q'), answer: f('ox') || 'O', explain: f('explain'), category: f('category') };
    const r = await emitAck('admin:questions', { password, op: 'add', kind, item });
    setMsg(r.ok ? '추가되었습니다 ✅' : r.error ?? '실패');
    if (r.ok) {
      setForm({});
      load();
    }
  };

  const del = async (id: string) => {
    await emitAck('admin:questions', { password, op: 'delete', kind, id });
    load();
  };

  const builtin = (lists?.builtin[kind] ?? []) as any[];
  const custom = (lists?.custom[kind] ?? []) as any[];

  return (
    <section className="space-y-4">
      <div className="flex gap-2">
        {(Object.keys(LABEL) as QuestionBankKind[]).map((k) => (
          <button key={k} className={k === kind ? 'btn-primary' : 'btn-ghost'} onClick={() => setKind(k)}>
            {LABEL[k]} ({(lists?.builtin[k].length ?? 0) + (lists?.custom[k].length ?? 0)})
          </button>
        ))}
      </div>

      <div className="card space-y-3 p-5">
        <h3 className="font-bold">문제 추가 (사람이 검증한 정답만 입력하세요)</h3>
        {kind === 'nonsense' && (
          <>
            <input className="input" placeholder="문제" value={f('q')} onChange={set('q')} />
            <div className="grid grid-cols-2 gap-2">
              <input className="input border-emerald-400/50" placeholder="정답 보기" value={f('c0')} onChange={set('c0')} />
              <input className="input" placeholder="오답 보기 1" value={f('c1')} onChange={set('c1')} />
              <input className="input" placeholder="오답 보기 2" value={f('c2')} onChange={set('c2')} />
              <input className="input" placeholder="오답 보기 3" value={f('c3')} onChange={set('c3')} />
            </div>
          </>
        )}
        {kind === 'chosung' && (
          <>
            <input className="input" placeholder="정답 단어 (예: 바나나)" value={f('answer')} onChange={set('answer')} />
            {f('answer') && <div className="text-sm text-white/60">초성 미리보기: <b className="text-emerald-300">{toChosung(f('answer'))}</b></div>}
            <input className="input" placeholder="추가 인정 답 (쉼표로 구분, 선택)" value={f('aliases')} onChange={set('aliases')} />
          </>
        )}
        {kind === 'ox' && (
          <>
            <input className="input" placeholder="문제 (참/거짓 문장)" value={f('q')} onChange={set('q')} />
            <select className="input" value={f('ox') || 'O'} onChange={set('ox')}>
              <option value="O">정답: O</option>
              <option value="X">정답: X</option>
            </select>
          </>
        )}
        <div className="grid grid-cols-2 gap-2">
          <input className="input" placeholder="카테고리" value={f('category')} onChange={set('category')} />
          <input className="input" placeholder="해설" value={f('explain')} onChange={set('explain')} />
        </div>
        <div className="flex items-center gap-3">
          <button className="btn-gold" onClick={add}>
            추가
          </button>
          {msg && <span className="text-sm text-white/70">{msg}</span>}
        </div>
      </div>

      <div className="card p-4">
        <h3 className="mb-2 font-bold">사용자 추가 문제 ({custom.length})</h3>
        {custom.map((q) => (
          <div key={q.id} className="flex items-center gap-2 border-b border-white/5 py-2 text-sm">
            <span className="flex-1">{describe(kind, q)}</span>
            <button className="btn-danger px-3 py-1 text-xs" onClick={() => del(q.id)}>
              삭제
            </button>
          </div>
        ))}
      </div>
      <details className="card p-4">
        <summary className="cursor-pointer font-bold">기본 내장 문제 ({builtin.length})</summary>
        <div className="mt-2 max-h-96 overflow-y-auto text-sm scrollbar-thin">
          {builtin.map((q) => (
            <div key={q.id} className="border-b border-white/5 py-1.5">
              {describe(kind, q)}
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}

function describe(kind: QuestionBankKind, q: any) {
  if (kind === 'nonsense') return `${q.q} → ${q.choices[0]}`;
  if (kind === 'chosung') return `[${q.category}] ${toChosung(q.answer)} → ${q.answer}`;
  return `${q.q} → ${q.answer}`;
}
