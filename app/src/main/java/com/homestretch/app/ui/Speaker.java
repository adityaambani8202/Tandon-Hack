package com.homestretch.app.ui;

import android.content.Context;
import android.speech.tts.TextToSpeech;

import java.util.Locale;

/** Reads text out loud using the phone's built-in voice. */
public class Speaker {

    private TextToSpeech tts;
    private boolean ready = false;

    public Speaker(Context context) {
        tts = new TextToSpeech(context.getApplicationContext(), status -> {
            if (status == TextToSpeech.SUCCESS) {
                tts.setLanguage(Locale.getDefault());
                tts.setSpeechRate(0.9f);   // a little slower than normal, easier to follow
                ready = true;
            }
        });
    }

    public void say(String text) {
        if (ready) tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "homestretch");
    }

    public void shutdown() {
        tts.shutdown();
    }
}
