package com.moekoe.music;

import android.app.Activity;
import android.os.Build;

import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;

/**
 * Registers a predictive-back callback on Android 13+ so the system back gesture
 * animation stays responsive instead of falling back to the legacy back path.
 *
 * <p>Uses reflection so the class can still load on older Android versions.</p>
 */
public final class BackGestureHelper {
    private BackGestureHelper() {
    }

    public static void register(final Activity activity) {
        if (activity == null || Build.VERSION.SDK_INT < 33) {
            return;
        }
        try {
            Class<?> dispatcherClass = Class.forName("android.window.OnBackInvokedDispatcher");
            Class<?> callbackClass = Class.forName("android.window.OnBackInvokedCallback");
            Object dispatcher = activity.getClass().getMethod("getOnBackInvokedDispatcher").invoke(activity);
            if (dispatcher == null) {
                return;
            }
            Method register = dispatcherClass.getMethod(
                    "registerOnBackInvokedCallback", int.class, callbackClass);
            Object callback = Proxy.newProxyInstance(
                    callbackClass.getClassLoader(),
                    new Class<?>[]{callbackClass},
                    new InvocationHandler() {
                        @Override
                        public Object invoke(Object proxy, Method method, Object[] args) {
                            if ("onBackInvoked".equals(method.getName())) {
                                try {
                                    activity.onBackPressed();
                                } catch (Throwable ignored) {
                                }
                            }
                            return null;
                        }
                    });
            register.invoke(dispatcher, 0, callback);
        } catch (Throwable ignored) {
        }
    }
}
