import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function ids(url: string) {
  try {
    const u = new URL(url);
    return {
      videoId: u.searchParams.get("v") || (u.hostname === "youtu.be" ? u.pathname.slice(1) : null),
      playlistId: u.searchParams.get("list") || null,
    };
  } catch {
    return { videoId: null, playlistId: null };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: cors });
  }

  try {
    const auth = req.headers.get("Authorization") || "";
    const token = auth.replace(/^Bearer\s+/i, "");
    const sb = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_ANON_KEY") || "",
      { global: { headers: { Authorization: auth } } }
    );
    const { data: { user }, error } = await sb.auth.getUser(token);
    if (error || !user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, headers: cors });
    }

    const body = await req.json();
    const i = ids(String(body.url || ""));
    if (!i.videoId && !i.playlistId) throw new Error("No YouTube video or playlist id found");

    if (i.videoId) {
      try {
        const o = await fetch(
          "https://www.youtube.com/oembed?url=" +
          encodeURIComponent(String(body.url)) +
          "&format=json"
        );
        if (o.ok) {
          const x = await o.json();
          return new Response(JSON.stringify({
            type: "video",
            item: {
              title: x.title || "YouTube Lesson",
              channel_title: x.author_name || null,
              thumbnail: x.thumbnail_url || null,
              video_id: i.videoId,
            },
          }), { headers: cors });
        }
      } catch (_) {}
      return new Response(JSON.stringify({
        type: "video",
        item: { title: "YouTube Lesson", channel_title: null, thumbnail: null, video_id: i.videoId },
      }), { headers: cors });
    }

    // Playlist import intentionally remains API-key-free. The client embeds the
    // playlist directly with the official IFrame Player API and stores the
    // playlist id/progress as the persistent Lucid resource.
    return new Response(JSON.stringify({
      type: "playlist",
      playlist_id: i.playlistId,
      title: "YouTube Playlist",
      items: [],
    }), { headers: cors });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "YouTube import error" }),
      { status: 500, headers: cors }
    );
  }
});
