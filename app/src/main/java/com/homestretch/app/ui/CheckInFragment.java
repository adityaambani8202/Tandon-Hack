package com.homestretch.app.ui;

import android.content.Intent;
import android.content.res.ColorStateList;
import android.net.Uri;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;

import com.google.android.material.button.MaterialButtonToggleGroup;
import com.google.android.material.card.MaterialCardView;
import com.google.android.material.slider.Slider;
import com.homestretch.app.R;
import com.homestretch.app.data.RecoveryRepository;

import java.util.List;

/**
 * Daily check-in: pain level + a few yes/no questions.
 * If an answer matches a warning sign from the discharge papers,
 * it tells the patient to call their care team.
 */
public class CheckInFragment extends Fragment {

    private final RecoveryRepository repo = RecoveryRepository.get();
    private View root;

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup parent,
                             @Nullable Bundle savedInstanceState) {
        root = inflater.inflate(R.layout.fragment_checkin, parent, false);

        // Pain slider
        Slider slider = root.findViewById(R.id.slider_pain);
        slider.setValue(repo.pain);
        updatePainText();
        slider.addOnChangeListener((s, value, fromUser) -> {
            repo.pain = (int) value;
            updatePainText();
        });

        // Yes / No questions
        LinearLayout questions = root.findViewById(R.id.questions_container);
        for (String[] q : repo.questions) {
            String key = q[0];
            View card = inflater.inflate(R.layout.item_question, questions, false);
            ((TextView) card.findViewById(R.id.text_question)).setText(q[1]);

            MaterialButtonToggleGroup toggle = card.findViewById(R.id.toggle_answer);
            Boolean saved = repo.answers.get(key);
            if (saved != null) toggle.check(saved ? R.id.button_yes : R.id.button_no);

            toggle.addOnButtonCheckedListener((group, buttonId, isChecked) -> {
                if (isChecked) repo.answers.put(key, buttonId == R.id.button_yes);
                else if (group.getCheckedButtonId() == View.NO_ID) repo.answers.remove(key);
                updateSubmitButton();
            });
            questions.addView(card);
        }

        root.findViewById(R.id.button_submit).setOnClickListener(v -> {
            repo.checkInSubmitted = true;
            showCorrectGroup();
        });
        root.findViewById(R.id.button_change).setOnClickListener(v -> {
            repo.checkInSubmitted = false;
            showCorrectGroup();
        });
        root.findViewById(R.id.button_call).setOnClickListener(v ->
                startActivity(new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + repo.careTeamPhone))));

        updateSubmitButton();
        showCorrectGroup();
        return root;
    }

    private void updatePainText() {
        int p = repo.pain;
        String label = p == 0 ? "No pain" : p <= 3 ? "Mild" : p <= 6 ? "Moderate" : "Severe";
        int color = requireContext().getColor(p >= 7 ? R.color.coral : R.color.teal);
        TextView number = root.findViewById(R.id.text_pain_number);
        number.setText(String.valueOf(p));
        number.setTextColor(color);
        ((TextView) root.findViewById(R.id.text_pain_label)).setText(label);
    }

    private void updateSubmitButton() {
        root.findViewById(R.id.button_submit).setEnabled(repo.allQuestionsAnswered());
    }

    /** Shows either the questions or the result. */
    private void showCorrectGroup() {
        boolean submitted = repo.checkInSubmitted;
        root.findViewById(R.id.group_form).setVisibility(submitted ? View.GONE : View.VISIBLE);
        root.findViewById(R.id.group_result).setVisibility(submitted ? View.VISIBLE : View.GONE);
        if (submitted) showResult();
    }

    private void showResult() {
        List<String> flags = repo.redFlags();
        MaterialCardView card = root.findViewById(R.id.card_result);
        ImageView icon = root.findViewById(R.id.icon_result);
        TextView title = root.findViewById(R.id.text_result_title);
        TextView body = root.findViewById(R.id.text_result_body);
        TextView footer = root.findViewById(R.id.text_result_footer);
        View callButton = root.findViewById(R.id.button_call);

        if (!flags.isEmpty()) {
            card.setCardBackgroundColor(requireContext().getColor(R.color.coral_soft));
            icon.setImageResource(R.drawable.ic_warning);
            icon.setImageTintList(ColorStateList.valueOf(requireContext().getColor(R.color.coral)));
            title.setText("Please call your care team");

            StringBuilder text = new StringBuilder("Your discharge papers say to call if you have:\n");
            for (String f : flags) text.append("\n•  ").append(f);
            body.setText(text.toString());

            callButton.setVisibility(View.VISIBLE);
            footer.setText("We've also let " + repo.caregiverName + " know.");
        } else {
            card.setCardBackgroundColor(requireContext().getColor(R.color.leaf_soft));
            icon.setImageResource(R.drawable.ic_check);
            icon.setImageTintList(ColorStateList.valueOf(requireContext().getColor(R.color.leaf)));
            title.setText("You're doing great!");
            body.setText("Nothing in your answers matches the warning signs in your papers. Keep resting and we'll check in again tomorrow.");
            callButton.setVisibility(View.GONE);
            footer.setText("Your answers were saved for your care team.");
        }
    }
}
