export interface ChoiceQuestion {
  id: string;
  q: string;
  /** choices[0] 이 정답 (주관식 전환 후에는 정답 표기로만 사용, 나머지는 참고용) */
  choices: string[];
  /** 주관식에서 함께 인정할 표현 (띄어쓰기·대소문자·쉼표는 자동 무시) */
  aliases?: string[];
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
