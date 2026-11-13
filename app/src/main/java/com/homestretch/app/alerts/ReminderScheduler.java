package com.homestretch.app.alerts;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.os.Build;

import com.homestretch.app.MainActivity;
import com.homestretch.app.data.Appointment;
import com.homestretch.app.data.Dose;
import com.homestretch.app.data.TimeParser;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * Sets real phone alarms for medicines and visits.
 *
 * Each reminder is saved on the phone, so it still fires when the app is closed
 * and is set again after the phone restarts (see BootReceiver).
 * When an alarm goes off, ReminderReceiver shows the notification.
 */
public final class ReminderScheduler {

    public static final String CHANNEL_ID = "medly_reminders";
    static final String EXTRA_KEY = "key";

    private static final String PREFS = "medly_reminders";
    private static final String PREF_LIST = "list";

    private ReminderScheduler() {}

    // ================= Public API =================

    /** Daily reminder for one dose. Returns false if the dose has no clock time. */
    public static boolean scheduleDose(Context context, Dose dose) {
        LocalTime t = TimeParser.parse(dose.time);
        if (t == null) return false;
        Reminder r = new Reminder();
        r.key = "dose-" + dose.id + "-" + t;
        r.title = "Time for " + dose.title();
        r.body = dose.instruction + (dose.note != null ? " · " + dose.note : "")
                + (dose.purpose != null && !dose.purpose.isEmpty() ? "\n" + dose.purpose : "");
        r.doseId = dose.id;
        r.daily = true;
        r.hour = t.getHour();
        r.minute = t.getMinute();
        save(context, r);
        arm(context, r);
        return true;
    }

    /** Two reminders for a visit: the day before, and 2 hours before. */
    public static int scheduleAppointment(Context context, Appointment a) {
        int count = 0;
        long[] offsets = {24 * 60, 120};
        String[] labels = {"Tomorrow", "In 2 hours"};
        for (int i = 0; i < offsets.length; i++) {
            LocalDateTime when = a.start.minusMinutes(offsets[i]);
            long millis = when.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();
            if (millis <= System.currentTimeMillis()) continue;
            Reminder r = new Reminder();
            r.key = "visit-" + a.start + "-" + offsets[i];
            r.title = labels[i] + ": " + a.title;
            r.body = a.whenText() + (a.place != null && !a.place.isEmpty() ? "\n" + a.place : "")
                    + (a.prep != null ? "\n" + a.prep : "");
            r.daily = false;
            r.atMillis = millis;
            save(context, r);
            arm(context, r);
            count++;
        }
        return count;
    }

    /** Clears every saved reminder and sets new ones for the whole plan. Returns how many. */
    public static int scheduleAll(Context context, List<Dose> doses, List<Appointment> appointments) {
        cancelAll(context);
        int count = 0;
        for (Dose d : doses) if (scheduleDose(context, d)) count++;
        for (Appointment a : appointments) count += scheduleAppointment(context, a);
        return count;
    }

    /** A one-time reminder after a delay, used for Snooze and for "Send a test reminder". */
    public static void scheduleIn(Context context, String key, String title, String body,
                                  int doseId, long delayMillis) {
        Reminder r = new Reminder();
        r.key = key;
        r.title = title;
        r.body = body;
        r.doseId = doseId;
        r.daily = false;
        r.atMillis = System.currentTimeMillis() + delayMillis;
        save(context, r);
        arm(context, r);
    }

    public static void cancelAll(Context context) {
        AlarmManager am = context.getSystemService(AlarmManager.class);
        for (Reminder r : loadAll(context)) am.cancel(alarmIntent(context, r.key));
        prefs(context).edit().remove(PREF_LIST).apply();
    }

    /** Called after the phone restarts. */
    public static void rearmAll(Context context) {
        for (Reminder r : loadAll(context)) {
            if (!r.daily && r.atMillis <= System.currentTimeMillis()) {
                remove(context, r.key);
            } else {
                arm(context, r);
            }
        }
    }

    public static int count(Context context) {
        return loadAll(context).size();
    }

    public static void createChannel(Context context) {
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID,
                "Medicine & visit reminders", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Alerts when it's time to take a medicine or go to a visit");
        channel.enableVibration(true);
        channel.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
                new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).build());
        context.getSystemService(NotificationManager.class).createNotificationChannel(channel);
    }

    // ================= Inside =================

    /** One saved reminder. */
    static final class Reminder {
        String key, title, body;
        int doseId = -1;
        boolean daily;
        int hour, minute;   // daily
        long atMillis;      // one-time

        long nextFireMillis() {
            if (!daily) return atMillis;
            ZonedDateTime now = ZonedDateTime.now();
            ZonedDateTime next = now.with(LocalTime.of(hour, minute)).withSecond(0).withNano(0);
            if (!next.isAfter(now)) next = next.plusDays(1);
            return next.toInstant().toEpochMilli();
        }

        JSONObject toJson() throws JSONException {
            return new JSONObject().put("key", key).put("title", title).put("body", body)
                    .put("doseId", doseId).put("daily", daily).put("hour", hour)
                    .put("minute", minute).put("atMillis", atMillis);
        }

        static Reminder fromJson(JSONObject o) {
            Reminder r = new Reminder();
            r.key = o.optString("key");
            r.title = o.optString("title");
            r.body = o.optString("body");
            r.doseId = o.optInt("doseId", -1);
            r.daily = o.optBoolean("daily");
            r.hour = o.optInt("hour");
            r.minute = o.optInt("minute");
            r.atMillis = o.optLong("atMillis");
            return r;
        }
    }

    /** Sets the alarm with the phone. Exact time when allowed, so 8:45 means 8:45. */
    static void arm(Context context, Reminder r) {
        AlarmManager am = context.getSystemService(AlarmManager.class);
        PendingIntent fire = alarmIntent(context, r.key);
        long when = r.nextFireMillis();

        boolean exactAllowed = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms();
        if (exactAllowed) {
            PendingIntent show = PendingIntent.getActivity(context, 0,
                    new Intent(context, MainActivity.class), PendingIntent.FLAG_IMMUTABLE);
            am.setAlarmClock(new AlarmManager.AlarmClockInfo(when, show), fire);
        } else {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, when, fire);
        }
    }

    private static PendingIntent alarmIntent(Context context, String key) {
        Intent i = new Intent(context, ReminderReceiver.class)
                .setAction(ReminderReceiver.ACTION_FIRE)
                .putExtra(EXTRA_KEY, key);
        return PendingIntent.getBroadcast(context, key.hashCode(), i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static Reminder find(Context context, String key) {
        for (Reminder r : loadAll(context)) if (r.key.equals(key)) return r;
        return null;
    }

    static void remove(Context context, String key) {
        List<Reminder> all = loadAll(context);
        all.removeIf(r -> r.key.equals(key));
        writeAll(context, all);
    }

    private static void save(Context context, Reminder r) {
        List<Reminder> all = loadAll(context);
        all.removeIf(x -> x.key.equals(r.key));
        all.add(r);
        writeAll(context, all);
    }

    private static List<Reminder> loadAll(Context context) {
        List<Reminder> list = new ArrayList<>();
        try {
            JSONArray arr = new JSONArray(prefs(context).getString(PREF_LIST, "[]"));
            for (int i = 0; i < arr.length(); i++) list.add(Reminder.fromJson(arr.getJSONObject(i)));
        } catch (JSONException ignored) {
        }
        return list;
    }

    private static void writeAll(Context context, List<Reminder> all) {
        JSONArray arr = new JSONArray();
        try {
            for (Reminder r : all) arr.put(r.toJson());
        } catch (JSONException ignored) {
        }
        prefs(context).edit().putString(PREF_LIST, arr.toString()).apply();
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
