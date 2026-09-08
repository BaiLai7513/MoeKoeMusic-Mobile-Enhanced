package com.moekoe.music;

import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.util.Base64;
import java.io.ByteArrayOutputStream;

public class NativeAudioRecognizer {
    public static void start(final String callbackId) {
        new Thread(new Runnable() {
            @Override public void run() {
                String result;
                try {
                    int sampleRate = 8000;
                    int minBuf = AudioRecord.getMinBufferSize(sampleRate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
                    if (minBuf <= 0) minBuf = sampleRate * 2;
                    int bufSize = Math.max(minBuf, sampleRate * 2);
                    AudioRecord recorder = new AudioRecord(MediaRecorder.AudioSource.MIC, sampleRate,
                            AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, bufSize);
                    if (recorder.getState() != AudioRecord.STATE_INITIALIZED) {
                        callResult(callbackId, "ERR:INIT_FAILED");
                        return;
                    }
                    recorder.startRecording();
                    ByteArrayOutputStream pcm = new ByteArrayOutputStream();
                    byte[] buffer = new byte[bufSize];
                    long start = System.currentTimeMillis();
                    while (System.currentTimeMillis() - start < 6000) {
                        int read = recorder.read(buffer, 0, buffer.length);
                        if (read > 0) pcm.write(buffer, 0, read);
                    }
                    recorder.stop();
                    recorder.release();
                    byte[] wav = createWav(pcm.toByteArray(), sampleRate);
                    result = Base64.encodeToString(wav, Base64.NO_WRAP);
                } catch (Throwable t) {
                    result = "ERR:" + (t.getMessage() == null ? t.getClass().getSimpleName() : t.getMessage());
                }
                callResult(callbackId, result);
            }
        }).start();
    }

    private static void callResult(String callbackId, String result) {
        try {
            Class<?> cls = Class.forName("com.moekoe.music.MainActivity");
            cls.getMethod("postNativeRecordResult", String.class, String.class).invoke(null, callbackId, result);
        } catch (Throwable ignored) {}
    }

    private static byte[] createWav(byte[] pcm, int sampleRate) throws Exception {
        int channels = 1;
        int bits = 16;
        int dataLen = pcm.length;
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        writeString(out, "RIFF");
        writeInt(out, 36 + dataLen);
        writeString(out, "WAVE");
        writeString(out, "fmt ");
        writeInt(out, 16);
        writeShort(out, (short) 1);
        writeShort(out, (short) channels);
        writeInt(out, sampleRate);
        writeInt(out, sampleRate * channels * bits / 8);
        writeShort(out, (short) (channels * bits / 8));
        writeShort(out, (short) bits);
        writeString(out, "data");
        writeInt(out, dataLen);
        out.write(pcm);
        return out.toByteArray();
    }

    private static void writeString(ByteArrayOutputStream out, String s) throws Exception {
        byte[] b = s.getBytes("US-ASCII");
        out.write(b, 0, b.length);
    }

    private static void writeInt(ByteArrayOutputStream out, int v) throws Exception {
        out.write(v & 0xff); out.write((v >> 8) & 0xff); out.write((v >> 16) & 0xff); out.write((v >> 24) & 0xff);
    }

    private static void writeShort(ByteArrayOutputStream out, short v) throws Exception {
        out.write(v & 0xff); out.write((v >> 8) & 0xff);
    }
}
