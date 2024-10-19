import { Context } from "./deps.ts";

// Adapter functions
export async function createRequestEvent(ctx: Context) {
  const url = ctx.request.url.toString();
  const method = ctx.request.method;
  const headers = new Headers();

  // Clone headers from ctx.request
  for (const [key, value] of ctx.request.headers.entries()) {
    headers.set(key, value);
  }

  // Include cookies in headers
  const cookieHeader = ctx.request.headers.get("cookie");
  if (cookieHeader) {
    headers.set("cookie", ctx.request.headers.get("cookie") || "");
  }

  // Handle body if present
  const hasBody = ctx.request.hasBody;
  let body: BodyInit | undefined;
  if (hasBody) {
    const bodyContent = await ctx.request.body({ type: "stream" }).value;
    body = bodyContent;
  }

  const request = new Request(url, {
    method,
    headers,
    body,
  });

  return {
    request,
    respondWith: (response: Response) => respondWithOak(ctx, response),
  };
}

export async function respondWithOak(ctx: Context, response: Response) {
  ctx.response.status = response.status;

  // Set headers
  for (const [key, value] of response.headers.entries()) {
    if (key.toLowerCase() === "set-cookie") {
      // Set cookies using Oak's cookie utilities
      const cookies = parseSetCookie(value);
      for (const cookie of cookies) {
        ctx.cookies.set(cookie.name, cookie.value, cookie.options);
      }
    } else {
      ctx.response.headers.set(key, value);
    }
  }

  // Set body
  if (response.body) {
    ctx.response.body = response.body;
  } else {
    ctx.response.body = null;
  }
}

export function parseSetCookie(setCookieValue: string) {
  const cookies = [];
  const parts = setCookieValue.split(/,(?=[^ ]+\=)/g); // Split cookies if multiple

  for (const part of parts) {
    const [cookiePair, ...cookieOptions] = part.split(";").map((v) => v.trim());
    const [name, value] = cookiePair.split("=");
    const options: any = {};

    for (const option of cookieOptions) {
      const [optName, optValue] = option.split("=");
      const key = optName.toLowerCase();
      options[key] = optValue || true;
    }

    cookies.push({ name, value, options });
  }

  return cookies;
}
