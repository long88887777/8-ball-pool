export type RechargePackage = {
  id: string;
  title: string;
  amountCents: number;
  currency: string;
  coinAmount: number;
  bonusCoins: number;
  sortOrder: number;
};

export type RechargeOrderStatus = 'pending' | 'paid' | 'failed' | 'expired';

export type RechargeOrder = {
  id: string;
  packageId: string;
  amountCents: number;
  currency: string;
  coinAmount: number;
  channel: string;
  status: RechargeOrderStatus;
  createdAt: string;
  expiresAt: string;
  paidAt: string | null;
};

export type CreatedRechargeOrder = {
  id: string;
  status: RechargeOrderStatus;
  channel: string;
  expiresAt: string;
  createdAt: string;
  package: Omit<RechargePackage, 'sortOrder'>;
};

export type CreateRechargeOrderResult = {
  order: CreatedRechargeOrder;
};

export type MockPayRechargeResult = {
  order: {
    id: string;
    status: 'paid';
    paidAt: string;
  };
  wallet: {
    coins: number;
  };
  grantedCoins: number;
};

export type SupabaseRechargeClient = {
  from(table: string): {
    select(columns: string): {
      order(column: string, options?: { ascending?: boolean }): PromiseLike<{ data: unknown; error: unknown }>;
      eq(column: string, value: unknown): {
        order(column: string, options?: { ascending?: boolean }): PromiseLike<{ data: unknown; error: unknown }>;
      };
    };
  };
  functions: {
    invoke(name: string, options?: { body?: Record<string, unknown> }): PromiseLike<{ data: unknown; error: unknown }>;
  };
};

type PackageRow = {
  id?: unknown;
  title?: unknown;
  amount_cents?: unknown;
  currency?: unknown;
  coin_amount?: unknown;
  bonus_coins?: unknown;
  sort_order?: unknown;
};

type OrderRow = {
  id?: unknown;
  package_id?: unknown;
  amount_cents?: unknown;
  currency?: unknown;
  coin_amount?: unknown;
  channel?: unknown;
  status?: unknown;
  created_at?: unknown;
  expires_at?: unknown;
  paid_at?: unknown;
};

export async function fetchRechargePackages(supabase: SupabaseRechargeClient): Promise<RechargePackage[]> {
  const { data, error } = await supabase
    .from('recharge_packages')
    .select('id, title, amount_cents, currency, coin_amount, bonus_coins, sort_order')
    .order('sort_order', { ascending: true });
  if (error) throw toError(error);
  return sanitizeRechargePackageRows(Array.isArray(data) ? data : []);
}

export async function fetchRecentRechargeOrders(supabase: SupabaseRechargeClient): Promise<RechargeOrder[]> {
  const { data, error } = await supabase
    .from('recharge_orders')
    .select('id, package_id, amount_cents, currency, coin_amount, channel, status, created_at, expires_at, paid_at')
    .order('created_at', { ascending: false });
  if (error) throw toError(error);
  return sanitizeRechargeOrders(Array.isArray(data) ? data : []);
}

export async function createRechargeOrder(
  supabase: Pick<SupabaseRechargeClient, 'functions'>,
  packageId: string,
): Promise<CreateRechargeOrderResult> {
  const { data, error } = await supabase.functions.invoke('create-recharge-order', {
    body: { packageId, channel: 'mock' },
  });
  if (error) throw toError(error);
  return sanitizeCreateRechargeOrderResult(data);
}

export async function mockPayRechargeOrder(
  supabase: Pick<SupabaseRechargeClient, 'functions'>,
  orderId: string,
): Promise<MockPayRechargeResult> {
  const { data, error } = await supabase.functions.invoke('mock-pay-recharge-order', {
    body: { orderId },
  });
  if (error) throw toError(error);
  return sanitizeMockPayRechargeResult(data);
}

export function sanitizeRechargePackageRows(rows: unknown[]): RechargePackage[] {
  return rows
    .map((row) => sanitizeRechargePackageRow(row as PackageRow))
    .filter((row): row is RechargePackage => row !== null)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function sanitizeRechargeOrders(rows: unknown[]): RechargeOrder[] {
  return rows
    .map((row) => sanitizeRechargeOrder(row as OrderRow))
    .filter((row): row is RechargeOrder => row !== null);
}

export function selectDefaultRechargePackage(packages: RechargePackage[], currentId: string | null): string | null {
  if (currentId && packages.some((item) => item.id === currentId)) {
    return currentId;
  }
  return packages[0]?.id ?? null;
}

export function formatCny(amountCents: number, currency: string): string {
  const amount = amountCents / 100;
  const formatted = Number.isInteger(amount)
    ? String(amount)
    : amount.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return currency === 'CNY' ? `¥${formatted}` : `${formatted} ${currency}`;
}

function sanitizeRechargePackageRow(row: PackageRow): RechargePackage | null {
  const id = asString(row.id);
  const title = asString(row.title);
  const amountCents = asPositiveInteger(row.amount_cents);
  const currency = asString(row.currency) || 'CNY';
  const coinAmount = asPositiveInteger(row.coin_amount);
  const bonusCoins = asNonNegativeInteger(row.bonus_coins);
  const sortOrder = asInteger(row.sort_order);
  if (!id || !title || amountCents === null || coinAmount === null) {
    return null;
  }
  return {
    id,
    title,
    amountCents,
    currency,
    coinAmount,
    bonusCoins: bonusCoins ?? 0,
    sortOrder: sortOrder ?? 0,
  };
}

function sanitizeRechargeOrder(row: OrderRow): RechargeOrder | null {
  const id = asString(row.id);
  const packageId = asString(row.package_id);
  const amountCents = asPositiveInteger(row.amount_cents);
  const currency = asString(row.currency) || 'CNY';
  const coinAmount = asPositiveInteger(row.coin_amount);
  const channel = asString(row.channel);
  const status = asOrderStatus(row.status);
  const createdAt = asString(row.created_at);
  const expiresAt = asString(row.expires_at);
  const paidAt = asString(row.paid_at) || null;
  if (!id || !packageId || amountCents === null || coinAmount === null || !channel || !status || !createdAt || !expiresAt) {
    return null;
  }
  return { id, packageId, amountCents, currency, coinAmount, channel, status, createdAt, expiresAt, paidAt };
}

function sanitizeCreateRechargeOrderResult(value: unknown): CreateRechargeOrderResult {
  const root = value as { order?: unknown };
  const order = root.order as { package?: unknown } & Record<string, unknown>;
  if (!order || typeof order !== 'object') throw new Error('Invalid recharge order response');
  const pkg = order.package as Record<string, unknown> | undefined;
  const id = asString(order.id);
  const status = asOrderStatus(order.status);
  const channel = asString(order.channel);
  const expiresAt = asString(order.expiresAt);
  const createdAt = asString(order.createdAt);
  const packageId = asString(pkg?.id);
  const title = asString(pkg?.title);
  const amountCents = asPositiveInteger(pkg?.amountCents);
  const currency = asString(pkg?.currency) || 'CNY';
  const coinAmount = asPositiveInteger(pkg?.coinAmount);
  const bonusCoins = asNonNegativeInteger(pkg?.bonusCoins);
  if (!id || !status || !channel || !expiresAt || !createdAt || !packageId || !title || amountCents === null || coinAmount === null) {
    throw new Error('Invalid recharge order response');
  }
  return {
    order: {
      id,
      status,
      channel,
      expiresAt,
      createdAt,
      package: {
        id: packageId,
        title,
        amountCents,
        currency,
        coinAmount,
        bonusCoins: bonusCoins ?? 0,
      },
    },
  };
}

function sanitizeMockPayRechargeResult(value: unknown): MockPayRechargeResult {
  const root = value as { order?: unknown; wallet?: unknown; grantedCoins?: unknown };
  const order = root.order as Record<string, unknown> | undefined;
  const wallet = root.wallet as Record<string, unknown> | undefined;
  const id = asString(order?.id);
  const status = asOrderStatus(order?.status);
  const paidAt = asString(order?.paidAt);
  const coins = asNonNegativeInteger(wallet?.coins);
  const grantedCoins = asPositiveInteger(root.grantedCoins);
  if (!id || status !== 'paid' || !paidAt || coins === null || grantedCoins === null) {
    throw new Error('Invalid mock payment response');
  }
  return {
    order: { id, status, paidAt },
    wallet: { coins },
    grantedCoins,
  };
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : null;
}

function asPositiveInteger(value: unknown): number | null {
  const integer = asInteger(value);
  return integer !== null && integer > 0 ? integer : null;
}

function asNonNegativeInteger(value: unknown): number | null {
  const integer = asInteger(value);
  return integer !== null && integer >= 0 ? integer : null;
}

function asOrderStatus(value: unknown): RechargeOrderStatus | null {
  return value === 'pending' || value === 'paid' || value === 'failed' || value === 'expired'
    ? value
    : null;
}

function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  if (value && typeof value === 'object' && 'message' in value && typeof value.message === 'string') {
    return new Error(value.message);
  }
  return new Error('Recharge request failed');
}
