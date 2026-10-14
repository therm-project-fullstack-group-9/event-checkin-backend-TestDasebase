import { sessionEndsAt, hasSessionEnded } from './eventTime';

describe('sessionEndsAt', () => {
  it('interprets date + HH:MM as Asia/Bangkok (UTC+7)', () => {
    expect(sessionEndsAt('2026-10-15', '09:00', '12:00')?.toISOString()).toBe('2026-10-15T05:00:00.000Z');
  });

  it('rolls an overnight session over to the next day', () => {
    expect(sessionEndsAt('2026-10-15', '22:00', '01:00')?.toISOString()).toBe('2026-10-15T18:00:00.000Z');
  });

  it('returns null for malformed input (treated as not ended)', () => {
    expect(sessionEndsAt('2026-10-15', '09:00', 'abc')).toBeNull();
    expect(sessionEndsAt('15/10/2026', '09:00', '12:00')).toBeNull();
    expect(sessionEndsAt('2026-10-15', '09:00', '25:00')).toBeNull();
  });
});

describe('hasSessionEnded', () => {
  const now = new Date('2026-10-15T05:00:00.000Z'); // 12:00 น. เวลาไทย

  it('is false before the end time and true from the end time on', () => {
    expect(hasSessionEnded('2026-10-15', '09:00', '12:01', now)).toBe(false);
    expect(hasSessionEnded('2026-10-15', '09:00', '12:00', now)).toBe(true);
    expect(hasSessionEnded('2026-10-14', '09:00', '23:59', now)).toBe(true);
  });
});
