/**
 * Parser Benchmark（Task 23.1）
 *
 * 构造 ~5MB 的 JSON（10000 题），验证 parse() 在合理时间内完成。
 * 使用 vitest 的 bench API。
 */

import { describe, bench } from 'vitest';
import { parse } from '../../src/parser/parser.js';

// 生成 10000 个问题的题库 JSON 字符串（每题约 500 字节，总计 ~5MB）
function generateLargeBankJson(count: number): string {
  const questions: object[] = [];
  for (let i = 0; i < count; i++) {
    // 交替生成 code 和 qa 类型的题目
    if (i % 2 === 0) {
      questions.push({
        id: `q-${String(i).padStart(5, '0')}`,
        type: 'code',
        title: `Code Question ${i} - ${generatePadding(80)}`,
        content: `This is the content for code question ${i}. ${generatePadding(150)}`,
        category: `Category-${i % 20}`,
        tags: [`tag-${i % 10}`, `tag-${(i + 1) % 10}`],
        difficulty: (['easy', 'medium', 'hard'] as const)[i % 3],
        answer: `function solution${i}() { return ${i}; }`,
        language: 'typescript',
        referenceCode: `function solution${i}() { return ${i}; }`,
      });
    } else {
      questions.push({
        id: `q-${String(i).padStart(5, '0')}`,
        type: 'qa',
        title: `QA Question ${i} - ${generatePadding(80)}`,
        content: `This is the content for QA question ${i}. ${generatePadding(150)}`,
        category: `Category-${i % 20}`,
        tags: [`tag-${i % 10}`, `tag-${(i + 1) % 10}`],
        difficulty: (['easy', 'medium', 'hard'] as const)[i % 3],
        answer: `The answer to question ${i} involves understanding fundamental concepts.`,
        briefAnswer: `Brief answer for question ${i}.`,
      });
    }
  }

  const bank = {
    name: 'Benchmark Test Bank',
    version: '1.0.0',
    questions,
  };

  return JSON.stringify(bank);
}

function generatePadding(length: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789 ';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[i % chars.length];
  }
  return result;
}

const largeJson = generateLargeBankJson(10000);

describe('Parser Benchmark', () => {
  bench('parse 10000 questions (~5MB)', () => {
    parse(largeJson);
  });
});
