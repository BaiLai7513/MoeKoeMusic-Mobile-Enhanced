package com.moekoe.music;

import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.LinearLayout;
import android.widget.TextView;

public class FloatLyricsService extends Service {
    private static FloatLyricsService instance;
    private WindowManager wm;
    private LinearLayout root;
    private TextView lyricsView;
    private WindowManager.LayoutParams params;
    private float startX, startY, startTouchX, startTouchY;

    public static void show(Context context, String text) {
        Intent intent = new Intent(context, FloatLyricsService.class);
        intent.setAction("show");
        intent.putExtra("text", text == null ? "" : text);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent);
        else context.startService(intent);
    }

    public static void hide(Context context) {
        Intent intent = new Intent(context, FloatLyricsService.class);
        intent.setAction("hide");
        context.startService(intent);
    }

    public static void update(final String text) {
        if (instance == null) return;
        new Handler(Looper.getMainLooper()).post(new Runnable() {
            @Override public void run() { instance.setText(text == null ? "" : text); }
        });
    }

    @Override public void onCreate() {
        super.onCreate();
        instance = this;
        wm = (WindowManager) getSystemService(WINDOW_SERVICE);
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && "hide".equals(intent.getAction())) { stopSelf(); return START_NOT_STICKY; }
        showWindow();
        String text = intent != null ? intent.getStringExtra("text") : "";
        setText(text == null ? "" : text);
        return START_STICKY;
    }

    private void showWindow() {
        if (root != null) return;
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(20, 12, 20, 12);
        root.setBackgroundColor(0xAA000000);
        root.setGravity(Gravity.CENTER);
        TextView close = new TextView(this);
        close.setText("\u00d7");
        close.setTextSize(18);
        close.setTextColor(Color.WHITE);
        close.setGravity(Gravity.RIGHT);
        close.setPadding(0, 0, 0, 4);
        close.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { stopSelf(); }
        });
        lyricsView = new TextView(this);
        lyricsView.setTextColor(Color.WHITE);
        lyricsView.setTextSize(16);
        lyricsView.setGravity(Gravity.CENTER);
        lyricsView.setMaxWidth(900);
        root.addView(close, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        root.addView(lyricsView, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY : WindowManager.LayoutParams.TYPE_PHONE;
        params = new WindowManager.LayoutParams(WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.WRAP_CONTENT, type,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN, PixelFormat.TRANSLUCENT);
        params.gravity = Gravity.TOP | Gravity.CENTER_HORIZONTAL;
        params.y = 200;
        root.setOnTouchListener(new View.OnTouchListener() {
            @Override public boolean onTouch(View v, MotionEvent event) {
                switch (event.getAction()) {
                    case MotionEvent.ACTION_DOWN:
                        startX = params.x; startY = params.y; startTouchX = event.getRawX(); startTouchY = event.getRawY();
                        return true;
                    case MotionEvent.ACTION_MOVE:
                        params.x = (int)(startX + event.getRawX() - startTouchX);
                        params.y = (int)(startY + event.getRawY() - startTouchY);
                        if (wm != null && root != null) wm.updateViewLayout(root, params);
                        return true;
                }
                return false;
            }
        });
        try { wm.addView(root, params); } catch (Exception e) { stopSelf(); }
    }

    private void setText(String text) {
        if (lyricsView != null) lyricsView.setText(text);
    }

    @Override public void onDestroy() {
        if (root != null && wm != null) {
            try { wm.removeView(root); } catch (Exception ignored) {}
        }
        root = null;
        lyricsView = null;
        if (instance == this) instance = null;
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
