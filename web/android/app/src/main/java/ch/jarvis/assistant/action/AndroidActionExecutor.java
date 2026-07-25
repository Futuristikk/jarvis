package ch.jarvis.assistant.action;

import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.provider.MediaStore;
import android.util.Patterns;

import androidx.core.content.FileProvider;

import java.io.File;
import java.io.IOException;
import java.util.Locale;

public final class AndroidActionExecutor {
    public interface SessionController {
        void goBack();
        void closeAssistant();
    }

    private final Context context;
    private final PackageManager packageManager;
    private final AppRegistry appRegistry;
    private final ConfirmationManager confirmationManager;

    public AndroidActionExecutor(Context context) {
        this.context = context;
        this.packageManager = context.getPackageManager();
        this.appRegistry = new AppRegistry(context);
        this.confirmationManager = new ConfirmationManager();
    }

    public ActionResult execute(
        ActionRequest request,
        SessionController sessionController
    ) {
        ActionResult validation = confirmationManager.validate(request);
        if (!validation.isSuccess()) {
            return validation;
        }
        if (request.getTimeoutMs() <= 0 || request.getTimeoutMs() > 60_000L) {
            return ActionResult.failure(
                "Die Aktion besitzt kein zulässiges Zeitlimit."
            );
        }

        try {
            switch (request.getActionType()) {
                case OPEN_APP:
                    return openApp(request.getTargetApp());
                case OPEN_URL:
                    return openUrl(request.getParameter("url"));
                case WEB_SEARCH:
                    return searchWeb(request.getParameter("query"));
                case OPEN_CAMERA:
                    return openCamera();
                case CAPTURE_PHOTO:
                    return capturePhoto();
                case COMPOSE_EMAIL:
                    return composeEmail(request);
                case OPEN_WHATSAPP:
                    return openApp("whatsapp");
                case PREPARE_WHATSAPP_MESSAGE:
                    return prepareWhatsApp(request);
                case GO_BACK:
                    sessionController.goBack();
                    return ActionResult.success("Ich gehe zurück.", true);
                case CLOSE_ASSISTANT:
                    sessionController.closeAssistant();
                    return ActionResult.success("Jarvis wird geschlossen.", true);
                default:
                    return ActionResult.failure(
                        "Diesen Befehl kann ich noch nicht lokal ausführen."
                    );
            }
        } catch (ActivityNotFoundException exception) {
            return ActionResult.failure(
                "Für diese Aktion wurde keine passende Android-App gefunden."
            );
        } catch (SecurityException exception) {
            return ActionResult.failure(
                "Android hat diese Aktion aus Sicherheitsgründen blockiert."
            );
        } catch (IOException exception) {
            return ActionResult.failure(
                "Das temporäre Foto konnte nicht sicher vorbereitet werden."
            );
        }
    }

    private ActionResult openApp(String appKey) {
        if ("browser".equals(appKey)) {
            return openUrl("https://www.google.com/");
        }
        AppRegistry.ResolvedApp app = appRegistry.resolve(appKey);
        if (app == null) {
            return ActionResult.failure(
                appRegistry.getDisplayName(appKey) +
                " ist auf diesem Gerät nicht installiert."
            );
        }
        Intent intent = appRegistry.createLaunchIntent(app);
        if (!canResolve(intent)) {
            return ActionResult.failure(
                app.getDisplayName() + " kann nicht geöffnet werden."
            );
        }
        context.startActivity(intent);
        return ActionResult.success(
            app.getDisplayName() + " wird geöffnet.",
            true
        );
    }

    private ActionResult openUrl(String url) {
        Uri uri;
        try {
            uri = Uri.parse(url);
        } catch (Exception exception) {
            return ActionResult.failure("Die Internetadresse ist ungültig.");
        }
        String scheme = uri.getScheme();
        if (
            scheme == null ||
            !(
                "http".equals(scheme.toLowerCase(Locale.ROOT)) ||
                "https".equals(scheme.toLowerCase(Locale.ROOT))
            )
        ) {
            return ActionResult.failure(
                "Jarvis öffnet ausschließlich sichere HTTP- oder HTTPS-Adressen."
            );
        }
        Intent intent = new Intent(Intent.ACTION_VIEW, uri)
            .addCategory(Intent.CATEGORY_BROWSABLE)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (!canResolve(intent)) {
            return ActionResult.failure(
                "Auf diesem Gerät ist kein geeigneter Browser verfügbar."
            );
        }
        context.startActivity(intent);
        return ActionResult.success("Die Internetseite wird geöffnet.", true);
    }

    private ActionResult searchWeb(String query) {
        if (query == null || query.trim().isEmpty()) {
            return ActionResult.failure("Der Suchbegriff fehlt.");
        }
        Uri uri = new Uri.Builder()
            .scheme("https")
            .authority("www.google.com")
            .appendPath("search")
            .appendQueryParameter("q", query.trim())
            .build();
        Intent intent = new Intent(Intent.ACTION_VIEW, uri)
            .addCategory(Intent.CATEGORY_BROWSABLE)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (!canResolve(intent)) {
            return ActionResult.failure(
                "Auf diesem Gerät ist kein geeigneter Browser verfügbar."
            );
        }
        context.startActivity(intent);
        return ActionResult.success(
            "Ich suche im Internet nach " + query.trim() + ".",
            true
        );
    }

    private ActionResult openCamera() {
        Intent intent = new Intent(MediaStore.INTENT_ACTION_STILL_IMAGE_CAMERA)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (!canResolve(intent)) {
            return ActionResult.failure(
                "Auf diesem Gerät wurde keine Kamera-App gefunden."
            );
        }
        context.startActivity(intent);
        return ActionResult.success("Ich öffne die Kamera.", true);
    }

    private ActionResult capturePhoto() throws IOException {
        File directory = new File(context.getCacheDir(), "assistant_photos");
        if (!directory.exists() && !directory.mkdirs()) {
            throw new IOException("Fotoverzeichnis konnte nicht erstellt werden.");
        }
        File target = File.createTempFile("jarvis_", ".jpg", directory);
        Uri outputUri = FileProvider.getUriForFile(
            context,
            context.getPackageName() + ".fileprovider",
            target
        );
        Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE)
            .putExtra(MediaStore.EXTRA_OUTPUT, outputUri)
            .setClipData(ClipData.newRawUri("Jarvis-Foto", outputUri))
            .addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK |
                Intent.FLAG_GRANT_READ_URI_PERMISSION |
                Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            );
        if (!canResolve(intent)) {
            return ActionResult.failure(
                "Auf diesem Gerät wurde keine Kamera-App gefunden."
            );
        }
        context.startActivity(intent);
        return ActionResult.success(
            "Die Kamera ist bereit. Du löst das Foto selbst aus.",
            true
        );
    }

    private ActionResult composeEmail(ActionRequest request) {
        String recipient = request.getParameter("recipient");
        if (
            !recipient.isEmpty() &&
            !Patterns.EMAIL_ADDRESS.matcher(recipient).matches()
        ) {
            return ActionResult.failure(
                "Die erkannte E-Mail-Adresse ist ungültig."
            );
        }

        Uri mailto = Uri.fromParts("mailto", recipient, null)
            .buildUpon()
            .appendQueryParameter("subject", request.getParameter("subject"))
            .appendQueryParameter("body", request.getParameter("body"))
            .build();
        Intent intent = new Intent(Intent.ACTION_SENDTO, mailto)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

        AppRegistry.ResolvedApp outlook = appRegistry.resolve("outlook");
        if (outlook != null) {
            intent.setPackage(outlook.getPackageName());
        }
        if (!canResolve(intent) && outlook != null) {
            intent.setPackage(null);
        }
        if (!canResolve(intent)) {
            return ActionResult.failure(
                "Es wurde keine E-Mail-App für einen sicheren Entwurf gefunden."
            );
        }
        context.startActivity(intent);
        return ActionResult.success(
            "Der E-Mail-Entwurf wird geöffnet. Du sendest ihn selbst.",
            true
        );
    }

    private ActionResult prepareWhatsApp(ActionRequest request) {
        AppRegistry.ResolvedApp whatsapp = appRegistry.resolve("whatsapp");
        if (whatsapp == null) {
            return ActionResult.failure(
                "WhatsApp ist auf diesem Gerät nicht installiert."
            );
        }

        String text = request.getParameter("text");
        if (text.isEmpty()) {
            Intent launchIntent = appRegistry.createLaunchIntent(whatsapp);
            if (!canResolve(launchIntent)) {
                return ActionResult.failure("WhatsApp kann nicht geöffnet werden.");
            }
            context.startActivity(launchIntent);
            return ActionResult.success(
                "WhatsApp wird geöffnet. Wähle den Kontakt und schreibe die Nachricht selbst.",
                true
            );
        }

        Intent intent = new Intent(Intent.ACTION_SEND)
            .setType("text/plain")
            .setPackage(whatsapp.getPackageName())
            .putExtra(Intent.EXTRA_TEXT, text)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (!canResolve(intent)) {
            return ActionResult.failure(
                "WhatsApp kann den vorbereiteten Text nicht übernehmen."
            );
        }
        context.startActivity(intent);
        return ActionResult.success(
            "WhatsApp wird mit dem vorbereiteten Text geöffnet. Du sendest selbst.",
            true
        );
    }

    private boolean canResolve(Intent intent) {
        return intent != null && intent.resolveActivity(packageManager) != null;
    }
}
