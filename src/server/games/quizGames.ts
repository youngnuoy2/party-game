import { toChosung } from '../../shared/hangul';
import { getBank } from '../questionBank';
import { shuffle } from '../util';
import { makeQuizGame, type QuizQ } from './quizGame';

export const nonsenseGame = makeQuizGame({
  id: 'nonsense',
  questionMs: 10_000,
  revealMs: 4_000,
  build(ctx) {
    return ctx.takeQuestions('nonsense', getBank().nonsense, 3).map((item): QuizQ => {
      const choices = shuffle([...item.choices]);
      return {
        id: item.id,
        prompt: item.q,
        hint: item.category,
        choices,
        correctIndex: choices.indexOf(item.choices[0]),
        accepted: [item.choices[0]],
        answerText: item.choices[0],
        explain: item.explain,
      };
    });
  },
});

export const chosungGame = makeQuizGame({
  id: 'chosung',
  questionMs: 15_000,
  revealMs: 4_000,
  build(ctx) {
    const bank = getBank().chosung;
    const inputMode = ctx.settings.chosungMode === 'input';
    return ctx.takeQuestions('chosung', bank, 3).map((item): QuizQ => {
      let choices: string[] | null = null;
      let correctIndex = 0;
      if (!inputMode) {
        // 오답 보기: 같은 카테고리 우선, 초성 길이가 비슷한 단어
        const myCho = toChosung(item.answer);
        const others = shuffle(bank.filter((b) => b.id !== item.id && toChosung(b.answer) !== myCho));
        others.sort(
          (a, b) =>
            Number(b.category === item.category) - Number(a.category === item.category) ||
            Math.abs(toChosung(a.answer).length - myCho.length) - Math.abs(toChosung(b.answer).length - myCho.length),
        );
        choices = shuffle([item.answer, ...others.slice(0, 3).map((x) => x.answer)]);
        correctIndex = choices.indexOf(item.answer);
      }
      return {
        id: item.id,
        prompt: '초성을 보고 단어를 맞혀 보세요',
        hint: item.category,
        big: toChosung(item.answer),
        choices,
        correctIndex,
        accepted: [item.answer, ...(item.aliases ?? [])],
        answerText: item.answer,
        explain: item.explain ?? `${toChosung(item.answer)} → ${item.answer}`,
      };
    });
  },
});

export const oxGame = makeQuizGame({
  id: 'ox',
  questionMs: 6_000,
  revealMs: 3_500,
  build(ctx) {
    return ctx.takeQuestions('ox', getBank().ox, 5).map(
      (item): QuizQ => ({
        id: item.id,
        prompt: item.q,
        hint: item.category,
        choices: ['O', 'X'],
        correctIndex: item.answer === 'O' ? 0 : 1,
        accepted: [item.answer],
        answerText: item.answer,
        explain: item.explain,
      }),
    );
  },
});
