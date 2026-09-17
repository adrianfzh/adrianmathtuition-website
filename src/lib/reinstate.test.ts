import { describe, it, expect } from 'vitest';
import { lessonRestoreFields, clashes, lessonsToRecreate } from './reinstate';

const saved = (date: string, slot = 'recSlot1') => ({ id: 'recL', fields: { Student: ['recS'], Slot: [slot], Date: date, Type: 'Regular', Status: 'Scheduled', 'Billing Month': 'October 2026', 'Lesson ID': 'formula', 'Day of Week': 'Mon' } });

describe('lessonRestoreFields', () => {
  it('keeps only writable fields and makes the lesson Scheduled again', () => {
    const f = lessonRestoreFields({ ...saved('2026-10-05').fields, Status: 'Cancelled', Notes: '' });
    expect(f).toEqual({ Student: ['recS'], Slot: ['recSlot1'], Date: '2026-10-05', Type: 'Regular', Status: 'Scheduled', 'Billing Month': 'October 2026' });
  });
});

describe('clashes', () => {
  it('names a slot-day now held by someone else, ignores the student\'s own and non-scheduled rows', () => {
    const c = clashes([saved('2026-10-05'), saved('2026-10-12')], [
      { id: 'a', student: 'recOTHER', slot: 'recSlot1', date: '2026-10-05', status: 'Scheduled' },
      { id: 'b', student: 'recOTHER', slot: 'recSlot1', date: '2026-10-12', status: 'Cancelled' },
      { id: 'c', student: 'recS', slot: 'recSlot1', date: '2026-10-12', status: 'Scheduled' },
    ], 'recS');
    expect(c).toEqual([{ date: '2026-10-05', slot: 'recSlot1', heldBy: 'recOTHER' }]);
  });
});

describe('lessonsToRecreate', () => {
  it('skips a lesson that is already back', () => {
    const out = lessonsToRecreate([saved('2026-10-05'), saved('2026-10-12')], [{ id: 'c', student: 'recS', slot: 'recSlot1', date: '2026-10-12', status: 'Scheduled' }], 'recS');
    expect(out.map(l => l.fields.Date)).toEqual(['2026-10-05']);
  });
});
