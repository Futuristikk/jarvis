package ch.jarvis.assistant;

import android.os.Bundle;
import android.service.voice.VoiceInteractionSession;
import android.service.voice.VoiceInteractionSessionService;

public class JarvisVoiceSessionService extends VoiceInteractionSessionService {
    @Override
    public VoiceInteractionSession onNewSession(Bundle args) {
        return new JarvisVoiceSession(this);
    }
}
