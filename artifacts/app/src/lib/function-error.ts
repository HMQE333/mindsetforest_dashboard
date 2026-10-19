import { supabase } from "@/integrations/supabase/client";

/**
 * What went wrong in an edge function call, in words he can act on: the
 * function's own { error } message instead of "Edge Function returned a
 * non-2xx status code", and a plain line when the server could not be reached.
 */
export async function functionErrorMessage(error: unknown): Promise<string> {
  const e = error as { name?: string; message?: string; context?: { json?: () => Promise<{ error?: unknown }>; status?: number } };
  let message = e?.message || "Something went wrong";
  try {
    const json = await e?.context?.json?.();
    if (json?.error) message = String(json.error);
  } catch { /* not JSON */ }
  if (e?.name === "FunctionsFetchError" || /Failed to send a request to the Edge Function/i.test(message)) {
    return "Could not reach the server. Check your connection and try again.";
  }
  if (e?.name === "FunctionsRelayError") return `The server could not run the function: ${message}`;
  return message;
}

/** Calls an edge function; a failure comes back as an Error carrying the function's own message. */
export async function invokeFunction<T = Record<string, unknown>>(name: string, body: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body: body as Record<string, unknown> });
  if (error) throw new Error(await functionErrorMessage(error));
  if (data && typeof data === "object" && "error" in data && (data as { error?: unknown }).error) {
    throw new Error(String((data as { error: unknown }).error));
  }
  return data as T;
}
