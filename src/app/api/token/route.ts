import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { tokenFromSession, type SessionLike } from "@/lib/spotify/session";
import { apiError } from "@/lib/api/http";

export async function GET() {
  try {
    const token = tokenFromSession((await auth()) as SessionLike | null);
    return NextResponse.json({ accessToken: token });
  } catch (e) {
    return apiError(e);
  }
}
