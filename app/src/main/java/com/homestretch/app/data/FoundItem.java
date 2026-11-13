package com.homestretch.app.data;

/** One thing the scanner found in the paperwork, waiting to be double-checked. */
public class FoundItem {

    public enum Category {
        MEDICINES("Medicines"),
        VISITS("Appointments"),
        DIET("Diet"),
        ACTIVITY("Activity limits"),
        WARNING_SIGNS("Warning signs");

        public final String label;
        Category(String label) { this.label = label; }
    }

    public final Category category;
    public final String text;
    public final String source;   // e.g. "Page 2" so people can find it in their papers
    public boolean confirmed;

    public FoundItem(Category category, String text, String source) {
        this.category = category;
        this.text = text;
        this.source = source;
    }
}
