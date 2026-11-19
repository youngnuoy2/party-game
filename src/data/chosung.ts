// 초성 퀴즈 문제 은행
// - 초성은 정답에서 코드로 자동 추출합니다(수작업 오류 방지).
// - 같은 카테고리에서 같은 초성을 갖는 흔한 단어가 있는 모호한 문제는 제외했습니다.
//   (예: ㄱㄹ = 기린/고래, ㄸㄱ = 떡국/딸기, ㅅㄴㅎ = 송년회/신년회 → 제외)
// - scripts/verify-data.ts 가 은행 내 초성 중복을 검사합니다.
import type { ChosungItem } from './types';

export const CHOSUNG: ChosungItem[] = [
  // 음식
  { id: 'cs01', answer: '떡볶이', category: '음식', difficulty: 1 },
  { id: 'cs02', answer: '김치찌개', category: '음식', difficulty: 1 },
  { id: 'cs03', answer: '삼겹살', category: '음식', difficulty: 1 },
  { id: 'cs04', answer: '비빔밥', category: '음식', difficulty: 1 },
  { id: 'cs05', answer: '짜장면', category: '음식', aliases: ['자장면'], difficulty: 1 },
  { id: 'cs06', answer: '탕수육', category: '음식', difficulty: 1 },
  { id: 'cs07', answer: '붕어빵', category: '음식', difficulty: 1 },
  { id: 'cs08', answer: '된장찌개', category: '음식', difficulty: 2 },
  { id: 'cs09', answer: '아이스크림', category: '음식', difficulty: 2 },
  { id: 'cs10', answer: '햄버거', category: '음식', difficulty: 1 },
  { id: 'cs11', answer: '스파게티', category: '음식', difficulty: 2 },
  // 과일
  { id: 'cs12', answer: '바나나', category: '과일', difficulty: 1 },
  { id: 'cs13', answer: '파인애플', category: '과일', difficulty: 1 },
  { id: 'cs14', answer: '블루베리', category: '과일', difficulty: 2 },
  { id: 'cs15', answer: '복숭아', category: '과일', difficulty: 1 },
  // 동물
  { id: 'cs16', answer: '코끼리', category: '동물', difficulty: 1 },
  { id: 'cs17', answer: '호랑이', category: '동물', difficulty: 1 },
  { id: 'cs18', answer: '고슴도치', category: '동물', difficulty: 2 },
  { id: 'cs19', answer: '다람쥐', category: '동물', difficulty: 1 },
  { id: 'cs20', answer: '캥거루', category: '동물', difficulty: 1 },
  { id: 'cs21', answer: '너구리', category: '동물', difficulty: 2 },
  { id: 'cs22', answer: '펭귄', category: '동물', difficulty: 2 },
  // 영화
  { id: 'cs23', answer: '기생충', category: '영화', difficulty: 1 },
  { id: 'cs24', answer: '겨울왕국', category: '영화', difficulty: 1 },
  { id: 'cs25', answer: '해리포터', category: '영화', difficulty: 1 },
  { id: 'cs26', answer: '어벤져스', category: '영화', aliases: ['어벤저스'], difficulty: 1 },
  { id: 'cs27', answer: '타이타닉', category: '영화', difficulty: 2 },
  { id: 'cs28', answer: '부산행', category: '영화', difficulty: 2 },
  { id: 'cs29', answer: '극한직업', category: '영화', difficulty: 2 },
  // 일상 / 연말 / 직장
  { id: 'cs30', answer: '스마트폰', category: '일상', difficulty: 1 },
  { id: 'cs31', answer: '냉장고', category: '일상', difficulty: 1 },
  { id: 'cs32', answer: '크리스마스', category: '연말', difficulty: 1 },
  { id: 'cs33', answer: '엘리베이터', category: '일상', difficulty: 2 },
  { id: 'cs34', answer: '노트북', category: '일상', difficulty: 1 },
  { id: 'cs35', answer: '눈사람', category: '연말', difficulty: 1 },
  { id: 'cs36', answer: '산타클로스', category: '연말', difficulty: 2 },
  { id: 'cs37', answer: '월급날', category: '직장', difficulty: 2 },
  { id: 'cs38', answer: '해돋이', category: '연말', difficulty: 2 },
];
