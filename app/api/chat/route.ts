import { NextRequest } from "next/server";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  try {
    const { messages, baseUrl, apiKey, model } = await req.json();

    if (!baseUrl || !apiKey) {
      return new Response(
        JSON.stringify({
          error:
            "Base URL and API Key are required. Open Settings (⚙) to configure.",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Normalize the base URL and build the completions endpoint
    const base = baseUrl.replace(/\/+$/, "");
    const url = base.endsWith("/v1/chat/completions")
      ? base
      : base.endsWith("/v1")
        ? `${base}/chat/completions`
        : `${base}/v1/chat/completions`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
      }),
    });

    if (!response.ok) {
      let errorText: string;
      try {
        errorText = await response.text();
      } catch {
        errorText = response.statusText;
      }
      return new Response(
        JSON.stringify({
          error: `API Error (${response.status}): ${errorText.slice(0, 500)}`,
        }),
        {
          status: response.status,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Stream the response back to the client
    return new Response(response.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
