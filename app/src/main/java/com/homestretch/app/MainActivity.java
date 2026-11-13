package com.homestretch.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.ContextCompat;

import androidx.appcompat.app.AppCompatActivity;
import androidx.fragment.app.Fragment;

import com.google.android.material.bottomnavigation.BottomNavigationView;
import com.homestretch.app.alerts.ReminderScheduler;
import com.homestretch.app.ui.CheckInFragment;
import com.homestretch.app.ui.MedsFragment;
import com.homestretch.app.ui.TodayFragment;
import com.homestretch.app.ui.VisitsFragment;

/** The main screen: shows one tab at a time, with the bottom bar to switch. */
public class MainActivity extends AppCompatActivity {

    private BottomNavigationView bottomNav;

    // Android 13+ asks before an app can show notifications
    private final ActivityResultLauncher<String> askNotifications =
            registerForActivityResult(new ActivityResultContracts.RequestPermission(), granted -> {
                if (!granted) {
                    Toast.makeText(this, "Medicine reminders are off. You can turn them on in Settings.",
                            Toast.LENGTH_LONG).show();
                }
            });

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        bottomNav = findViewById(R.id.bottom_nav);
        bottomNav.setOnItemSelectedListener(item -> {
            showTab(item.getItemId());
            return true;
        });

        if (savedInstanceState == null) {
            bottomNav.setSelectedItemId(R.id.tab_today);
        }

        ReminderScheduler.createChannel(this);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            askNotifications.launch(Manifest.permission.POST_NOTIFICATIONS);
        }
    }

    /** Lets other screens jump to a tab, e.g. Today → Check-in. */
    public void goToTab(int tabId) {
        bottomNav.setSelectedItemId(tabId);
    }

    private void showTab(int tabId) {
        Fragment fragment;
        if (tabId == R.id.tab_meds) fragment = new MedsFragment();
        else if (tabId == R.id.tab_visits) fragment = new VisitsFragment();
        else if (tabId == R.id.tab_checkin) fragment = new CheckInFragment();
        else fragment = new TodayFragment();

        getSupportFragmentManager()
                .beginTransaction()
                .replace(R.id.fragment_container, fragment)
                .commit();
    }
}
