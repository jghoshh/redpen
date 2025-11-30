import type { NextRequest } from "next/server";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing OpenRouter API key" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const completionRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages,
        temperature: 0.7,
      }),
    });

    if (!completionRes.ok) {
      const body = await completionRes.text();
      return new Response(JSON.stringify({ error: body || "Upstream error" }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    const completionData = await completionRes.json();
    const content =
      completionData?.choices?.[0]?.message?.content ??
      completionData?.choices?.[0]?.text ??
      "";

    return new Response(JSON.stringify({ message: content }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: "Unexpected error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
