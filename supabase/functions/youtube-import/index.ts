import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const KEY = Deno.env.get("YOUTUBE_API_KEY") || "";

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

async function yt(path: string) {
  if (!KEY) throw new Error("YOUTUBE_API_KEY is not configured");
  const joiner = path.includes("?") ? "&" : "?";
  const r = await fetch(
    "https://www.googleapis.com/youtube/v3/" +
    path +
    joiner +
    "key=" +
    encodeURIComponent(KEY)
  );
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error?.message || "YouTube Data API error");
  return d;
}

async function oembed(videoId: string, url: string) {
  try {
    const r = await fetch(
      "https://www.youtube.com/oembed?url=" +
      encodeURIComponent(url) +
      "&format=json"
    );
    if (!r.ok) return null;
    const x = await r.json();
    return {
      title: x.title || "YouTube Lesson",
      channel_title: x.author_name || null,
      thumbnail: x.thumbnail_url || null,
      video_id: videoId,
    };
  } catch {
    return null;
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
    const url = String(body.url || "");
    const i = ids(url);
    if (!i.videoId && !i.playlistId) {
      throw new Error("No YouTube video or playlist id found");
    }

    if (i.videoId) {
      if (KEY) {
        try {
          const d = await yt(
            "videos?part=snippet,contentDetails,status&id=" +
            encodeURIComponent(i.videoId)
          );
          const item = d.items?.[0];
          if (item) {
            return new Response(JSON.stringify({
              type: "video",
              item: {
                title: item.snippet?.title || "YouTube Lesson",
                channel_title: item.snippet?.channelTitle || null,
                thumbnail: item.snippet?.thumbnails?.high?.url ||
                  item.snippet?.thumbnails?.medium?.url ||
                  item.snippet?.thumbnails?.default?.url || null,
                video_id: i.videoId,
                duration: item.contentDetails?.duration || null,
                published_at: item.snippet?.publishedAt || null,
              },
            }), { headers: cors });
          }
        } catch (_) {}
      }

      const item = await oembed(i.videoId, url);
      return new Response(JSON.stringify({
        type: "video",
        item: item || {
          title: "YouTube Lesson",
          channel_title: null,
          thumbnail: null,
          video_id: i.videoId,
        },
      }), { headers: cors });
    }

    if (!KEY) {
      return new Response(JSON.stringify({
        type: "playlist",
        playlist_id: i.playlistId,
        title: "YouTube Playlist",
        items: [],
        api_key_configured: false,
      }), { headers: cors });
    }

    const p = await yt(
      "playlists?part=snippet,contentDetails&id=" +
      encodeURIComponent(i.playlistId!)
    );
    const playlist = p.items?.[0];
    if (!playlist) throw new Error("YouTube playlist not found or unavailable");

    const items: any[] = [];
    let page = "";
    do {
      const path =
        "playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=" +
        encodeURIComponent(i.playlistId!) +
        (page ? "&pageToken=" + encodeURIComponent(page) : "");
      const data = await yt(path);

      for (const item of data.items || []) {
        const videoId = item.contentDetails?.videoId || item.snippet?.resourceId?.videoId;
        if (!videoId) continue;
        items.push({
          video_id: videoId,
          title: item.snippet?.title || "Playlist item",
          channel_title: item.snippet?.videoOwnerChannelTitle || item.snippet?.channelTitle || null,
          thumbnail:
            item.snippet?.thumbnails?.high?.url ||
            item.snippet?.thumbnails?.medium?.url ||
            item.snippet?.thumbnails?.default?.url || null,
          published_at: item.contentDetails?.videoPublishedAt || null,
          playlist_index: items.length,
        });
        if (items.length >= 500) break;
      }

      page = data.nextPageToken || "";
    } while (page && items.length < 500);

    return new Response(JSON.stringify({
      type: "playlist",
      playlist_id: i.playlistId,
      playlist: {
        title: playlist.snippet?.title || "YouTube Playlist",
        channel_title: playlist.snippet?.channelTitle || null,
        thumbnail:
          playlist.snippet?.thumbnails?.high?.url ||
          playlist.snippet?.thumbnails?.medium?.url ||
          playlist.snippet?.thumbnails?.default?.url || null,
        item_count: Number(playlist.contentDetails?.itemCount || items.length),
      },
      items,
      api_key_configured: true,
    }), { headers: cors });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "YouTube import error" }),
      { status: 500, headers: cors }
    );
  }
});
