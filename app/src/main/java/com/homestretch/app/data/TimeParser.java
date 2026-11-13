package com.homestretch.app.data;

import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Turns what people type or say into a clock time.
 * Understands "8:45", "8:45 PM", "8:45pm", "8:45 p.m.", "20:45", "8 pm", "845 pm", "noon".
 * Plain Java (no Android), so it can be tested on its own.
 */
public final class TimeParser {

    private TimeParser() {}

    // hour, optional :minutes (or 3-4 digit "845"), optional am/pm
    private static final Pattern TIME = Pattern.compile(
            "\\b(\\d{1,2})(?::|\\.|\\s)?(\\d{2})?\\s*(a\\.?\\s?m\\.?|p\\.?\\s?m\\.?|o'?clock)?(?![\\w:])",
            Pattern.CASE_INSENSITIVE);

    private static final Pattern AT_TIME = Pattern.compile(
            "\\s*(?:\\bat\\b|@)\\s*(.+)$", Pattern.CASE_INSENSITIVE);

    /** Returns the time, or null if there isn't one. */
    public static LocalTime parse(String text) {
        if (text == null) return null;
        String s = text.trim().toLowerCase(Locale.US);
        if (s.isEmpty()) return null;
        if (s.contains("noon")) return LocalTime.NOON;
        if (s.contains("midnight")) return LocalTime.MIDNIGHT;

        Matcher m = TIME.matcher(s);
        while (m.find()) {
            String minText = m.group(2);
            String suffix = m.group(3);
            // A bare number with no minutes and no am/pm ("take 2 pills") is not a time.
            if (minText == null && suffix == null) continue;
            int minute = minText == null ? 0 : Integer.parseInt(minText);
            Integer hour = applySuffix(Integer.parseInt(m.group(1)), suffix);
            if (hour == null || minute > 59) continue;
            return LocalTime.of(hour, minute);
        }
        return null;
    }

    private static Integer applySuffix(int hour, String suffix) {
        if (suffix != null && suffix.startsWith("p")) {
            if (hour < 1 || hour > 12) return null;
            return hour == 12 ? 12 : hour + 12;
        }
        if (suffix != null && suffix.startsWith("a")) {
            if (hour < 1 || hour > 12) return null;
            return hour == 12 ? 0 : hour;
        }
        return hour <= 23 ? hour : null;
    }

    /** "08:45" or "20:45" from the AI. */
    public static LocalTime parse24(String hhmm) {
        try {
            return LocalTime.parse(hhmm.trim().length() == 4 ? "0" + hhmm.trim() : hhmm.trim());
        } catch (Exception e) {
            return parse(hhmm);
        }
    }

    /** 8:45 PM */
    public static String format(LocalTime t) {
        return t.format(DateTimeFormatter.ofPattern("h:mm a", Locale.US));
    }

    /** Morning before noon, Midday until 5 PM, Evening after. */
    public static Dose.TimeOfDay timeOfDay(LocalTime t) {
        if (t.getHour() < 12) return Dose.TimeOfDay.MORNING;
        if (t.getHour() < 17) return Dose.TimeOfDay.AFTERNOON;
        return Dose.TimeOfDay.EVENING;
    }

    /** What someone said, split into medicine name and time. */
    public static final class Spoken {
        public final String name;      // may be empty
        public final String strength;  // may be empty
        public final LocalTime time;   // may be null

        Spoken(String name, String strength, LocalTime time) {
            this.name = name;
            this.strength = strength;
            this.time = time;
        }
    }

    private static final Pattern STRENGTH = Pattern.compile(
            "\\b(\\d+(?:\\.\\d+)?\\s*(?:mg|milligrams?|mcg|ml|g|units?))\\b", Pattern.CASE_INSENSITIVE);

    /**
     * "Remind me to take Tylenol 500 mg at 8:45 PM" -> name "Tylenol", strength "500 mg", 20:45.
     */
    public static Spoken parseSpoken(String said) {
        if (said == null) return new Spoken("", "", null);
        String s = said.trim();

        // Pull out the strength first so "500 mg" isn't read as 5:00.
        String strength = "";
        Matcher st = STRENGTH.matcher(s);
        if (st.find()) {
            strength = st.group(1).replaceAll("(?i)milligrams?", "mg")
                    .replaceAll("(\\d)\\s*([a-zA-Z])", "$1 $2").trim();
            s = s.substring(0, st.start()) + " " + s.substring(st.end());
        }

        LocalTime time = null;
        Matcher at = AT_TIME.matcher(s);
        if (at.find()) {
            String after = at.group(1).trim();
            time = parse(after);
            if (time == null && after.matches("\\d{1,2}")) {           // "at 9"
                int h = Integer.parseInt(after);
                if (h <= 23) time = LocalTime.of(h, 0);
            }
            if (time != null) s = s.substring(0, at.start());
        }
        if (time == null) {
            time = parse(s);
            if (time != null) s = TIME.matcher(s).replaceAll(" ");
        }

        String name = s.replaceAll("(?i)\\b(hey|ok|okay|please|remind me|reminder|set a|set an|alarm|alert|"
                        + "to|take|taking|my|medicine|medication|meds|pill|pills|tablet|tablets|a|an|the|"
                        + "every|each|day|daily|night|morning|evening|tonight|today|in the)\\b", " ")
                .replaceAll("[^\\p{L}\\p{N}\\- ]", " ")
                .replaceAll("\\s+", " ")
                .trim();
        if (!name.isEmpty()) {
            StringBuilder b = new StringBuilder();
            for (String w : name.split(" ")) {
                if (b.length() > 0) b.append(' ');
                b.append(Character.toUpperCase(w.charAt(0))).append(w.substring(1));
            }
            name = b.toString();
        }
        return new Spoken(name, strength, time);
    }
}
