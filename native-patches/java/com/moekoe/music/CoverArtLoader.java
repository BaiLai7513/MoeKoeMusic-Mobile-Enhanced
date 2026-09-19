package com.moekoe.music;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
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
            MediaMetadata.Builder builder = new MediaMetadata.Builder()
                    .putString(MediaMetadata.METADATA_KEY_TITLE, title)
                    .putString(MediaMetadata.METADATA_KEY_ARTIST, artist)
                    .putLong(MediaMetadata.METADATA_KEY_DURATION, durationMs)
                    .putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, bitmap)
                    .putBitmap(MediaMetadata.METADATA_KEY_ART, bitmap)
                    .putBitmap(MediaMetadata.METADATA_KEY_DISPLAY_ICON, bitmap);
            session.setMetadata(builder.build());
            try {
                Class<?> service = Class.forName("com.moekoe.music.MusicForegroundService");
                service.getMethod("setArtworkBitmap", Bitmap.class).invoke(null, bitmap);
            } catch (Throwable ignored2) {
            }
        } catch (Throwable ignored) {
        }
    }
}
