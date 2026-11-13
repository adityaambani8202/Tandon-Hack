package com.homestretch.app.ui;

import android.content.res.ColorStateList;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import androidx.core.content.ContextCompat;
import androidx.core.widget.TextViewCompat;

import com.homestretch.app.R;
import com.homestretch.app.data.Dose;

/**
 * Builds one medicine card (layout/item_dose.xml).
 * Used on both the Today tab and the Medicines tab.
 */
public class DoseCard {

    /**
     * @param onChanged runs after Taken / Skip / Undo so the screen can refresh
     */
    public static View create(LayoutInflater inflater, ViewGroup parent, Dose dose,
                              Speaker speaker, Runnable onChanged) {
        View card = inflater.inflate(R.layout.item_dose, parent, false);

        ((TextView) card.findViewById(R.id.text_name)).setText(dose.title());
        ((TextView) card.findViewById(R.id.text_purpose)).setText(dose.purpose);
        ((TextView) card.findViewById(R.id.text_instruction)).setText(dose.instruction);
        ((TextView) card.findViewById(R.id.text_when)).setText(dose.whenText());

        card.findViewById(R.id.button_speak).setOnClickListener(v -> speaker.say(dose.spokenText()));

        View actions = card.findViewById(R.id.row_actions);
        View doneRow = card.findViewById(R.id.row_done);
        TextView doneText = card.findViewById(R.id.text_done);

        if (dose.status == Dose.Status.PENDING) {
            actions.setVisibility(View.VISIBLE);
            doneRow.setVisibility(View.GONE);
        } else {
            actions.setVisibility(View.GONE);
            doneRow.setVisibility(View.VISIBLE);

            boolean taken = dose.status == Dose.Status.TAKEN;
            int textColor = ContextCompat.getColor(card.getContext(), taken ? R.color.leaf : R.color.ink_soft);
            int boxColor = ContextCompat.getColor(card.getContext(), taken ? R.color.leaf_soft : R.color.sand);

            doneText.setText(taken ? "Taken. Nice work!" : "Skipped");
            doneText.setTextColor(textColor);
            TextViewCompat.setCompoundDrawableTintList(doneText, ColorStateList.valueOf(textColor));
            doneRow.setBackgroundTintList(ColorStateList.valueOf(boxColor));
        }

        card.findViewById(R.id.button_taken).setOnClickListener(v -> {
            dose.status = Dose.Status.TAKEN;
            onChanged.run();
        });
        card.findViewById(R.id.button_skip).setOnClickListener(v -> {
            dose.status = Dose.Status.SKIPPED;
            onChanged.run();
        });
        card.findViewById(R.id.button_undo).setOnClickListener(v -> {
            dose.status = Dose.Status.PENDING;
            onChanged.run();
        });

        return card;
    }
}
