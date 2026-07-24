package ch.jarvis.assistant;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.ContactsContract;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ContactPicker")
public class ContactPickerPlugin extends Plugin {

    @PluginMethod
    public void pickPhoneContact(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_PICK);
        intent.setType(ContactsContract.CommonDataKinds.Phone.CONTENT_TYPE);

        if (intent.resolveActivity(getContext().getPackageManager()) == null) {
            call.reject("Auf diesem Gerät ist keine Kontakte-App verfügbar.");
            return;
        }

        startActivityForResult(call, intent, "phoneContactPicked");
    }

    @ActivityCallback
    private void phoneContactPicked(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }

        JSObject response = new JSObject();
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            response.put("cancelled", true);
            call.resolve(response);
            return;
        }

        Uri contactUri = data.getData();
        String[] projection = new String[] {
            ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
            ContactsContract.CommonDataKinds.Phone.NUMBER
        };

        try (Cursor cursor = getContext().getContentResolver().query(
            contactUri,
            projection,
            null,
            null,
            null
        )) {
            if (cursor == null || !cursor.moveToFirst()) {
                call.reject("Der ausgewählte Kontakt konnte nicht gelesen werden.");
                return;
            }

            int nameColumn = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME);
            int phoneColumn = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER);
            if (phoneColumn < 0) {
                call.reject("Für diesen Kontakt wurde keine Telefonnummer zurückgegeben.");
                return;
            }

            String phone = cursor.getString(phoneColumn);
            if (phone == null || phone.trim().isEmpty()) {
                call.reject("Für diesen Kontakt wurde keine Telefonnummer zurückgegeben.");
                return;
            }

            String name = nameColumn >= 0 ? cursor.getString(nameColumn) : "";
            response.put("cancelled", false);
            response.put("name", name == null ? "" : name);
            response.put("phone", phone);
            call.resolve(response);
        } catch (SecurityException exception) {
            call.reject("Der Kontaktzugriff wurde vom System nicht freigegeben.", null, exception);
        } catch (Exception exception) {
            call.reject("Der ausgewählte Kontakt konnte nicht verarbeitet werden.", null, exception);
        }
    }
}
