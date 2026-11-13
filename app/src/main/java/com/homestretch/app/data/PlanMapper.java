package com.homestretch.app.data;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * Turns the AI's plan JSON (same shape as PROMPT in the Tandon Hack server.js)
 * into Medly's medicines, visits, care rules and the "double-check" list.
 */
public final class PlanMapper {

    private PlanMapper() {}

    public static void apply(JSONObject plan, RecoveryRepository repo) {
        List<Dose> doses = new ArrayList<>();
        List<Appointment> visits = new ArrayList<>();
        List<String[]> rules = new ArrayList<>();
        List<FoundItem> found = new ArrayList<>();

        // ----- Medicines: one Dose per time of day -----
        JSONArray meds = arr(plan, "medications");
        for (int i = 0; i < meds.length(); i++) {
            JSONObject m = meds.optJSONObject(i);
            if (m == null) continue;
            String name = str(m, "name");
            if (name.isEmpty()) continue;
            String strength = str(m, "dose");
            String instructions = str(m, "instructions");
            String plain = str(m, "plainLanguage");
            String withFood = str(m, "withFood");
            String note = "with".equalsIgnoreCase(withFood) ? "With food"
                    : "without".equalsIgnoreCase(withFood) ? "On an empty stomach" : null;
            int days = m.optInt("durationDays", 0);
            String purpose = plain.isEmpty() ? instructions : plain;
            if (days > 0 && !purpose.contains(days + " day")) purpose += " (for " + days + " days)";

            for (LocalTime t : times(m)) {
                doses.add(new Dose(doses.size() + 1, name, strength,
                        instructions.isEmpty() ? "Take as directed" : shortText(instructions),
                        TimeParser.format(t), TimeParser.timeOfDay(t), purpose, note, Dose.Status.PENDING));
            }
            found.add(new FoundItem(FoundItem.Category.MEDICINES,
                    join(name + (strength.isEmpty() ? "" : " " + strength), instructions), source(m)));
        }
        doses.sort(Comparator.comparing(d -> TimeParser.parse(d.time)));

        // ----- Visits -----
        JSONArray appts = arr(plan, "appointments");
        for (int i = 0; i < appts.length(); i++) {
            JSONObject a = appts.optJSONObject(i);
            if (a == null) continue;
            String title = str(a, "title");
            String date = str(a, "date");
            String time = str(a, "time");
            String place = str(a, "location");
            String prep = str(a, "prep");
            try {
                LocalTime t = time.isEmpty() ? LocalTime.of(9, 0) : TimeParser.parse24(time);
                if (t == null) t = LocalTime.of(9, 0);
                LocalDateTime start = LocalDateTime.of(LocalDate.parse(date), t);
                visits.add(new Appointment(title.isEmpty() ? "Appointment" : title, "From your papers", start,
                        place, prep.isEmpty() ? null : "Before you go: " + prep));
            } catch (Exception ignored) {
                // no usable date: still shown on the double-check screen
            }
            found.add(new FoundItem(FoundItem.Category.VISITS,
                    join(title, (date + " " + time).trim()), source(a)));
        }
        visits.sort(Comparator.comparing(a -> a.start));

        // ----- Diet, activity, exercises -----
        addRules(arr(plan, "diet"), FoundItem.Category.DIET, rules, found);
        addRules(arr(plan, "activity"), FoundItem.Category.ACTIVITY, rules, found);
        JSONArray ex = arr(plan, "exercises");
        for (int i = 0; i < ex.length(); i++) {
            JSONObject e = ex.optJSONObject(i);
            if (e == null || str(e, "name").isEmpty()) continue;
            rules.add(new String[]{str(e, "name"), str(e, "frequency")});
            found.add(new FoundItem(FoundItem.Category.ACTIVITY, join(str(e, "name"), str(e, "frequency")), source(e)));
        }

        // ----- Warning signs -----
        JSONArray flags = arr(plan, "redFlags");
        for (int i = 0; i < flags.length(); i++) {
            JSONObject f = flags.optJSONObject(i);
            if (f == null || str(f, "symptom").isEmpty()) continue;
            found.add(new FoundItem(FoundItem.Category.WARNING_SIGNS, str(f, "symptom"), source(f)));
        }

        repo.doses.clear();
        repo.doses.addAll(doses);
        repo.appointments.clear();
        repo.appointments.addAll(visits);
        repo.careRules.clear();
        repo.careRules.addAll(rules);
        repo.found.clear();
        repo.found.addAll(found);
    }

    /** "times":["08:00","20:00"], or a guess from timesPerDay. */
    static List<LocalTime> times(JSONObject m) {
        List<LocalTime> list = new ArrayList<>();
        JSONArray arr = m.optJSONArray("times");
        if (arr != null) {
            for (int i = 0; i < arr.length(); i++) {
                LocalTime t = TimeParser.parse24(arr.optString(i));
                if (t != null && !list.contains(t)) list.add(t);
            }
        }
        if (list.isEmpty()) {
            int perDay = Math.max(1, m.optInt("timesPerDay", 1));
            int[][] defaults = {{8}, {8, 20}, {8, 14, 20}, {8, 12, 16, 20}};
            for (int h : defaults[Math.min(perDay, 4) - 1]) list.add(LocalTime.of(h, 0));
        }
        return list;
    }

    private static void addRules(JSONArray items, FoundItem.Category cat, List<String[]> rules, List<FoundItem> found) {
        for (int i = 0; i < items.length(); i++) {
            JSONObject r = items.optJSONObject(i);
            if (r == null) continue;
            String rule = str(r, "rule");
            String plain = str(r, "plainLanguage");
            if (rule.isEmpty() && plain.isEmpty()) continue;
            rules.add(new String[]{plain.isEmpty() ? rule : plain, plain.isEmpty() ? "" : rule});
            found.add(new FoundItem(cat, rule.isEmpty() ? plain : rule, source(r)));
        }
    }

    private static String source(JSONObject o) {
        String s = str(o, "source");
        if (s.isEmpty()) return "a page";
        return Character.toUpperCase(s.charAt(0)) + s.substring(1);
    }

    private static String shortText(String s) {
        return s.length() > 80 ? s.substring(0, 77) + "…" : s;
    }

    private static String join(String a, String b) {
        if (b == null || b.isEmpty()) return a;
        if (a == null || a.isEmpty()) return b;
        return a + ", " + b;
    }

    private static JSONArray arr(JSONObject o, String key) {
        JSONArray a = o.optJSONArray(key);
        return a == null ? new JSONArray() : a;
    }

    private static String str(JSONObject o, String key) {
        if (o.isNull(key)) return "";
        return o.optString(key, "").trim();
    }
}
