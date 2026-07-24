package ch.jarvis.assistant;

import android.content.Intent;
import android.os.Bundle;
import android.os.RemoteException;
import android.speech.RecognitionService;
import android.speech.SpeechRecognizer;

public class JarvisRecognitionService extends RecognitionService {
    @Override
    protected void onStartListening(Intent recognizerIntent, Callback listener) {
        try {
            listener.error(SpeechRecognizer.ERROR_CLIENT);
        } catch (RemoteException ignored) {
            // Der anfragende Prozess wurde bereits beendet.
        }
    }

    @Override
    protected void onCancel(Callback listener) {
        // Keine dauerhafte oder heimliche Aufnahme.
    }

    @Override
    protected void onStopListening(Callback listener) {
        try {
            listener.results(new Bundle());
        } catch (RemoteException ignored) {
            // Der anfragende Prozess wurde bereits beendet.
        }
    }
}
