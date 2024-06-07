import { Soul } from "@opensouls/engine";
import { Hono } from "hono";
import { createBunWebSocket } from "hono/bun";
import { stream } from "hono/streaming";
import fetch from "node-fetch";
import env from "./env.js";

const app = new Hono();

const { upgradeWebSocket, websocket } = createBunWebSocket();

app.get("/audio", async (c) => {
  const url = c.req.query("url");
  console.log("url", url);

  if (!url) {
    throw new Error("Audio URL not provided");
  }

  const response = await fetch(url, {
    headers: {
      AUTHORIZATION: env.PLAYHT_API_KEY,
      "X-USER-ID": env.PLAYHT_USER_ID,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch audio stream");
  }

  const body = nodeToWebReadable(response.body);

  return stream(c, async (stream) => {
    await stream.pipe(body);
  });
});

app.get(
  "/ws",
  upgradeWebSocket((c) => {
    const url = new URL(c.req.url);
    const clientId = url.searchParams.get("client_id");

    if (!clientId) {
      throw new Error("Client ID not provided");
    }

    const soul = new Soul({
      soulId: clientId,
      blueprint: "milton",
      organization: env.SOUL_ENGINE_ORGANIZATION,
      token: env.SOUL_ENGINE_TOKEN,
      debug: env.SOUL_ENGINE_DEBUG === "true",
    });

    return {
      onOpen(_event, ws) {
        soul.on("says", async (event) => {
          const content = await event.content();
          ws.send(
            JSON.stringify({
              text: content,
            })
          );

          const audioUrl = await getTtsStream(content);
          ws.send(
            JSON.stringify({
              audio: audioUrl,
            })
          );
        });

        soul.onError((error) => {
          console.error("Soul error", error);
        });

        soul.connect();
      },
      onMessage(event) {
        soul.dispatch(JSON.parse(event.data.toString()));
      },
      onClose() {
        console.log("Closing soul connection, id:" + clientId);
        soul.disconnect();
      },
    };
  })
);

async function getTtsStream(text: string) {
  const url = "https://api.play.ht/api/v2/tts/stream";
  const options = {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      AUTHORIZATION: env.PLAYHT_API_KEY,
      "X-USER-ID": env.PLAYHT_USER_ID,
    },
    body: JSON.stringify({
      text,
      voice: "s3://voice-cloning-zero-shot/261923bd-a10a-4a90-bced-0ce2b0230398/hooksaad/manifest.json",
      speed: 1,
      sample_rate: 24000,
      voice_engine: "PlayHT2.0-turbo",
      voice_guidance: 2,
      style_guidance: 10,
    }),
  };

  const response = await fetch(url, options);
  const data = await response.json();
  return data.href;
}

function nodeToWebReadable(nodeStream: NodeJS.ReadableStream): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      nodeStream.on("data", (chunk) => {
        controller.enqueue(new Uint8Array(chunk));
      });

      nodeStream.on("end", () => {
        controller.close();
      });

      nodeStream.on("error", (err) => {
        controller.error(err);
      });
    },
  });
}

const port = env.PORT;

Bun.serve({
  fetch: app.fetch,
  websocket,
  port,
});

console.log(`Server running on port ${port}`);
