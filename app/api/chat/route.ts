import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  try {
    const { messages, baseUrl, apiKey, model } = await req.json();

    const finalBaseUrl = baseUrl || process.env.BASE_URL;
    const finalApiKey = apiKey || process.env.API_KEY;
    const finalModel = model || process.env.MODEL || "claude-opus-5-thinking";

    if (!finalApiKey || !finalBaseUrl) {
      return NextResponse.json(
        { error: "API Key and Base URL are required." },
        { status: 400 }
      );
    }

    // Normalize base URL
    let apiUrl = finalBaseUrl.trim();
    if (!apiUrl.endsWith("/v1/chat/completions") && !apiUrl.endsWith("/chat/completions")) {
      apiUrl = apiUrl.replace(/\/+$/, "") + "/v1/chat/completions";
    }

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${finalApiKey}`,
      },
      body: JSON.stringify({
        model: finalModel.trim(),
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
