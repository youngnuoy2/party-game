export interface ChoiceQuestion {
  id: string;
  q: string;
  /** choices[0] 이 정답. 출제 시 섞음 */
  choices: [string, string, string, string];
  explain: string;
  difficulty: 1 | 2 | 3;
  category: string;
}

export interface ChosungItem {
  id: string;
  answer: string;
  category: string;
  /** 직접 입력 모드에서 함께 인정할 표현 (띄어쓰기는 자동 무시) */
  aliases?: string[];
  difficulty: 1 | 2 | 3;
  explain?: string;
}

export interface OxItem {
  id: string;
  q: string;
  answer: 'O' | 'X';
  explain: string;
  difficulty: 1 | 2 | 3;
  category: string;
}

export type QuestionBankKind = 'nonsense' | 'chosung' | 'ox';
