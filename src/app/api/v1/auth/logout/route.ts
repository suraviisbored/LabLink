import { ok, withApi } from "@/lib/api/handler";
import { sessionCookieOptions } from "@/lib/auth/session";

export async function POST(): Promise<Response> {
  return withApi(async () => {
    const response = ok({ signedOut: true });
    response.cookies.set("lablink_session", "", { ...sessionCookieOptions(), maxAge: 0 });
    return response;
  });
}
