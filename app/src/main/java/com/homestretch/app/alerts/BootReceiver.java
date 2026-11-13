package com.homestretch.app.alerts;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Phones forget alarms when they restart, so set them all again. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String a = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(a)
                || Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)
                || "android.intent.action.TIME_SET".equals(a)
                || Intent.ACTION_TIMEZONE_CHANGED.equals(a)) {
            ReminderScheduler.rearmAll(context);
        }
    }
}
