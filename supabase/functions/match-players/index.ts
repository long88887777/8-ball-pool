import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ error: "No authorization header" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return json({ error: "Missing Supabase function environment" }, 500);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();

  if (userError || !user) {
    return json({ error: "Invalid token" }, 401);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const currentUserId = user.id;
  const payload = await readJson(req);
  const ruleset = payload?.ruleset === "nine-ball" ? "nine-ball" : "eight-ball";

  const { data: opponents, error: findError } = await adminClient.rpc(
    "match_find_opponent",
    { current_user_id: currentUserId, desired_ruleset: ruleset },
  );

  if (findError) {
    return json({ error: findError.message }, 500);
  }

  if (opponents && opponents.length > 0) {
    const opponent = opponents[0];
    const roomCode = String(Math.floor(100000 + Math.random() * 900000));

    const { error: roomError } = await adminClient
      .from("rooms")
      .insert({
        id: roomCode,
        host_id: opponent.user_id,
        guest_id: currentUserId,
        status: "playing",
        game_ruleset: ruleset,
      });

    if (roomError) {
      return json({ error: roomError.message }, 500);
    }

    const { error: updateError } = await adminClient
      .from("matchmaking_queue")
      .update({ status: "matched", matched_with: currentUserId, room_id: roomCode, game_ruleset: ruleset })
      .eq("id", opponent.id);

    if (updateError) {
      return json({ error: updateError.message }, 500);
    }

    return json({
      status: "matched",
      roomId: roomCode,
      opponentId: opponent.user_id,
      ruleset,
    });
  }

  const { data: existing } = await adminClient
    .from("matchmaking_queue")
    .select("id, status, room_id, matched_with, game_ruleset")
    .eq("user_id", currentUserId)
    .single();

  if (existing) {
    if (existing.status === "matched") {
      return json({
        status: "matched",
        roomId: existing.room_id,
        opponentId: existing.matched_with,
        ruleset: existing.game_ruleset,
      });
    }

    return json({ status: "waiting", queueId: existing.id });
  }

  const { data: newEntry, error: insertError } = await adminClient
    .from("matchmaking_queue")
    .insert({ user_id: currentUserId, status: "waiting", game_ruleset: ruleset })
    .select("id")
    .single();

  if (insertError) {
    return json({ error: insertError.message }, 500);
  }

  return json({ status: "waiting", queueId: newEntry.id });
});

async function readJson(req: Request): Promise<{ ruleset?: unknown } | null> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
