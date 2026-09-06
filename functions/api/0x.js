// Cloudflare Pages Function — proxies requests to the 0x Swap API.
//
// Why this exists: 0x's API deliberately blocks direct browser calls
// (CORS + custom-header rejection) as a security measure, and explicitly
// recommends routing through a backend. See:
// https://0x.org/docs/developer-resources/faqs-and-troubleshooting
//
// This also keeps the API key and fee-recipient address fully server-side —
// never sent to, or visible from, the browser at all.
//
// File-based routing: Cloudflare Pages automatically maps
// /functions/api/0x.js to the route /api/0x — no config file needed.
//
// Deploy: in your Cloudflare Pages project → Settings → Environment
// variables, add:
//   ZEROX_API_KEY          your key from 0x.org
//   FEE_RECIPIENT_ADDRESS   the wallet that collects the 0.05% fee

export async function onRequest(context) {
  const { request, env } = context;

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Content-Type": "application/json",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  if (type !== "price" && type !== "quote") {
    return new Response(
      JSON.stringify({ code: "BAD_REQUEST", reason: "type must be 'price' or 'quote'" }),
      { status: 400, headers: corsHeaders }
    );
  }

  const apiKey = env.ZEROX_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ code: "SERVER_NOT_CONFIGURED", reason: "ZEROX_API_KEY is not set on the server." }),
      { status: 500, headers: corsHeaders }
    );
  }

  const params = new URLSearchParams(url.searchParams);
  params.delete("type");
  params.set("swapFeeBps", "5"); // 0.05% — fixed server-side, not client-controllable

  const feeRecipient = env.FEE_RECIPIENT_ADDRESS;
  if (feeRecipient) params.set("swapFeeRecipient", feeRecipient);

  try {
    const upstream = await fetch(`https://api.0x.org/swap/permit2/${type}?${params.toString()}`, {
      headers: {
        "0x-api-key": apiKey,
        "0x-version": "v2",
      },
    });
    const data = await upstream.text(); // pass through as-is
    return new Response(data, {
      status: upstream.status,
      headers: corsHeaders,
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ code: "UPSTREAM_UNREACHABLE", reason: "Couldn't reach 0x's API." }),
      { status: 502, headers: corsHeaders }
    );
  }
}
