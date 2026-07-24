package ch.jarvis.assistant;

import android.content.Intent;
import android.os.Bundle;
import android.speech.RecognitionService;
import android.speech.SpeechRecognizer;

public class JarvisRecognitionService extends RecognitionService {
    @Override
    protected void onStartListening(Intent recognizerIntent, Callback listener) {
        listener.error(SpeechRecognizer.ERROR_CLIENT);
    }

    @Override
    protected void onCancel(Callback listener) {
        // Keine dauerhafte oder heimliche Aufnahme.
    }

    @Override
    protected void onStopListening(Callback listener) {
        listener.results(new Bundle());
    }
}
