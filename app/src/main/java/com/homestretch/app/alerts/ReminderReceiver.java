package com.homestretch.app.alerts;

import android.Manifest;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.homestretch.app.MainActivity;
import com.homestretch.app.R;
import com.homestretch.app.data.Dose;
import com.homestretch.app.data.RecoveryRepository;

/**
 * Runs when an alarm goes off: shows the notification with "Taken" and "Snooze" buttons,
 * and sets tomorrow's alarm for daily medicines.
 */
public class ReminderReceiver extends BroadcastReceiver {

    static final String ACTION_FIRE = "com.homestretch.app.REMINDER_FIRE";
    static final String ACTION_TAKEN = "com.homestretch.app.REMINDER_TAKEN";
    static final String ACTION_SNOOZE = "com.homestretch.app.REMINDER_SNOOZE";

    private static final long SNOOZE_MILLIS = 10 * 60 * 1000;

    @Override
    public void onReceive(Context context, Intent intent) {
        String key = intent.getStringExtra(ReminderScheduler.EXTRA_KEY);
        if (key == null || intent.getAction() == null) return;

        switch (intent.getAction()) {
            case ACTION_FIRE:
                onFire(context, key);
                break;
            case ACTION_TAKEN:
                markTaken(intent.getIntExtra("doseId", -1));
                NotificationManagerCompat.from(context).cancel(key.hashCode());
                break;
            case ACTION_SNOOZE:
                NotificationManagerCompat.from(context).cancel(key.hashCode());
                ReminderScheduler.scheduleIn(context, "snooze-" + key,
                        intent.getStringExtra("title"), intent.getStringExtra("body"),
                        intent.getIntExtra("doseId", -1), SNOOZE_MILLIS);
                break;
        }
    }

    private void onFire(Context context, String key) {
        ReminderScheduler.Reminder r = ReminderScheduler.find(context, key);
        if (r == null) return;   // cancelled since

        // Set the next one first, so a crash below can't lose tomorrow's reminder.
        if (r.daily) ReminderScheduler.arm(context, r);
        else ReminderScheduler.remove(context, key);

        show(context, r);
    }

    private void show(Context context, ReminderScheduler.Reminder r) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            return;   // the person said no to notifications
        }
        ReminderScheduler.createChannel(context);
        int id = r.key.hashCode();

        PendingIntent open = PendingIntent.getActivity(context, id,
                new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder n = new NotificationCompat.Builder(context, ReminderScheduler.CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_medicine)
                .setContentTitle(r.title)
                .setContentText(r.body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(r.body))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
                .setDefaults(NotificationCompat.DEFAULT_ALL)
                .setAutoCancel(true)
                .setContentIntent(open);

        if (r.doseId >= 0) {
            n.addAction(R.drawable.ic_check, "Taken", action(context, ACTION_TAKEN, r, id + 1));
        }
        n.addAction(R.drawable.ic_clock, "Snooze 10 min", action(context, ACTION_SNOOZE, r, id + 2));

        NotificationManagerCompat.from(context).notify(id, n.build());
    }

    private PendingIntent action(Context context, String action, ReminderScheduler.Reminder r, int requestCode) {
        Intent i = new Intent(context, ReminderReceiver.class)
                .setAction(action)
                .putExtra(ReminderScheduler.EXTRA_KEY, r.key)
                .putExtra("doseId", r.doseId)
                .putExtra("title", r.title)
                .putExtra("body", r.body);
        return PendingIntent.getBroadcast(context, requestCode, i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private void markTaken(int doseId) {
        if (doseId < 0) return;
        for (Dose d : RecoveryRepository.get().doses) {
            if (d.id == doseId) d.status = Dose.Status.TAKEN;
        }
    }
}
