package ch.jarvis.assistant;

import android.service.voice.VoiceInteractionService;

public class JarvisVoiceInteractionService extends VoiceInteractionService {
    @Override
    public void onReady() {
        super.onReady();
        setDisabledShowContext(0);
    }
}
