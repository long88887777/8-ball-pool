import { describe, expect, it, vi } from 'vitest';
import {
  formatCny,
  selectDefaultRechargePackage,
  sanitizeRechargePackageRows,
  sanitizeRechargeOrders,
  createRechargeOrder,
  mockPayRechargeOrder,
  type RechargePackage,
} from './recharge';

describe('recharge helpers', () => {
  it('sanitizes active packages and sorts them by sort order', () => {
    const packages = sanitizeRechargePackageRows([
      {
        id: 'coins_2000',
        title: '2000 金币',
        amount_cents: 1800,
        currency: 'CNY',
        coin_amount: 2000,
        bonus_coins: 200,
        sort_order: 20,
      },
      {
        id: 'bad',
        title: 'Bad',
        amount_cents: -1,
        currency: 'CNY',
        coin_amount: 0,
        bonus_coins: 0,
        sort_order: 1,
      },
      {
        id: 'coins_600',
        title: '600 金币',
        amount_cents: 600,
        currency: 'CNY',
        coin_amount: 600,
        bonus_coins: 0,
        sort_order: 10,
      },
    ]);

    expect(packages.map((item) => item.id)).toEqual(['coins_600', 'coins_2000']);
    expect(packages[1].bonusCoins).toBe(200);
  });

  it('formats CNY package amounts for display', () => {
    expect(formatCny(600, 'CNY')).toBe('¥6');
    expect(formatCny(1888, 'CNY')).toBe('¥18.88');
  });

  it('selects the first package when current selection is unavailable', () => {
    const packages: RechargePackage[] = [
      { id: 'coins_600', title: '600 金币', amountCents: 600, currency: 'CNY', coinAmount: 600, bonusCoins: 0, sortOrder: 10 },
      { id: 'coins_2000', title: '2000 金币', amountCents: 1800, currency: 'CNY', coinAmount: 2000, bonusCoins: 200, sortOrder: 20 },
    ];

    expect(selectDefaultRechargePackage(packages, null)).toBe('coins_600');
    expect(selectDefaultRechargePackage(packages, 'coins_2000')).toBe('coins_2000');
    expect(selectDefaultRechargePackage(packages, 'missing')).toBe('coins_600');
  });

  it('sanitizes recent recharge orders', () => {
    const orders = sanitizeRechargeOrders([
      {
        id: 'order-1',
        package_id: 'coins_600',
        amount_cents: 600,
        currency: 'CNY',
        coin_amount: 600,
        channel: 'mock',
        status: 'paid',
        created_at: '2026-05-17T10:00:00.000Z',
        expires_at: '2026-05-17T10:30:00.000Z',
        paid_at: '2026-05-17T10:01:00.000Z',
      },
      { id: '', status: 'paid' },
    ]);

    expect(orders).toEqual([
      {
        id: 'order-1',
        packageId: 'coins_600',
        amountCents: 600,
        currency: 'CNY',
        coinAmount: 600,
        channel: 'mock',
        status: 'paid',
        createdAt: '2026-05-17T10:00:00.000Z',
        expiresAt: '2026-05-17T10:30:00.000Z',
        paidAt: '2026-05-17T10:01:00.000Z',
      },
    ]);
  });

  it('invokes create and mock payment functions with stable payloads', async () => {
    const invoke = vi.fn()
      .mockResolvedValueOnce({
        data: {
          order: {
            id: 'order-1',
            status: 'pending',
            channel: 'mock',
            expiresAt: '2026-05-17T10:30:00.000Z',
            createdAt: '2026-05-17T10:00:00.000Z',
            package: {
              id: 'coins_600',
              title: '600 金币',
              amountCents: 600,
              currency: 'CNY',
              coinAmount: 600,
              bonusCoins: 0,
            },
          },
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          order: { id: 'order-1', status: 'paid', paidAt: '2026-05-17T10:01:00.000Z' },
          wallet: { coins: 860 },
          grantedCoins: 600,
        },
        error: null,
      });
    const supabase = { functions: { invoke } };

    const created = await createRechargeOrder(supabase, 'coins_600');
    const paid = await mockPayRechargeOrder(supabase, 'order-1');

    expect(created.order.id).toBe('order-1');
    expect(paid.wallet.coins).toBe(860);
    expect(invoke).toHaveBeenNthCalledWith(1, 'create-recharge-order', {
      body: { packageId: 'coins_600', channel: 'mock' },
    });
    expect(invoke).toHaveBeenNthCalledWith(2, 'mock-pay-recharge-order', {
      body: { orderId: 'order-1' },
    });
  });
});
