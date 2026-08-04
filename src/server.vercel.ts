/**
 * Vercel server entry.
 *
 * Vercel's Node/Edge runtimes invoke a Web-standard `fetch(request)` handler,
 * unlike Cloudflare Workers which also pass `env` and `ctx`. This entry adapts
 * the shared TanStack Start server handler to that signature so the same app
 * code compiles for both targets.
 *
 * Select it with: `vite build --mode vercel` (see scripts/validate-build.mjs)
 * or by pointing `tanstackStart.server.entry` at "server.vercel".
 */
import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env?: unknown, ctx?: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export async function handler(request: Request): Promise<Response> {
  try {
    const entry = await getServerEntry();
    const response = await entry.fetch(request);
    return await normalizeCatastrophicSsrResponse(response);
  } catch (error) {
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
}

export default { fetch: handler };
