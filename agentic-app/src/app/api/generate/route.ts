import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

type EnhancedPromptPayload = {
  imagePrompt: string;
  videoPrompt: string;
};

function getClient() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  return new OpenAI({ apiKey });
}

async function enhancePrompts(
  client: OpenAI,
  payload: EnhancedPromptPayload,
): Promise<EnhancedPromptPayload> {
  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.8,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are a creative director. Rewrite prompts to be detailed, grounded, and photorealistic while respecting the original intent. Your response must be valid JSON with properties imagePrompt and videoPrompt.",
      },
      {
        role: "user",
        content: JSON.stringify(payload),
      },
    ],
  });

  const content = completion.choices[0]?.message?.content ?? "";

  try {
    const parsed = JSON.parse(content);
    if (
      typeof parsed.imagePrompt === "string" &&
      typeof parsed.videoPrompt === "string"
    ) {
      return parsed;
    }
  } catch (error) {
    console.error("Failed to parse enhanced prompts:", content, error);
  }

  return payload;
}

async function createImage(client: OpenAI, prompt: string): Promise<string> {
  const image = await client.images.generate({
    model: "gpt-image-1",
    prompt,
    size: "1024x1024",
    response_format: "b64_json",
  });

  const base64 = image.data?.[0]?.b64_json;

  if (!base64) {
    throw new Error("Image generation failed");
  }

  return base64;
}

export async function POST(request: NextRequest) {
  try {
    const client = getClient();

    let imagePrompt: string | null = null;
    let videoPrompt: string | null = null;

    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      const body = await request.json();
      imagePrompt = body.imagePrompt;
      videoPrompt = body.videoPrompt;
    } else {
      const formData = await request.formData();
      imagePrompt = String(formData.get("imagePrompt") ?? "");
      videoPrompt = String(formData.get("videoPrompt") ?? "");
    }

    if (!imagePrompt || !videoPrompt) {
      return NextResponse.json(
        { error: "Both imagePrompt and videoPrompt are required" },
        { status: 400 },
      );
    }

    const enhanced = await enhancePrompts(client, {
      imagePrompt,
      videoPrompt,
    });

    const base64Image = await createImage(client, enhanced.imagePrompt);

    return NextResponse.json(
      {
        enhancedImagePrompt: enhanced.imagePrompt,
        enhancedVideoPrompt: enhanced.videoPrompt,
        imageBase64: base64Image,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unexpected server error",
      },
      { status: 500 },
    );
  }
}
