// ============================================================
// Aya Bac 2027 — aya-mcp entrypoint (thin bootstrap)
// ------------------------------------------------------------
// The full Edge Function lives in ./index.ts. It is built to
// ./dist/aya-mcp.bundle.js and loaded here at runtime.
//
// Why a bootstrap instead of deploying index.ts directly?
//   The hosted deploy pipeline mangles non-ASCII bodies and
//   cannot resolve remote `import` statements, which made the
//   function fail before it could start serving requests.
//   Fetching a prebuilt, ASCII bundle and evaluating it keeps
//   the Arabic content intact and yields a stable cold start.
// ============================================================

const BUNDLE_URL: string = Deno.env.get("AYA_MCP_BUNDLE_URL") ||
  "https://raw.githubusercontent.com/TaharBn12/Bac/HEAD/supabase/functions/aya-mcp/dist/aya-mcp.bundle.js";

async function loadBundle(): Promise<void> {
  const res = await fetch(BUNDLE_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`bundle fetch failed: HTTP ${res.status}`);
  const code = await res.text();
  if (!code || code.length < 1000) throw new Error("bundle payload is empty");
  // Evaluate the bundle with the live Deno namespace so it can call Deno.serve.
  new Function("Deno", code)(Deno);
}

try {
  await loadBundle();
} catch (err) {
  const message = String((err as Error)?.message || err);
  Deno.serve(() =>
    new Response(
      JSON.stringify({
        ok: false,
        service: "aya-bac-2027-mcp",
        version: "1.4.0",
        error: "bootstrap_failed",
        detail: message,
      }),
      { status: 503, headers: { "Content-Type": "application/json; charset=utf-8" } },
    )
  );
}
