const CHO = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

/** 한글 문자열의 초성 추출 (공백 제거, 한글 외 문자는 그대로) */
export function toChosung(word: string): string {
  let out = '';
  for (const ch of word.replace(/\s+/g, '')) {
    const code = ch.charCodeAt(0) - 0xac00;
    if (code >= 0 && code <= 11171) out += CHO[Math.floor(code / 588)];
    else out += ch;
  }
  return out;
}

/** 답안 비교용 정규화: 공백/구두점 제거, 소문자, 유니코드 NFC */
export function normalizeAnswer(s: string): string {
  return s
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\s.,!?~'"`·\-_/()[\]{}]/g, '');
}
