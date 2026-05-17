import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type RechargePackageRow = {
  id: string;
  title: string;
  amount_cents: number;
  currency: string;
  coin_amount: number;
  bonus_coins: number;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return json({}, 200);
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ error: "No authorization header" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: "Missing Supabase function environment" }, 500);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();
  if (userError || !user) {
    return json({ error: "Invalid token" }, 401);
  }

  const body = await readJson(req);
  const packageId = typeof body.packageId === "string" ? body.packageId : "";
  const channel = typeof body.channel === "string" ? body.channel : "mock";
  if (!packageId) {
    return json({ error: "Missing packageId" }, 400);
  }
  if (channel !== "mock") {
    return json({ error: "Only mock recharge channel is enabled" }, 400);
  }

  const { data: pkg, error: packageError } = await adminClient
    .from("recharge_packages")
    .select("id, title, amount_cents, currency, coin_amount, bonus_coins")
    .eq("id", packageId)
    .eq("active", true)
    .maybeSingle<RechargePackageRow>();

  if (packageError) {
    return json({ error: packageError.message }, 500);
  }
  if (!pkg) {
    return json({ error: "Recharge package not found" }, 404);
  }

  const { data: order, error: orderError } = await adminClient
    .from("recharge_orders")
    .insert({
      user_id: user.id,
      package_id: pkg.id,
      amount_cents: pkg.amount_cents,
      currency: pkg.currency,
      coin_amount: pkg.coin_amount,
      channel,
      status: "pending",
    })
    .select("id, status, expires_at, created_at")
    .single();

  if (orderError) {
    return json({ error: orderError.message }, 500);
  }

  return json({
    order: {
      id: order.id,
      status: order.status,
      channel,
      expiresAt: order.expires_at,
      createdAt: order.created_at,
      package: {
        id: pkg.id,
        title: pkg.title,
        amountCents: pkg.amount_cents,
        currency: pkg.currency,
        coinAmount: pkg.coin_amount,
        bonusCoins: pkg.bonus_coins,
      },
    },
  });
});

async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const value = await req.json();
    return value && typeof value === "object" ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
