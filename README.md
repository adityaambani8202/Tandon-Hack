# Recovery Reminder (Tandon Hack)

Scan discharge paperwork (PDF or photo) → extract meds, appointments, diet, activity limits, exercises, red flags → patient confirms → daily schedule, reminders, check-ins, caregiver/doctor views, PDF export.

## Run
```
npm install
export ANTHROPIC_API_KEY=...   # optional; without it the app uses sample data
npm start                      # http://localhost:3000
```

## Implemented
Upload/scan (Claude reads PDFs and images, with page sources) · editable confirm screen · daily med schedule with Taken/Skipped log · in-app notifications + voice · check-ins with red-flag keyword matching · appointment list + .ics export with 1-day/3-hour alerts · diet rules + AI meal ideas · caregiver and doctor status views · PDF summary export · large-text mode.

## Prototype limits / next
Data lives in browser localStorage (no accounts, no HIPAA-grade storage); caregiver/doctor views are simulated on one device; reminders only fire while the app is open (needs push/SMS, e.g. Twilio); Fitbit integration not built; no auth or encryption yet.
