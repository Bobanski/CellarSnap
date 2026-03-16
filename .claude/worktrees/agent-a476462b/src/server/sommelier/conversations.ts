import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { SommelierMessage } from "@/server/sommelier/types";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

function summarizeTitle(content: string) {
  const trimmed = content.trim().replace(/\s+/g, " ");
  if (trimmed.length <= 80) {
    return trimmed;
  }
  return `${trimmed.slice(0, 77).trimEnd()}...`;
}

export async function ensureSommelierConversation(params: {
  supabase?: AdminClient;
  userId: string;
  conversationId?: string | null;
  titleSeed?: string | null;
}) {
  const supabase = params.supabase ?? createSupabaseAdminClient();

  if (params.conversationId) {
    const { data, error } = await supabase
      .from("sommelier_conversations")
      .select("id, user_id")
      .eq("id", params.conversationId)
      .eq("user_id", params.userId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (data?.id) {
      return data.id;
    }
  }

  const { data, error } = await supabase
    .from("sommelier_conversations")
    .insert({
      user_id: params.userId,
      title: params.titleSeed ? summarizeTitle(params.titleSeed) : null,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(error?.message ?? "Unable to create sommelier conversation.");
  }

  return data.id;
}

export async function appendSommelierMessages(params: {
  supabase?: AdminClient;
  conversationId: string;
  messages: SommelierMessage[];
}) {
  const supabase = params.supabase ?? createSupabaseAdminClient();
  const rows = params.messages
    .map((message) => ({
      conversation_id: params.conversationId,
      role: message.role,
      content: message.content.trim(),
    }))
    .filter((row) => row.content.length > 0);

  if (rows.length === 0) {
    return;
  }

  const { error } = await supabase.from("sommelier_messages").insert(rows);
  if (error) {
    throw new Error(error.message);
  }

  const { error: touchError } = await supabase
    .from("sommelier_conversations")
    .update({
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.conversationId);

  if (touchError) {
    throw new Error(touchError.message);
  }
}
