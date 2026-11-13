package com.homestretch.app.data;

import com.homestretch.app.BuildConfig;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Sends the discharge papers to the Tandon Hack server (server.js → POST /api/extract),
 * which reads them with AI and sends back the plan as JSON.
 *
 * The AI key lives on the server, never inside the app. Set the server address in
 * local.properties:  medly.serverUrl=http://10.0.2.2:3000
 *
 * Call this from a background thread.
 */
public final class ExtractApi {

    private ExtractApi() {}

    public static class ApiException extends Exception {
        public ApiException(String message) { super(message); }
    }

    /** Result: the "plan" object, and whether it was the server's sample data. */
    public static final class Result {
        public final JSONObject plan;
        public final boolean demo;
        Result(JSONObject plan, boolean demo) { this.plan = plan; this.demo = demo; }
    }

    public static Result extract(byte[] file, String mimeType, String fileName) throws ApiException {
        String boundary = "----medly" + System.currentTimeMillis();
        HttpURLConnection conn = null;
        try {
            URL url = new URL(BuildConfig.SERVER_URL.replaceAll("/+$", "") + "/api/extract");
            conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(15_000);
            conn.setReadTimeout(120_000);   // the AI can take a while on long PDFs
            conn.setDoOutput(true);
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "multipart/form-data; boundary=" + boundary);

            try (OutputStream out = conn.getOutputStream()) {
                String head = "--" + boundary + "\r\n"
                        + "Content-Disposition: form-data; name=\"file\"; filename=\"" + fileName + "\"\r\n"
                        + "Content-Type: " + mimeType + "\r\n\r\n";
                out.write(head.getBytes(StandardCharsets.UTF_8));
                out.write(file);
                out.write(("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));
            }

            int code = conn.getResponseCode();
            InputStream in = code < 400 ? conn.getInputStream() : conn.getErrorStream();
            String body = in == null ? "" : readAll(in);
            JSONObject json = body.isEmpty() ? new JSONObject() : new JSONObject(body);

            if (code >= 400 || json.has("error")) {
                throw new ApiException(json.optString("error", "The server had a problem (" + code + ")."));
            }
            JSONObject plan = json.optJSONObject("plan");
            if (plan == null) throw new ApiException("The server didn't send a plan back.");
            return new Result(plan, json.optBoolean("demo"));

        } catch (ApiException e) {
            throw e;
        } catch (java.net.ConnectException | java.net.UnknownHostException | java.net.SocketTimeoutException e) {
            throw new ApiException("Can't reach the Medly server at " + BuildConfig.SERVER_URL
                    + ". Is it running (npm start)?");
        } catch (Exception e) {
            throw new ApiException("Something went wrong reading your papers: " + e.getMessage());
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static String readAll(InputStream in) throws java.io.IOException {
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        byte[] chunk = new byte[8192];
        int n;
        while ((n = in.read(chunk)) != -1) buf.write(chunk, 0, n);
        return buf.toString("UTF-8");
    }
}
