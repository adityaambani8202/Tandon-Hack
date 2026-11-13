package com.homestretch.app.data;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

/** A follow-up visit, therapy session, lab test, etc. */
public class Appointment {
    public final String title;
    public final String withWho;
    public final LocalDateTime start;
    public final String place;
    public final String prep;   // "Before you go" note (can be null)

    public Appointment(String title, String withWho, LocalDateTime start, String place, String prep) {
        this.title = title;
        this.withWho = withWho;
        this.start = start;
        this.place = place;
        this.prep = prep;
    }

    public String monthShort() {
        return start.format(DateTimeFormatter.ofPattern("MMM", Locale.getDefault())).toUpperCase();
    }

    public String dayNumber() {
        return String.valueOf(start.getDayOfMonth());
    }

    /** e.g. "Tuesday, Nov 18 · 10:30 AM" */
    public String whenText() {
        return start.format(DateTimeFormatter.ofPattern("EEEE, MMM d  ·  h:mm a", Locale.getDefault()));
    }

    /** Start time in milliseconds, for adding to the phone's calendar. */
    public long startMillis() {
        return start.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();
    }
}
