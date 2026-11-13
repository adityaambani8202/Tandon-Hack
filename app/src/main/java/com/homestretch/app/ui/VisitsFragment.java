package com.homestretch.app.ui;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.provider.CalendarContract;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;

import com.homestretch.app.R;
import com.homestretch.app.data.Appointment;
import com.homestretch.app.data.RecoveryRepository;

/** Upcoming appointments, with buttons to add them to the calendar or get directions. */
public class VisitsFragment extends Fragment {

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup parent,
                             @Nullable Bundle savedInstanceState) {
        View root = inflater.inflate(R.layout.fragment_visits, parent, false);
        LinearLayout list = root.findViewById(R.id.visits_container);

        for (Appointment a : RecoveryRepository.get().appointments) {
            View card = inflater.inflate(R.layout.item_visit, list, false);

            View badge = card.findViewById(R.id.date_badge);
            ((TextView) badge.findViewById(R.id.text_month)).setText(a.monthShort());
            ((TextView) badge.findViewById(R.id.text_day_num)).setText(a.dayNumber());

            ((TextView) card.findViewById(R.id.text_title)).setText(a.title);
            ((TextView) card.findViewById(R.id.text_who)).setText(a.withWho);
            ((TextView) card.findViewById(R.id.text_time)).setText(a.whenText());
            ((TextView) card.findViewById(R.id.text_place)).setText(a.place);

            TextView prep = card.findViewById(R.id.text_prep);
            if (a.prep == null) prep.setVisibility(View.GONE);
            else prep.setText(a.prep);

            card.findViewById(R.id.button_calendar).setOnClickListener(v -> addToCalendar(a));
            card.findViewById(R.id.button_directions).setOnClickListener(v -> openMap(a));

            list.addView(card);
        }
        return root;
    }

    /** Opens the phone's calendar app with the event already filled in. */
    private void addToCalendar(Appointment a) {
        Intent intent = new Intent(Intent.ACTION_INSERT)
                .setData(CalendarContract.Events.CONTENT_URI)
                .putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, a.startMillis())
                .putExtra(CalendarContract.EXTRA_EVENT_END_TIME, a.startMillis() + 60 * 60 * 1000)
                .putExtra(CalendarContract.Events.TITLE, a.title + " (" + a.withWho + ")")
                .putExtra(CalendarContract.Events.EVENT_LOCATION, a.place)
                .putExtra(CalendarContract.Events.DESCRIPTION, a.prep);
        launch(intent, "No calendar app found");
    }

    /** Opens Google Maps (or any map app) at the address. */
    private void openMap(Appointment a) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("geo:0,0?q=" + Uri.encode(a.place)));
        launch(intent, "No maps app found");
    }

    private void launch(Intent intent, String errorMessage) {
        try {
            startActivity(intent);
        } catch (Exception e) {
            Toast.makeText(requireContext(), errorMessage, Toast.LENGTH_SHORT).show();
        }
    }
}
