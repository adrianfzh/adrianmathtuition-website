import { describe, it, expect } from 'vitest';
import { parseReading } from './scan-reader';

describe('parseReading — the cover reader\'s JSON, tolerant of a fence', () => {
  it('reads a fenced answer and normalises the fields', () => {
    const r = parseReading('```json\n{"is_exam_script": true, "reason": "handwritten working on printed questions", "student_name": "Rainie Cheng", "given_name": "Rainie", "subject": "A Math", "exam": "tys", "school": null, "year": "2022", "paper": 1, "confidence": 0.9}\n```')!;
    expect(r.is_exam_script).toBe(true);
    expect(r.student_name).toBe('Rainie Cheng');
    expect(r.subject).toBe('A Math');
    expect(r.year).toBe(2022);
    expect(r.paper).toBe(1);
    expect(r.confidence).toBe(0.9);
  });
  it('an unknown subject becomes null; a non-script stays a non-script; junk is null', () => {
    expect(parseReading('{"is_exam_script": false, "subject": "Physics"}')).toMatchObject({ is_exam_script: false, subject: null });
    expect(parseReading('{"is_exam_script": "yes"}')!.is_exam_script).toBe(false);
    expect(parseReading('no json here')).toBeNull();
  });
});
