import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type RechargeOrderRow = {
  id: string;
  user_id: string;
  channel: string;
  status: string;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return json({}, 200);
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }
  if (Deno.env.get("ALLOW_MOCK_PAYMENTS") !== "true") {
    return json({ error: "Mock payments are disabled" }, 403);
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
  const orderId = typeof body.orderId === "string" ? body.orderId : "";
  if (!orderId) {
    return json({ error: "Missing orderId" }, 400);
  }

  const { data: order, error: orderError } = await adminClient
    .from("recharge_orders")
    .select("id, user_id, channel, status")
    .eq("id", orderId)
    .maybeSingle<RechargeOrderRow>();

  if (orderError) {
    return json({ error: orderError.message }, 500);
  }
  if (!order || order.user_id !== user.id) {
    return json({ error: "Recharge order not found" }, 404);
  }
  if (order.channel !== "mock") {
    return json({ error: "Order is not a mock payment order" }, 400);
  }

  const providerTradeNo = `mock_${order.id}`;
  const { data, error } = await adminClient.rpc("confirm_recharge_order", {
    p_order_id: order.id,
    p_provider_trade_no: providerTradeNo,
    p_provider_payload: {
      channel: "mock",
      confirmedBy: "mock-pay-recharge-order",
      confirmedAt: new Date().toISOString(),
    },
  });

  if (error) {
    return json({ error: error.message }, 400);
  }

  const result = Array.isArray(data) ? data[0] : data;
  return json({
    order: {
      id: result.order_id,
      status: result.status,
      paidAt: result.paid_at,
    },
    wallet: {
      coins: result.balance_after,
    },
    grantedCoins: result.granted_coins,
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
