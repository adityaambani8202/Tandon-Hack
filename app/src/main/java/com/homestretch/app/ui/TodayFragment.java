package com.homestretch.app.ui;

import android.content.Intent;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;

import com.google.android.material.card.MaterialCardView;
import com.google.android.material.progressindicator.LinearProgressIndicator;
import com.homestretch.app.MainActivity;
import com.homestretch.app.R;
import com.homestretch.app.data.Appointment;
import com.homestretch.app.data.Dose;
import com.homestretch.app.data.RecoveryRepository;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

/** The home screen: greeting, progress, what's next, and today's reminders. */
public class TodayFragment extends Fragment {

    private final RecoveryRepository repo = RecoveryRepository.get();
    private Speaker speaker;
    private View root;

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container,
                             @Nullable Bundle savedInstanceState) {
        root = inflater.inflate(R.layout.fragment_today, container, false);
        speaker = new Speaker(requireContext());

        // Greeting
        int hour = LocalTime.now().getHour();
        String hello = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
        String date = LocalDate.now().format(DateTimeFormatter.ofPattern("EEEE, MMMM d", Locale.getDefault()));
        ((TextView) root.findViewById(R.id.text_date)).setText(date.toUpperCase());
        ((TextView) root.findViewById(R.id.text_greeting)).setText(hello + ", " + repo.patientName);
        ((TextView) root.findViewById(R.id.text_day)).setText("Day " + repo.recoveryDay + " of recovery");

        // Tappable cards
        MainActivity main = (MainActivity) requireActivity();
        root.findViewById(R.id.card_checkin).setOnClickListener(v -> main.goToTab(R.id.tab_checkin));
        root.findViewById(R.id.card_next_visit).setOnClickListener(v -> main.goToTab(R.id.tab_visits));
        root.findViewById(R.id.card_scan).setOnClickListener(v ->
                startActivity(new Intent(requireContext(), ScanActivity.class)));

        showNextVisit();
        showCareRules(inflater);
        return root;
    }

    @Override
    public void onResume() {
        super.onResume();
        refresh();   // update when coming back from another screen
    }

    @Override
    public void onDestroyView() {
        super.onDestroyView();
        speaker.shutdown();
    }

    /** Redraws the parts that change when a dose is marked. */
    private void refresh() {
        int done = repo.takenCount();
        int total = repo.doses.size();

        ((TextView) root.findViewById(R.id.text_progress_count)).setText(done + " of " + total);
        LinearProgressIndicator bar = root.findViewById(R.id.progress_bar);
        bar.setMax(total);
        bar.setProgress(done);

        String message;
        if (done == total) message = "You've done everything today! Amazing.";
        else if (done == 0) message = "Let's get started.";
        else message = "You're on a roll. Keep it up!";
        ((TextView) root.findViewById(R.id.text_progress_message)).setText(message);

        // "Up next" card
        FrameLayout upNext = root.findViewById(R.id.up_next_container);
        upNext.removeAllViews();
        Dose next = repo.nextDose();
        if (next != null) {
            upNext.addView(DoseCard.create(getLayoutInflater(), upNext, next, speaker, this::refresh));
        } else {
            upNext.addView(allDoneCard());
        }

        // Hide the check-in prompt once it's done today
        root.findViewById(R.id.card_checkin)
                .setVisibility(repo.checkInSubmitted ? View.GONE : View.VISIBLE);
    }

    private View allDoneCard() {
        MaterialCardView card = new MaterialCardView(requireContext(), null, 0);
        card.setRadius(dp(24));
        card.setCardElevation(0);
        card.setStrokeWidth(0);
        card.setCardBackgroundColor(requireContext().getColor(R.color.leaf_soft));
        card.setContentPadding(dp(20), dp(20), dp(20), dp(20));

        TextView text = new TextView(requireContext());
        text.setTextAppearance(R.style.HS_Text_Title);
        text.setText("All medicines done for today 🎉\nGreat job sticking to your plan.");
        card.addView(text);
        return card;
    }

    private void showNextVisit() {
        if (repo.appointments.isEmpty()) return;
        Appointment a = repo.appointments.get(0);
        View badge = root.findViewById(R.id.next_visit_date);
        ((TextView) badge.findViewById(R.id.text_month)).setText(a.monthShort());
        ((TextView) badge.findViewById(R.id.text_day_num)).setText(a.dayNumber());
        ((TextView) root.findViewById(R.id.text_next_visit_title)).setText(a.title);
        ((TextView) root.findViewById(R.id.text_next_visit_time)).setText(a.whenText());
    }

    private void showCareRules(LayoutInflater inflater) {
        LinearLayout list = root.findViewById(R.id.rules_container);
        int[] icons = {R.drawable.ic_warning, R.drawable.ic_info, R.drawable.ic_heart};
        for (int i = 0; i < repo.careRules.size(); i++) {
            String[] rule = repo.careRules.get(i);
            View row = inflater.inflate(R.layout.item_rule, list, false);
            ((ImageView) row.findViewById(R.id.icon)).setImageResource(icons[i % icons.length]);
            ((TextView) row.findViewById(R.id.text_rule)).setText(rule[0]);
            ((TextView) row.findViewById(R.id.text_detail)).setText(rule[1]);
            list.addView(row);
        }
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
