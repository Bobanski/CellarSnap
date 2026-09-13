import { test, expect } from '@playwright/test';
import { formatConsumedDate } from '@shared';
import { formatConsumedDate as webFormat } from '@/lib/formatDate';

for (const zone of ['America/New_York','America/Los_Angeles','UTC','Asia/Tokyo','Pacific/Kiritimati','Pacific/Apia']) {
  test(`tasting calendar days stay fixed in ${zone}`, () => {
    const previous=process.env.TZ;process.env.TZ=zone;
    try {
      expect(webFormat).toBe(formatConsumedDate);
      for(const [input,expected] of [
        ['2026-07-08','Jul 8, 2026'],
        ['2026-01-01','Jan 1, 2026'],
        ['2024-02-29','Feb 29, 2024'],
        ['2026-03-08','Mar 8, 2026'],
        ['2026-11-01','Nov 1, 2026'],
        ['2011-12-30','Dec 30, 2011'], // Samoa skipped this local day entirely.
        ['2026-07-08T00:00:00.000Z','Jul 8, 2026'],
        ['2026-07-08T23:30:00-11:00','Jul 8, 2026'],
        ['2026-07-08T00:30:00+14:00','Jul 8, 2026'],
      ]) expect(formatConsumedDate(input)).toBe(expected);
      // Control: instant presentation still follows the viewer's zone.
      if(zone==='America/New_York') expect(new Date('2026-07-08T00:00:00Z').getDate()).toBe(7);
      if(zone==='Asia/Tokyo') expect(new Date('2026-07-08T00:00:00Z').getDate()).toBe(8);
    } finally {
      if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous;
    }
  });
}
test('invalid or absent dates are not normalized into a different calendar day',()=>{
  for(const value of ['', 'not-a-date','2026-02-29','2026-04-31','2026-13-01','2026-00-01','2026-07-00','07/08/2026']) expect(formatConsumedDate(value)).toBe(value);
});
