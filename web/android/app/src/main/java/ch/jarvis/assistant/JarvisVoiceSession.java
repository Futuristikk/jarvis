package ch.jarvis.assistant;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.service.voice.VoiceInteractionSession;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.Locale;

import ch.jarvis.assistant.action.ActionRequest;
import ch.jarvis.assistant.action.ActionResult;
import ch.jarvis.assistant.action.ActionType;
import ch.jarvis.assistant.action.AndroidActionExecutor;
import ch.jarvis.assistant.action.GermanCommandParser;

public class JarvisVoiceSession extends VoiceInteractionSession
    implements RecognitionListener {

    private final Context context;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final GermanCommandParser commandParser = new GermanCommandParser();
    private final AndroidActionExecutor actionExecutor;
    private SpeechRecognizer recognizer;
    private TextView statusView;
    private TextView transcriptView;
    private ProgressBar progressView;
    private Button primaryButton;
    private boolean receiverRegistered;
    private boolean listening;

    private final BroadcastReceiver permissionReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context receiverContext, Intent intent) {
            boolean granted = intent.getBooleanExtra(
                AssistantPermissionActivity.EXTRA_GRANTED,
                false
            );
            if (granted) {
                startListening();
            } else {
                showPermissionRequired();
            }
        }
    };

    public JarvisVoiceSession(Context context) {
        super(context);
        this.context = context;
        this.actionExecutor = new AndroidActionExecutor(context);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        setUiEnabled(true);
        IntentFilter filter = new IntentFilter(
            AssistantPermissionActivity.ACTION_PERMISSION_RESULT
        );
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(
                permissionReceiver,
                filter,
                Context.RECEIVER_NOT_EXPORTED
            );
        } else {
            context.registerReceiver(permissionReceiver, filter);
        }
        receiverRegistered = true;
    }

    @Override
    public View onCreateContentView() {
        LinearLayout card = new LinearLayout(context);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setGravity(Gravity.CENTER_HORIZONTAL);
        card.setPadding(dp(24), dp(20), dp(24), dp(24));

        GradientDrawable background = new GradientDrawable();
        background.setColor(Color.rgb(12, 20, 32));
        background.setCornerRadii(new float[] {
            dp(28), dp(28), dp(28), dp(28), 0, 0, 0, 0
        });
        card.setBackground(background);

        TextView title = new TextView(context);
        title.setText("JARVIS");
        title.setTextColor(Color.rgb(112, 231, 255));
        title.setTextSize(18);
        title.setGravity(Gravity.CENTER);
        title.setLetterSpacing(0.18f);
        title.setTypeface(title.getTypeface(), android.graphics.Typeface.BOLD);
        card.addView(title, matchWrap(dp(8)));

        statusView = new TextView(context);
        statusView.setText("Jarvis wird vorbereitet …");
        statusView.setTextColor(Color.WHITE);
        statusView.setTextSize(16);
        statusView.setGravity(Gravity.CENTER);
        card.addView(statusView, matchWrap(dp(12)));

        progressView = new ProgressBar(context);
        progressView.setIndeterminate(true);
        card.addView(progressView, wrap(dp(40), dp(12)));

        transcriptView = new TextView(context);
        transcriptView.setText("Sprich deinen Auftrag auf Deutsch.");
        transcriptView.setTextColor(Color.rgb(202, 213, 225));
        transcriptView.setTextSize(15);
        transcriptView.setGravity(Gravity.CENTER);
        transcriptView.setMinHeight(dp(48));
        card.addView(transcriptView, matchWrap(dp(12)));

        primaryButton = new Button(context);
        primaryButton.setText("Abbrechen");
        primaryButton.setAllCaps(false);
        primaryButton.setOnClickListener(view -> {
            stopRecognition();
            finish();
        });
        card.addView(primaryButton, wrap(dp(160), dp(8)));
        return card;
    }

    @Override
    public void onShow(Bundle args, int showFlags) {
        super.onShow(args, showFlags);
        if (
            context.checkSelfPermission(Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED
        ) {
            startListening();
        } else {
            showPermissionRequired();
        }
    }

    @Override
    public void onHide() {
        stopRecognition();
        super.onHide();
    }

    @Override
    public void onDestroy() {
        stopRecognition();
        if (receiverRegistered) {
            context.unregisterReceiver(permissionReceiver);
            receiverRegistered = false;
        }
        super.onDestroy();
    }

    private void showPermissionRequired() {
        listening = false;
        setBusy(false);
        setStatus("Mikrofonfreigabe erforderlich");
        setTranscript(
            "Jarvis hört erst zu, nachdem du den Mikrofonzugriff sichtbar erlaubt hast."
        );
        primaryButton.setText("Mikrofon erlauben");
        primaryButton.setOnClickListener(view -> {
            Intent permissionIntent = new Intent(
                context,
                AssistantPermissionActivity.class
            ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(permissionIntent);
        });
    }

    private void startListening() {
        if (listening) {
            return;
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            showError(
                "Die integrierte Offline-Spracherkennung benötigt Android 12 oder neuer."
            );
            return;
        }
        if (!SpeechRecognizer.isOnDeviceRecognitionAvailable(context)) {
            showError(
                "Auf diesem Gerät ist keine lokale Android-Spracherkennung eingerichtet."
            );
            return;
        }

        stopRecognition();
        recognizer = SpeechRecognizer.createOnDeviceSpeechRecognizer(context);
        recognizer.setRecognitionListener(this);

        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(
                RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                RecognizerIntent.LANGUAGE_MODEL_FREE_FORM
            )
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.GERMANY.toLanguageTag())
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "de-DE")
            .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            .putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);

        listening = true;
        setBusy(true);
        setStatus("Jarvis hört zu");
        setTranscript("Sprich jetzt deinen Auftrag auf Deutsch.");
        primaryButton.setText("Abbrechen");
        primaryButton.setOnClickListener(view -> {
            stopRecognition();
            finish();
        });
        recognizer.startListening(intent);
    }

    private void stopRecognition() {
        listening = false;
        if (recognizer != null) {
            recognizer.cancel();
            recognizer.destroy();
            recognizer = null;
        }
        setBusy(false);
    }

    private void showError(String message) {
        stopRecognition();
        setStatus("Sprachaufnahme nicht verfügbar");
        setTranscript(message);
        primaryButton.setText("Schließen");
        primaryButton.setOnClickListener(view -> finish());
    }

    private void setStatus(String text) {
        if (statusView != null) {
            statusView.setText(text);
        }
    }

    private void setTranscript(String text) {
        if (transcriptView != null) {
            transcriptView.setText(text);
        }
    }

    private void setBusy(boolean busy) {
        if (progressView != null) {
            progressView.setVisibility(busy ? View.VISIBLE : View.INVISIBLE);
        }
    }

    private void showRecognizedText(Bundle results, boolean isFinal) {
        ArrayList<String> matches = results.getStringArrayList(
            SpeechRecognizer.RESULTS_RECOGNITION
        );
        if (matches == null || matches.isEmpty()) {
            return;
        }
        setTranscript(matches.get(0));
        if (isFinal) {
            executeRecognizedCommand(matches.get(0));
        }
    }

    private void executeRecognizedCommand(String spokenText) {
        stopRecognition();
        setBusy(true);
        setStatus("Jarvis analysiert");
        setTranscript(spokenText);

        mainHandler.postDelayed(() -> {
            ActionRequest request = commandParser.parse(spokenText);
            ActionResult result = actionExecutor.execute(
                request,
                new AndroidActionExecutor.SessionController() {
                    @Override
                    public void goBack() {
                        hide();
                    }

                    @Override
                    public void closeAssistant() {
                        finish();
                    }
                }
            );

            if (
                request.getActionType() == ActionType.GO_BACK ||
                request.getActionType() == ActionType.CLOSE_ASSISTANT
            ) {
                return;
            }

            setBusy(false);
            setStatus(result.isSuccess() ? "Aktion abgeschlossen" : "Aktion nicht möglich");
            setTranscript(result.getMessage());

            if (result.isSuccess() && result.isTargetOpened()) {
                mainHandler.postDelayed(this::finish, 500L);
                return;
            }

            primaryButton.setText("Erneut versuchen");
            primaryButton.setOnClickListener(view -> startListening());
        }, 150L);
    }

    @Override
    public void onReadyForSpeech(Bundle params) {
        setStatus("Jarvis hört zu");
    }

    @Override
    public void onBeginningOfSpeech() {
        setStatus("Jarvis hört dich");
    }

    @Override
    public void onRmsChanged(float rmsdB) {
        // Die kompakte Oberfläche benötigt keine permanente Pegelanzeige.
    }

    @Override
    public void onBufferReceived(byte[] buffer) {
        // Audiodaten werden ausschließlich vom Android-Spracherkenner verarbeitet.
    }

    @Override
    public void onEndOfSpeech() {
        setStatus("Jarvis analysiert");
    }

    @Override
    public void onError(int error) {
        String message;
        switch (error) {
            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS:
                message =
                    "Android hat den Mikrofonzugriff abgelehnt. Erlaube ihn in den App-Einstellungen.";
                break;
            case SpeechRecognizer.ERROR_NO_MATCH:
                message = "Ich konnte den Auftrag nicht verstehen. Bitte versuche es erneut.";
                break;
            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT:
                message = "Ich habe keine Sprache erkannt. Bitte versuche es erneut.";
                break;
            case SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED:
            case SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE:
                message = "Die deutsche Spracherkennung ist auf diesem Gerät nicht verfügbar.";
                break;
            case SpeechRecognizer.ERROR_NETWORK:
            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT:
                message = "Die Android-Spracherkennung ist gerade nicht erreichbar.";
                break;
            default:
                message = "Die Sprachaufnahme wurde unterbrochen. Bitte versuche es erneut.";
                break;
        }
        stopRecognition();
        setStatus("Sprachaufnahme fehlgeschlagen");
        setTranscript(message);
        primaryButton.setText("Erneut versuchen");
        primaryButton.setOnClickListener(view -> startListening());
    }

    @Override
    public void onResults(Bundle results) {
        showRecognizedText(results, true);
    }

    @Override
    public void onPartialResults(Bundle partialResults) {
        showRecognizedText(partialResults, false);
    }

    @Override
    public void onEvent(int eventType, Bundle params) {
        // Keine herstellerspezifischen Ereignisse erforderlich.
    }

    private int dp(int value) {
        return Math.round(value * context.getResources().getDisplayMetrics().density);
    }

    private LinearLayout.LayoutParams matchWrap(int topMargin) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        params.topMargin = topMargin;
        return params;
    }

    private LinearLayout.LayoutParams wrap(int width, int topMargin) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
            width,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        params.topMargin = topMargin;
        return params;
    }
}
