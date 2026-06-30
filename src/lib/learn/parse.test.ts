import { describe, it, expect } from 'vitest';
import { parseJson } from './parse';

describe('parseJson', () => {
  it('parses plain JSON', () => {
    expect(parseJson('{"a":1,"b":"x"}')).toEqual({ a: 1, b: 'x' });
  });
  it('strips a ```json fence', () => {
    expect(parseJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it('strips a bare ``` fence', () => {
    expect(parseJson('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it('extracts the object when wrapped in prose', () => {
    expect(parseJson('Here is your feedback:\n{"a":1}\nHope it helps!')).toEqual({ a: 1 });
  });
  it('handles nested objects/arrays', () => {
    expect(parseJson('{"x":{"y":[1,2]}}')).toEqual({ x: { y: [1, 2] } });
  });
  it('throws on genuinely malformed JSON', () => {
    expect(() => parseJson('not json at all')).toThrow();
    expect(() => parseJson('{"a": }')).toThrow();
  });
});
