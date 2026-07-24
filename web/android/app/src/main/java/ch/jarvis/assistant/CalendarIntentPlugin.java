package ch.jarvis.assistant;

import android.content.Intent;
import android.provider.CalendarContract;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "CalendarIntent")
public class CalendarIntentPlugin extends Plugin {

    @PluginMethod
    public void prepareEvent(PluginCall call) {
        String title = call.getString("title");
        Long startTime = call.getLong("startTime");
        Long endTime = call.getLong("endTime");

        if (title == null || title.trim().isEmpty()) {
            call.reject("Der Termin benötigt einen Titel.");
            return;
        }
        if (startTime == null || endTime == null || endTime <= startTime) {
            call.reject("Die Endzeit muss nach der Startzeit liegen.");
            return;
        }

        Intent intent = new Intent(Intent.ACTION_INSERT)
            .setData(CalendarContract.Events.CONTENT_URI)
            .putExtra(CalendarContract.Events.TITLE, title.trim())
            .putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, startTime)
            .putExtra(CalendarContract.EXTRA_EVENT_END_TIME, endTime);

        putOptionalExtra(intent, CalendarContract.Events.EVENT_LOCATION, call.getString("location"));
        putOptionalExtra(intent, CalendarContract.Events.DESCRIPTION, call.getString("description"));

        if (intent.resolveActivity(getContext().getPackageManager()) == null) {
            call.reject("Auf diesem Gerät ist keine Kalender-App verfügbar.");
            return;
        }

        getActivity().startActivity(intent);
        JSObject result = new JSObject();
        result.put("opened", true);
        call.resolve(result);
    }

    private void putOptionalExtra(Intent intent, String key, String value) {
        if (value != null && !value.trim().isEmpty()) {
            intent.putExtra(key, value.trim());
        }
    }
}
