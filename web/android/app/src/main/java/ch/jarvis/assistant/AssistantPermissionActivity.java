package ch.jarvis.assistant;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Bundle;

public class AssistantPermissionActivity extends Activity {
    public static final String ACTION_PERMISSION_RESULT =
        "ch.jarvis.assistant.MICROPHONE_PERMISSION_RESULT";
    public static final String EXTRA_GRANTED = "granted";
    private static final int REQUEST_RECORD_AUDIO = 4101;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO)
            == PackageManager.PERMISSION_GRANTED) {
            reportResult(true);
            return;
        }
        requestPermissions(
            new String[] { Manifest.permission.RECORD_AUDIO },
            REQUEST_RECORD_AUDIO
        );
    }

    @Override
    public void onRequestPermissionsResult(
        int requestCode,
        String[] permissions,
        int[] grantResults
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != REQUEST_RECORD_AUDIO) {
            return;
        }
        boolean granted = grantResults.length > 0
            && grantResults[0] == PackageManager.PERMISSION_GRANTED;
        reportResult(granted);
    }

    private void reportResult(boolean granted) {
        Intent result = new Intent(ACTION_PERMISSION_RESULT)
            .setPackage(getPackageName())
            .putExtra(EXTRA_GRANTED, granted);
        sendBroadcast(result);
        finish();
    }
}
