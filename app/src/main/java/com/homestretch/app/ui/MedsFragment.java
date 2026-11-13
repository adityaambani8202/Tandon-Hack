package com.homestretch.app.ui;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.speech.RecognizerIntent;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.widget.TextViewCompat;
import androidx.fragment.app.Fragment;

import com.google.android.material.button.MaterialButtonToggleGroup;
import com.google.android.material.dialog.MaterialAlertDialogBuilder;
import com.homestretch.app.R;
import com.homestretch.app.alerts.ReminderScheduler;
import com.homestretch.app.data.Dose;
import com.homestretch.app.data.RecoveryRepository;
import com.homestretch.app.data.TimeParser;

import java.util.List;
import java.util.Locale;

/** All of today's medicines, grouped into Morning / Midday / Evening. */
public class MedsFragment extends Fragment {

    private final RecoveryRepository repo = RecoveryRepository.get();
    private Speaker speaker;
    private LinearLayout container;

    // Listens for "Tylenol at 8:45 PM" using the phone's built-in speech recognition
    private final ActivityResultLauncher<Intent> listen =
            registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), result -> {
                if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) return;
                List<String> heard = result.getData().getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
                if (heard == null || heard.isEmpty()) return;
                onHeard(heard.get(0));
            });

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup parent,
                             @Nullable Bundle savedInstanceState) {
        View root = inflater.inflate(R.layout.fragment_meds, parent, false);
        speaker = new Speaker(requireContext());
        container = root.findViewById(R.id.meds_container);
        root.findViewById(R.id.button_add_med).setOnClickListener(v -> showAddDialog("", "", ""));
        root.findViewById(R.id.button_say_med).setOnClickListener(v -> startListening());
        root.findViewById(R.id.button_test_alert).setOnClickListener(v -> sendTestReminder());
        refresh();
        return root;
    }

    @Override
    public void onDestroyView() {
        super.onDestroyView();
        speaker.shutdown();
    }

    private void refresh() {
        container.removeAllViews();
        LayoutInflater inflater = getLayoutInflater();

        for (Dose.TimeOfDay time : Dose.TimeOfDay.values()) {
            List<Dose> list = repo.dosesFor(time);
            if (list.isEmpty()) continue;

            // Section heading with a sun or moon icon
            TextView heading = (TextView) inflater.inflate(R.layout.item_section, container, false);
            heading.setText(time.label);
            int icon = time == Dose.TimeOfDay.EVENING ? R.drawable.ic_moon : R.drawable.ic_sun;
            TextViewCompat.setCompoundDrawablesRelativeWithIntrinsicBounds(heading, icon, 0, 0, 0);
            container.addView(heading);

            for (Dose d : list) {
                container.addView(DoseCard.create(inflater, container, d, speaker, this::refresh));
            }
        }
    }

    // ===== Adding a medicine =====

    /** Adds the dose, sets the phone alarm, and tells the person. */
    private void addAndRemind(String name, String strength, String time, Dose.TimeOfDay fallback) {
        Dose dose = repo.addDose(name, strength, time, fallback);
        boolean set = ReminderScheduler.scheduleDose(requireContext(), dose);
        refresh();
        String msg = set
                ? "Reminder set: " + dose.title() + " every day at " + dose.time
                : "Added " + dose.title();
        Toast.makeText(requireContext(), msg, Toast.LENGTH_LONG).show();
        if (set) speaker.say("Okay. I'll remind you to take " + dose.name + " at " + dose.time + ".");
    }

    private void startListening() {
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault().toLanguageTag())
                .putExtra(RecognizerIntent.EXTRA_PROMPT, "Say a medicine and a time, like \"Tylenol at 8:45 PM\"");
        try {
            listen.launch(intent);
        } catch (Exception e) {
            Toast.makeText(requireContext(), "Voice typing isn't available on this phone, so type it instead.",
                    Toast.LENGTH_LONG).show();
            showAddDialog("", "", "");
        }
    }

    /** "Take Tylenol 500 mg at 8:45 PM" → reminder. If something is missing, ask with the form. */
    private void onHeard(String said) {
        TimeParser.Spoken s = TimeParser.parseSpoken(said);
        if (!s.name.isEmpty() && s.time != null) {
            addAndRemind(s.name, s.strength, TimeParser.format(s.time), TimeParser.timeOfDay(s.time));
        } else {
            Toast.makeText(requireContext(), "I heard \"" + said + "\". Please fill in the rest.",
                    Toast.LENGTH_LONG).show();
            showAddDialog(s.name, s.strength, s.time == null ? "" : TimeParser.format(s.time));
        }
    }

    /** A simple pop-up for adding a medicine the patient already takes. */
    private void showAddDialog(String presetName, String presetStrength, String presetTime) {
        View form = getLayoutInflater().inflate(R.layout.dialog_add_med, null);
        EditText name = form.findViewById(R.id.input_name);
        EditText strength = form.findViewById(R.id.input_strength);
        EditText time = form.findViewById(R.id.input_time);
        MaterialButtonToggleGroup toggle = form.findViewById(R.id.toggle_time_of_day);
        name.setText(presetName);
        strength.setText(presetStrength);
        time.setText(presetTime);

        new MaterialAlertDialogBuilder(requireContext())
                .setTitle("Add a medicine")
                .setView(form)
                .setNegativeButton("Cancel", null)
                .setPositiveButton("Add", (dialog, which) -> {
                    String n = name.getText().toString().trim();
                    String t = time.getText().toString().trim();
                    if (n.isEmpty()) {
                        Toast.makeText(requireContext(), "Please type the medicine name", Toast.LENGTH_SHORT).show();
                        return;
                    }
                    if (!t.isEmpty() && TimeParser.parse(t) == null) {
                        Toast.makeText(requireContext(), "I didn't understand \"" + t
                                + "\". Try a time like 8:45 PM.", Toast.LENGTH_LONG).show();
                        showAddDialog(n, strength.getText().toString().trim(), "");
                        return;
                    }
                    Dose.TimeOfDay when;
                    int checked = toggle.getCheckedButtonId();
                    if (checked == R.id.option_afternoon) when = Dose.TimeOfDay.AFTERNOON;
                    else if (checked == R.id.option_evening) when = Dose.TimeOfDay.EVENING;
                    else when = Dose.TimeOfDay.MORNING;

                    addAndRemind(n, strength.getText().toString().trim(), t, when);
                })
                .show();
    }

    /** For demos: a reminder in 10 seconds, so you can see it on the lock screen. */
    private void sendTestReminder() {
        ReminderScheduler.scheduleIn(requireContext(), "test-" + System.currentTimeMillis(),
                "Time for your test medicine", "This is how your Medly reminders will look.",
                -1, 10_000);
        Toast.makeText(requireContext(), "Test reminder in 10 seconds. You can lock your phone.",
                Toast.LENGTH_LONG).show();
    }
}
