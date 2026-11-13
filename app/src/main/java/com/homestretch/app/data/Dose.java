package com.homestretch.app.data;

/** One medicine dose, like "Lisinopril 10 mg at 8:00 AM". */
public class Dose {

    public enum Status { PENDING, TAKEN, SKIPPED }

    public enum TimeOfDay {
        MORNING("Morning"), AFTERNOON("Midday"), EVENING("Evening");

        public final String label;
        TimeOfDay(String label) { this.label = label; }
    }

    public final int id;
    public final String name;
    public final String strength;
    public final String instruction;
    public final String time;
    public final TimeOfDay timeOfDay;
    public final String purpose;
    public final String note;      // e.g. "With food" (can be null)
    public Status status;

    public Dose(int id, String name, String strength, String instruction, String time,
                TimeOfDay timeOfDay, String purpose, String note, Status status) {
        this.id = id;
        this.name = name;
        this.strength = strength;
        this.instruction = instruction;
        this.time = time;
        this.timeOfDay = timeOfDay;
        this.purpose = purpose;
        this.note = note;
        this.status = status;
    }

    /** Title shown on the card, e.g. "Lisinopril 10 mg". */
    public String title() {
        return strength.isEmpty() ? name : name + " " + strength;
    }

    /** The "when" line, e.g. "8:00 AM · With breakfast". */
    public String whenText() {
        return note == null ? time : time + "  ·  " + note;
    }

    /** What the speaker button reads out loud. */
    public String spokenText() {
        String s = instruction + ". " + name + ", " + strength + ". " + purpose + ".";
        if (note != null) s += " " + note + ".";
        return s;
    }
}
