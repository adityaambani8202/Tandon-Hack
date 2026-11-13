package com.homestretch.app.data;

import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Holds all the app's data in one place. Every screen reads from here.
 *
 * Right now it's filled with sample data and kept in memory, so it resets
 * when the app closes. A good next step is saving it with Room (a database).
 */
public class RecoveryRepository {

    private static RecoveryRepository instance;

    /** Use RecoveryRepository.get() from any screen to reach the data. */
    public static RecoveryRepository get() {
        if (instance == null) instance = new RecoveryRepository();
        return instance;
    }

    // ---------- Patient ----------
    public final String patientName = "Margaret";
    public final int recoveryDay = 4;
    public final String caregiverName = "Sarah";
    public final String careTeamPhone = "5551234567";

    // ---------- Data lists ----------
    public final List<Dose> doses = new ArrayList<>();
    public final List<Appointment> appointments = new ArrayList<>();
    public final List<String[]> careRules = new ArrayList<>();   // {rule, detail}
    public final List<FoundItem> found = new ArrayList<>();

    /** Check-in questions: {key, question, warning sign it matches}. */
    public final String[][] questions = {
            {"fever", "Do you have a fever (over 101°F)?", "Fever over 101°F"},
            {"swelling", "Any new swelling or redness?", "New swelling or redness"},
            {"bleeding", "Any bleeding from your incision?", "Bleeding from the incision"},
    };

    // ---------- Check-in answers ----------
    public int pain = 2;
    public final Map<String, Boolean> answers = new HashMap<>();
    public boolean checkInSubmitted = false;

    private RecoveryRepository() {
        loadSampleData();
    }

    // ===== Medicines =====

    public int takenCount() {
        int count = 0;
        for (Dose d : doses) if (d.status == Dose.Status.TAKEN) count++;
        return count;
    }

    /** The first dose today that hasn't been taken or skipped yet. */
    public Dose nextDose() {
        for (Dose.TimeOfDay t : Dose.TimeOfDay.values()) {
            for (Dose d : dosesFor(t)) {
                if (d.status == Dose.Status.PENDING) return d;
            }
        }
        return null;
    }

    public List<Dose> dosesFor(Dose.TimeOfDay timeOfDay) {
        List<Dose> list = new ArrayList<>();
        for (Dose d : doses) if (d.timeOfDay == timeOfDay) list.add(d);
        list.sort((a, b) -> {
            LocalTime ta = TimeParser.parse(a.time), tb = TimeParser.parse(b.time);
            if (ta == null || tb == null) return 0;
            return ta.compareTo(tb);
        });
        return list;
    }

    /**
     * Adds a medicine someone typed or said. "8:45 PM", "8:45" or "20:45" all work.
     * With no time, uses the usual time for Morning / Midday / Evening.
     * Returns the new dose so a reminder can be set for it.
     */
    public Dose addDose(String name, String strength, String time, Dose.TimeOfDay timeOfDay) {
        int nextId = 1;
        for (Dose d : doses) nextId = Math.max(nextId, d.id + 1);

        LocalTime clock = TimeParser.parse(time);
        if (clock == null) {
            clock = timeOfDay == Dose.TimeOfDay.MORNING ? LocalTime.of(8, 0)
                    : timeOfDay == Dose.TimeOfDay.AFTERNOON ? LocalTime.of(13, 0) : LocalTime.of(20, 0);
        } else {
            timeOfDay = TimeParser.timeOfDay(clock);   // 8:45 PM always goes under Evening
        }
        Dose dose = new Dose(nextId, name, strength, "Take as directed", TimeParser.format(clock),
                timeOfDay, "Added by you", null, Dose.Status.PENDING);
        doses.add(dose);
        return dose;
    }

    /** Puts the sample papers back (the "Try with sample papers" button). */
    public void resetToSample() {
        doses.clear();
        appointments.clear();
        careRules.clear();
        found.clear();
        loadSampleData();
    }

    // ===== Scanned papers =====

    public int confirmedCount() {
        int count = 0;
        for (FoundItem f : found) if (f.confirmed) count++;
        return count;
    }

    public void setAllConfirmed(boolean value) {
        for (FoundItem f : found) f.confirmed = value;
    }

    // ===== Check-in =====

    /**
     * Returns the warning signs from the discharge papers that match the answers.
     * The app never makes its own medical judgement, it only matches what the papers say.
     */
    public List<String> redFlags() {
        List<String> flags = new ArrayList<>();
        for (String[] q : questions) {
            if (Boolean.TRUE.equals(answers.get(q[0]))) flags.add(q[2]);
        }
        if (pain >= 8) flags.add("Severe pain (8 or higher)");
        return flags;
    }

    public boolean allQuestionsAnswered() {
        for (String[] q : questions) if (!answers.containsKey(q[0])) return false;
        return true;
    }

    // ===== Sample data =====

    private void loadSampleData() {
        doses.add(new Dose(1, "Lisinopril", "10 mg", "Take 1 tablet", "8:00 AM",
                Dose.TimeOfDay.MORNING, "For blood pressure", null, Dose.Status.TAKEN));
        doses.add(new Dose(2, "Metoprolol", "25 mg", "Take 1 tablet", "8:00 AM",
                Dose.TimeOfDay.MORNING, "Keeps your heart rate steady", "With breakfast", Dose.Status.TAKEN));
        doses.add(new Dose(3, "Cephalexin", "500 mg", "Take 1 capsule", "1:00 PM",
                Dose.TimeOfDay.AFTERNOON, "Antibiotic, day 3 of 7", "With food", Dose.Status.PENDING));
        doses.add(new Dose(4, "Metoprolol", "25 mg", "Take 1 tablet", "8:00 PM",
                Dose.TimeOfDay.EVENING, "Keeps your heart rate steady", "With dinner", Dose.Status.PENDING));
        doses.add(new Dose(5, "Atorvastatin", "20 mg", "Take 1 tablet", "9:00 PM",
                Dose.TimeOfDay.EVENING, "For cholesterol", null, Dose.Status.PENDING));

        appointments.add(new Appointment("Follow-up visit", "Dr. Patel · Cardiology",
                LocalDateTime.of(2026, 11, 18, 10, 30),
                "Riverside Heart Clinic, 220 Oak St", "Before you go: bring your medicine list."));
        appointments.add(new Appointment("Physical therapy", "Wellness Rehab Center",
                LocalDateTime.of(2026, 11, 20, 14, 0),
                "85 Pine Ave", "Before you go: wear comfortable shoes."));
        appointments.add(new Appointment("Blood work", "Main Hospital Lab",
                LocalDateTime.of(2026, 11, 24, 8, 0),
                "Main Hospital, Floor 1", "Before you go: don't eat after midnight."));

        careRules.add(new String[]{"No lifting over 10 lbs", "Until December 20"});
        careRules.add(new String[]{"Low-salt meals", "Under 2,000 mg of sodium a day"});
        careRules.add(new String[]{"Short walks", "10 minutes, 3 times a day"});

        found.add(new FoundItem(FoundItem.Category.MEDICINES, "Lisinopril 10 mg, 1 tablet every morning", "Page 1"));
        found.add(new FoundItem(FoundItem.Category.MEDICINES, "Metoprolol 25 mg, 1 tablet twice a day with food", "Page 1"));
        found.add(new FoundItem(FoundItem.Category.MEDICINES, "Cephalexin 500 mg, 1 capsule twice a day for 7 days", "Page 1"));
        found.add(new FoundItem(FoundItem.Category.MEDICINES, "Atorvastatin 20 mg, 1 tablet at bedtime", "Page 1"));
        found.add(new FoundItem(FoundItem.Category.VISITS, "Follow-up with Dr. Patel, Nov 18 at 10:30 AM", "Page 2"));
        found.add(new FoundItem(FoundItem.Category.VISITS, "Physical therapy, Nov 20 at 2:00 PM", "Page 2"));
        found.add(new FoundItem(FoundItem.Category.VISITS, "Blood work, Nov 24 at 8:00 AM (no food after midnight)", "Page 2"));
        found.add(new FoundItem(FoundItem.Category.DIET, "Low-sodium diet, under 2,000 mg a day", "Page 3"));
        found.add(new FoundItem(FoundItem.Category.ACTIVITY, "No lifting over 10 lbs for 6 weeks", "Page 3"));
        found.add(new FoundItem(FoundItem.Category.WARNING_SIGNS, "Fever over 101°F", "Page 4"));
        found.add(new FoundItem(FoundItem.Category.WARNING_SIGNS, "Bleeding, redness or swelling at the incision", "Page 4"));
    }
}
