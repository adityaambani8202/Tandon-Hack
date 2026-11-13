# Medly (Java)

Scan discharge papers → AI finds medicines, visits, diet/activity rules and warning signs →
you double-check → **your phone rings at each medicine time**, even when Medly is closed.

## How the pieces fit
```
Medly (this Android app)  --photo/PDF-->  Tandon Hack server (server.js, POST /api/extract)
                          <--plan JSON--  (holds the AI key: ANTHROPIC_API_KEY or GEMINI_API_KEY)
        |
        └─ AlarmManager → ReminderReceiver → notification with "Taken" / "Snooze 10 min"
```
The AI key stays on the server. Anything built into an app can be pulled out of it, so the key never goes in the APK.

## Run it
1. **Start the AI server** (from the Tandon-Hack repo):
   ```
   npm install
   export ANTHROPIC_API_KEY=sk-ant-...     # or GEMINI_API_KEY=... (free tier)
   npm start                               # http://localhost:3000
   ```
   With no key it still works and sends back sample data.
2. **Tell Medly where the server is.** In `local.properties` (in this folder):
   ```
   medly.serverUrl=http://10.0.2.2:3000        # Android emulator (10.0.2.2 = your laptop)
   # medly.serverUrl=http://192.168.1.23:3000  # real phone on the same Wi-Fi (your laptop's IP)
   # medly.serverUrl=https://your-app.onrender.com
   ```
   Then **File > Sync Project with Gradle Files**.
3. Open in Android Studio: File > Open > `AndroidStudioProjects/HomeStretch`. Press Run.
4. Allow notifications when asked.

## Reminders
- **Scan papers** (Today → scan card) → check each item → **Start my plan**: one daily alarm per dose, plus visit reminders the day before and 2 hours before.
- **Medicines tab → Add a medicine**: type a time like `8:45 PM`, `8:45pm`, `20:45`.
- **Medicines tab → Say it**: say "Tylenol 500 mg at 8:45 PM" and the reminder is set.
- **Send a test reminder**: fires in 10 seconds, good for demos (lock the phone and wait).
- The notification has **Taken** and **Snooze 10 min**. Alarms are set again after the phone restarts.

## Code map
- `alerts/ReminderScheduler.java`: sets and saves alarms (exact time, survives app close)
- `alerts/ReminderReceiver.java`: shows the notification, handles Taken/Snooze, sets tomorrow's alarm
- `alerts/BootReceiver.java`: sets alarms again after a restart
- `data/ExtractApi.java`: uploads the papers to the server
- `data/PlanMapper.java`: turns the AI's JSON into medicines, visits, rules and the double-check list
- `data/TimeParser.java`: understands "8:45 PM", "845 pm", "Tylenol at 8:45 p.m."

## Still to do
- The medicine list itself is kept in memory, so it resets when the app is fully closed (the alarms don't). Next step: save it with Room.
- Before publishing on Google Play: turn off `usesCleartextTraffic` (use an https server) and review the exact-alarm permission rules.
