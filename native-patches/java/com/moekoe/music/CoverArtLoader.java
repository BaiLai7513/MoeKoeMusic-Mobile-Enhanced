package com.moekoe.music;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Rect;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.os.Handler;
import android.os.Looper;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Downloads the current song cover on a background thread and injects it into the
 * platform MediaSession metadata so the system media card / lockscreen can show it.
 */
public final class CoverArtLoader {
    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private static String lastUrl = "";
    private static Bitmap lastBitmap;
    private static String loadingUrl = "";
    private static String appliedUrl = "";

    private CoverArtLoader() {
    }

    public static void load(final MediaSession session, final String artworkUrl,
                            final String titleWithArtist, final long durationMs) {
        if (session == null) {
            return;
        }
        final String url = artworkUrl == null ? "" : artworkUrl.trim();
        if (url.length() == 0) {
            return;
        }
        if (url.equals(lastUrl) && lastBitmap != null) {
            if (!url.equals(appliedUrl)) {
                apply(session, lastBitmap, titleWithArtist, durationMs);
                appliedUrl = url;
            }
            return;
        }
        if (url.equals(loadingUrl)) {
            return;
        }
        loadingUrl = url;
        new Thread(new Runnable() {
            @Override
            public void run() {
                Bitmap bitmap = null;
                HttpURLConnection conn = null;
                InputStream in = null;
                try {
                    URL u = new URL(url);
                    conn = (HttpURLConnection) u.openConnection();
                    conn.setConnectTimeout(5000);
                    conn.setReadTimeout(10000);
                    conn.setInstanceFollowRedirects(true);
                    conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android) MoeKoeMusic");
                    conn.connect();
                    int code = conn.getResponseCode();
                    if (code >= 200 && code < 400) {
                        in = conn.getInputStream();
                        bitmap = BitmapFactory.decodeStream(in);
                        bitmap = sanitize(bitmap);
                    }
                } catch (Throwable ignored) {
                } finally {
                    try {
                        if (in != null) in.close();
                    } catch (Throwable ignored) {
                    }
                    try {
                        if (conn != null) conn.disconnect();
                    } catch (Throwable ignored) {
                    }
                }
                final Bitmap result = bitmap;
                if (result != null) {
                    lastUrl = url;
                    lastBitmap = result;
                    appliedUrl = url;
                }
                loadingUrl = "";
                MAIN.post(new Runnable() {
                    @Override
                    public void run() {
                        apply(session, result, titleWithArtist, durationMs);
                    }
                });
            }
        }, "MoeCoverArtLoader").start();
    }

    private static Bitmap sanitize(Bitmap src) {
        if (src == null) {
            return null;
        }
        try {
            int w = src.getWidth();
            int h = src.getHeight();
            if (w <= 0 || h <= 0) {
                return src;
            }
            int max = 512;
            float scale = Math.min(1f, max / (float) Math.max(w, h));
            int nw = Math.max(1, Math.round(w * scale));
            int nh = Math.max(1, Math.round(h * scale));
            Bitmap out = Bitmap.createBitmap(nw, nh, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(out);
            Paint paint = new Paint(Paint.FILTER_BITMAP_FLAG);
            canvas.drawBitmap(src, null, new Rect(0, 0, nw, nh), paint);
            return out;
        } catch (Throwable ignored) {
            try {
                return src.copy(Bitmap.Config.ARGB_8888, false);
            } catch (Throwable ignored2) {
                return src;
            }
        }
    }

    private static void apply(MediaSession session, Bitmap bitmap,
                              String titleWithArtist, long durationMs) {
        if (session == null || bitmap == null) {
            return;
        }
        try {
            String title = titleWithArtist == null ? "" : titleWithArtist;
            String artist = "";
            int sep = title.indexOf(" - ");
            if (sep > 0) {
                artist = title.substring(sep + 3);
                title = title.substring(0, sep);
            }
            MediaMetadata metadata = new MediaMetadata.Builder()
                    .putString(MediaMetadata.METADATA_KEY_TITLE, title)
                    .putString(MediaMetadata.METADATA_KEY_ARTIST, artist)
                    .putLong(MediaMetadata.METADATA_KEY_DURATION, durationMs)
                    .putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, bitmap)
                    .putBitmap(MediaMetadata.METADATA_KEY_ART, bitmap)
                    .putBitmap(MediaMetadata.METADATA_KEY_DISPLAY_ICON, bitmap)
                    .build();
            session.setMetadata(metadata);
            try {
                Class<?> service = Class.forName("com.moekoe.music.MusicForegroundService");
                service.getMethod("setArtworkBitmap", Bitmap.class).invoke(null, bitmap);
            } catch (Throwable ignored2) {
            }
            // Some OEM lockscreens only refresh the media artwork when the
            // MediaSession metadata changes after the notification update.
            session.setMetadata(metadata);
        } catch (Throwable ignored) {
        }
    }
}
