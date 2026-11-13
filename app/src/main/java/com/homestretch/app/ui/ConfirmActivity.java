package com.homestretch.app.ui;

import android.content.res.ColorStateList;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.widget.TextViewCompat;

import com.google.android.material.button.MaterialButton;
import com.google.android.material.card.MaterialCardView;
import com.homestretch.app.R;
import com.homestretch.app.alerts.ReminderScheduler;
import com.homestretch.app.data.FoundItem;
import com.homestretch.app.data.RecoveryRepository;

/**
 * The safety step: someone checks each item that was read from the papers
 * before any reminders start.
 */
public class ConfirmActivity extends AppCompatActivity {

    private final RecoveryRepository repo = RecoveryRepository.get();
    private LinearLayout container;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_confirm);

        container = findViewById(R.id.found_container);
        findViewById(R.id.button_back).setOnClickListener(v -> finish());
        findViewById(R.id.button_confirm_all).setOnClickListener(v -> {
            repo.setAllConfirmed(true);
            refresh();
        });
        findViewById(R.id.button_start).setOnClickListener(v -> {
            // Only now, after a person checked everything, do reminders start.
            int set = ReminderScheduler.scheduleAll(this, repo.doses, repo.appointments);
            Toast.makeText(this, "Your plan is ready! " + set + " reminders set on this phone.",
                    Toast.LENGTH_LONG).show();
            finish();   // back to the Today screen
        });
        refresh();
    }

    private void refresh() {
        container.removeAllViews();
        LayoutInflater inflater = getLayoutInflater();

        for (FoundItem.Category category : FoundItem.Category.values()) {
            boolean headingAdded = false;
            for (FoundItem item : repo.found) {
                if (item.category != category) continue;
                if (!headingAdded) {
                    container.addView(heading(inflater, category));
                    headingAdded = true;
                }
                container.addView(row(inflater, item));
            }
        }

        int done = repo.confirmedCount();
        int total = repo.found.size();
        boolean allDone = done == total;

        ((TextView) findViewById(R.id.text_counter)).setText(done + " of " + total + " checked");

        MaterialButton start = findViewById(R.id.button_start);
        start.setEnabled(allDone);
        start.setText(allDone ? "Looks good! Start my plan" : "Check " + (total - done) + " more to continue");
        findViewById(R.id.button_confirm_all).setVisibility(allDone ? View.GONE : View.VISIBLE);
    }

    private View heading(LayoutInflater inflater, FoundItem.Category category) {
        TextView heading = (TextView) inflater.inflate(R.layout.item_section, container, false);
        heading.setText(category.label);
        int icon;
        switch (category) {
            case MEDICINES: icon = R.drawable.ic_medicine; break;
            case VISITS: icon = R.drawable.ic_calendar; break;
            case WARNING_SIGNS: icon = R.drawable.ic_warning; break;
            default: icon = R.drawable.ic_info;
        }
        TextViewCompat.setCompoundDrawablesRelativeWithIntrinsicBounds(heading, icon, 0, 0, 0);
        return heading;
    }

    private View row(LayoutInflater inflater, FoundItem item) {
        MaterialCardView card = (MaterialCardView) inflater.inflate(R.layout.item_found, container, false);
        ((TextView) card.findViewById(R.id.text_item)).setText(item.text);
        ((TextView) card.findViewById(R.id.text_source)).setText("From " + item.source + " of your papers");

        ImageView check = card.findViewById(R.id.icon_check);
        int color = getColor(item.confirmed ? R.color.teal : R.color.line);
        check.setImageResource(item.confirmed ? R.drawable.ic_check_circle : R.drawable.ic_circle_empty);
        check.setImageTintList(ColorStateList.valueOf(color));
        card.setStrokeColor(color);
        card.setStrokeWidth(item.confirmed ? dp(2) : dp(1));

        card.setOnClickListener(v -> {
            item.confirmed = !item.confirmed;
            refresh();
        });
        return card;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
