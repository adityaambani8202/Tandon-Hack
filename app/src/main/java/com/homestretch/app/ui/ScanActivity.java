package com.homestretch.app.ui;

import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.FileProvider;

import com.google.android.material.dialog.MaterialAlertDialogBuilder;
import com.homestretch.app.R;
import com.homestretch.app.data.ExtractApi;
import com.homestretch.app.data.PlanMapper;
import com.homestretch.app.data.RecoveryRepository;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Lets the patient take a photo or upload a PDF of their discharge papers.
 * The file goes to the Tandon Hack server, whose AI finds the medicines, visits,
 * diet and activity rules and warning signs. Then the patient checks it over.
 */
public class ScanActivity extends AppCompatActivity {

    private static final int MAX_IMAGE_SIDE = 2000;   // big enough to read, small enough to send

    private final ExecutorService background = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    private Uri photoUri;

    // Opens the camera and saves a full-size photo
    private final ActivityResultLauncher<Uri> takePhoto =
            registerForActivityResult(new ActivityResultContracts.TakePicture(), saved -> {
                if (Boolean.TRUE.equals(saved) && photoUri != null) read(photoUri, "image/jpeg");
            });

    // Opens the file picker for PDFs or images
    private final ActivityResultLauncher<String[]> pickFile =
            registerForActivityResult(new ActivityResultContracts.OpenDocument(), uri -> {
                if (uri != null) read(uri, getContentResolver().getType(uri));
            });

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_scan);

        findViewById(R.id.button_back).setOnClickListener(v -> finish());
        findViewById(R.id.button_photo).setOnClickListener(v -> openCamera());
        findViewById(R.id.button_upload).setOnClickListener(v ->
                pickFile.launch(new String[]{"application/pdf", "image/*"}));
        findViewById(R.id.button_sample).setOnClickListener(v -> useSample());
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        background.shutdownNow();
    }

    private void openCamera() {
        try {
            File dir = new File(getCacheDir(), "scans");
            //noinspection ResultOfMethodCallIgnored
            dir.mkdirs();
            File photo = new File(dir, "papers.jpg");
            photoUri = FileProvider.getUriForFile(this, getPackageName() + ".files", photo);
            takePhoto.launch(photoUri);
        } catch (Exception e) {
            Toast.makeText(this, "Couldn't open the camera", Toast.LENGTH_SHORT).show();
        }
    }

    /** Sends the papers to the AI in the background, then opens the confirm screen. */
    private void read(Uri uri, String mimeType) {
        showReading(true);
        String type = mimeType == null ? "application/octet-stream" : mimeType;

        background.execute(() -> {
            try {
                byte[] bytes;
                String sendType;
                if (type.startsWith("image/")) {
                    bytes = shrinkImage(uri);           // also turns HEIC etc. into JPEG
                    sendType = "image/jpeg";
                } else if (type.equals("application/pdf")) {
                    bytes = readBytes(uri);
                    sendType = type;
                } else {
                    throw new ExtractApi.ApiException("Please pick a PDF or a photo.");
                }
                if (bytes.length > 20 * 1024 * 1024) {
                    throw new ExtractApi.ApiException("That file is too large (max 20 MB).");
                }

                ExtractApi.Result result = ExtractApi.extract(bytes, sendType,
                        sendType.equals("application/pdf") ? "papers.pdf" : "papers.jpg");

                main.post(() -> {
                    RecoveryRepository repo = RecoveryRepository.get();
                    PlanMapper.apply(result.plan, repo);
                    if (repo.found.isEmpty()) {
                        showReading(false);
                        showError("We couldn't find any medicines or visits in that file. "
                                + "Try a clearer photo of each page.");
                        return;
                    }
                    if (result.demo) {
                        Toast.makeText(this, "The server has no AI key yet, so this is sample data.",
                                Toast.LENGTH_LONG).show();
                    }
                    openConfirm();
                });
            } catch (ExtractApi.ApiException e) {
                main.post(() -> { showReading(false); showError(e.getMessage()); });
            } catch (Exception e) {
                main.post(() -> { showReading(false); showError("Couldn't open that file."); });
            }
        });
    }

    private void useSample() {
        showReading(true);
        main.postDelayed(() -> {
            RecoveryRepository.get().resetToSample();
            openConfirm();
        }, 1200);
    }

    private void openConfirm() {
        RecoveryRepository.get().setAllConfirmed(false);
        startActivity(new Intent(this, ConfirmActivity.class));
        finish();
    }

    private void showReading(boolean reading) {
        findViewById(R.id.group_choose).setVisibility(reading ? View.GONE : View.VISIBLE);
        findViewById(R.id.group_reading).setVisibility(reading ? View.VISIBLE : View.GONE);
    }

    private void showError(String message) {
        if (isFinishing()) return;
        new MaterialAlertDialogBuilder(this)
                .setTitle("Couldn't read your papers")
                .setMessage(message)
                .setPositiveButton("Try again", null)
                .setNegativeButton("Use sample papers", (d, w) -> useSample())
                .show();
    }

    private byte[] readBytes(Uri uri) throws Exception {
        try (InputStream in = getContentResolver().openInputStream(uri)) {
            if (in == null) throw new Exception("empty");
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
            return out.toByteArray();
        }
    }

    /** Scales a photo down so the longest side is at most 2000 px, saved as JPEG. */
    private byte[] shrinkImage(Uri uri) throws Exception {
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        try (InputStream in = getContentResolver().openInputStream(uri)) {
            BitmapFactory.decodeStream(in, null, bounds);
        }
        int sample = 1;
        while (Math.max(bounds.outWidth, bounds.outHeight) / (sample * 2) >= MAX_IMAGE_SIDE) sample *= 2;

        BitmapFactory.Options opts = new BitmapFactory.Options();
        opts.inSampleSize = sample;
        Bitmap bmp;
        try (InputStream in = getContentResolver().openInputStream(uri)) {
            bmp = BitmapFactory.decodeStream(in, null, opts);
        }
        if (bmp == null) throw new Exception("not an image");

        int longest = Math.max(bmp.getWidth(), bmp.getHeight());
        if (longest > MAX_IMAGE_SIDE) {
            float scale = (float) MAX_IMAGE_SIDE / longest;
            bmp = Bitmap.createScaledBitmap(bmp, Math.round(bmp.getWidth() * scale),
                    Math.round(bmp.getHeight() * scale), true);
        }
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        bmp.compress(Bitmap.CompressFormat.JPEG, 85, out);
        return out.toByteArray();
    }
}
