import { NextResponse } from "next/server";
import { ZodError } from "zod";

/**
 * Map an unknown thrown error to a JSON NextResponse with an appropriate status.
 * - ZodError            → 400 (readable summary of issues)
 * - auth errors         → 401 (message mentions authenticated / re-login / expired)
 * - Spotify upstream    → 502 (message starts with "Spotify " or mentions rate-limited)
 * - anything else       → 400
 */
export function apiError(e: unknown): NextResponse {
  if (e instanceof ZodError) {
    const message = e.issues
      .map((i) => i.path.join(".") + ": " + i.message)
      .join("; ");
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const message = e instanceof Error ? e.message : String(e);
  const lower = message.toLowerCase();

  if (
    lower.includes("authenticated") ||
    lower.includes("re-login") ||
    lower.includes("expired")
  ) {
    return NextResponse.json({ error: message }, { status: 401 });
  }

  if (message.startsWith("Spotify ") || lower.includes("rate-limited")) {
    return NextResponse.json({ error: message }, { status: 502 });
  }

  return NextResponse.json({ error: message }, { status: 400 });
}
