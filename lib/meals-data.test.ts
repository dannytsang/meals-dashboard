import { describe, expect, it } from 'vitest';
import { deliveryWindowsFromMetadata, hasGeneratedDeliveryOnDate } from './meals-data';

describe('generated delivery metadata', () => {
  it('renders delivery markers only from generated pipeline metadata', () => {
    const deliveries = deliveryWindowsFromMetadata([
      {
        actual_delivery_date: '2026-06-16',
        delivery_usable_date: '2026-06-17',
        summary: 'Tesco order due',
      },
    ]);

    expect(hasGeneratedDeliveryOnDate(deliveries, '2026-06-16')).toBe(true);
    expect(hasGeneratedDeliveryOnDate(deliveries, '2026-06-17')).toBe(false);
    expect(hasGeneratedDeliveryOnDate(deliveries, '2026-06-20')).toBe(false);
    expect(deliveries[0]).toMatchObject({
      date: '2026-06-16',
      usableDate: '2026-06-17',
      status: 'scheduled',
    });
  });
});
