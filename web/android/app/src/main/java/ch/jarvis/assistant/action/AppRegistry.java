package ch.jarvis.assistant.action;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.util.Log;

import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public final class AppRegistry {
    private static final String TAG = "JarvisAppRegistry";
    private static final Map<String, AppDefinition> APPS = createApps();

    private final Context context;
    private final PackageManager packageManager;
    private String discoveredSmartWePackage;

    public AppRegistry(Context context) {
        this.context = context;
        this.packageManager = context.getPackageManager();
    }

    public ResolvedApp resolve(String appKey) {
        if ("browser".equals(appKey)) {
            return new ResolvedApp("browser", "", "Standardbrowser");
        }
        if ("smartwe".equals(appKey)) {
            String packageName = discoverSmartWePackage();
            return packageName.isEmpty()
                ? null
                : new ResolvedApp("smartwe", packageName, "SmartWe");
        }

        AppDefinition definition = APPS.get(appKey);
        if (definition == null) {
            return null;
        }
        for (String packageName : definition.packageNames) {
            if (packageManager.getLaunchIntentForPackage(packageName) != null) {
                return new ResolvedApp(
                    appKey,
                    packageName,
                    definition.displayName
                );
            }
        }
        return null;
    }

    public Intent createLaunchIntent(ResolvedApp app) {
        if (app == null || app.packageName.isEmpty()) {
            return null;
        }
        Intent intent = packageManager.getLaunchIntentForPackage(app.packageName);
        if (intent != null) {
            intent.addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK |
                Intent.FLAG_ACTIVITY_CLEAR_TOP
            );
        }
        return intent;
    }

    public String getDisplayName(String appKey) {
        if ("smartwe".equals(appKey)) {
            return "SmartWe";
        }
        if ("browser".equals(appKey)) {
            return "Standardbrowser";
        }
        AppDefinition definition = APPS.get(appKey);
        return definition == null ? "Die App" : definition.displayName;
    }

    private String discoverSmartWePackage() {
        if (discoveredSmartWePackage != null) {
            return discoveredSmartWePackage;
        }
        discoveredSmartWePackage = "";

        Intent launcherQuery = new Intent(Intent.ACTION_MAIN)
            .addCategory(Intent.CATEGORY_LAUNCHER);
        List<ResolveInfo> launchers = packageManager.queryIntentActivities(
            launcherQuery,
            PackageManager.MATCH_DEFAULT_ONLY
        );
        for (ResolveInfo info : launchers) {
            CharSequence labelValue = info.loadLabel(packageManager);
            String label = labelValue == null
                ? ""
                : labelValue.toString().toLowerCase(Locale.GERMAN);
            String compactLabel = label.replaceAll("[^a-z0-9]", "");
            if (!compactLabel.contains("smartwe")) {
                continue;
            }
            String packageName = info.activityInfo.packageName;
            if (packageName == null || packageName.trim().isEmpty()) {
                continue;
            }
            discoveredSmartWePackage = packageName;
            Log.i(TAG, "SmartWe-Paket erkannt: " + packageName);
            break;
        }
        if (discoveredSmartWePackage.isEmpty()) {
            Log.i(TAG, "Kein sichtbares SmartWe-Launcher-Paket gefunden.");
        }
        return discoveredSmartWePackage;
    }

    private static Map<String, AppDefinition> createApps() {
        Map<String, AppDefinition> apps = new LinkedHashMap<>();
        apps.put(
            "whatsapp",
            new AppDefinition(
                "WhatsApp",
                Arrays.asList("com.whatsapp", "com.whatsapp.w4b")
            )
        );
        apps.put(
            "outlook",
            new AppDefinition(
                "Outlook",
                Collections.singletonList("com.microsoft.office.outlook")
            )
        );
        apps.put(
            "chrome",
            new AppDefinition(
                "Chrome",
                Arrays.asList("com.android.chrome", "com.chrome.beta")
            )
        );
        apps.put(
            "phone",
            new AppDefinition(
                "Telefon",
                Arrays.asList("com.google.android.dialer", "com.android.dialer")
            )
        );
        apps.put(
            "contacts",
            new AppDefinition(
                "Kontakte",
                Arrays.asList(
                    "com.google.android.contacts",
                    "com.android.contacts"
                )
            )
        );
        apps.put(
            "calendar",
            new AppDefinition(
                "Kalender",
                Arrays.asList(
                    "com.google.android.calendar",
                    "com.android.calendar"
                )
            )
        );
        apps.put(
            "maps",
            new AppDefinition(
                "Google Maps",
                Collections.singletonList("com.google.android.apps.maps")
            )
        );
        apps.put(
            "gmail",
            new AppDefinition(
                "Gmail",
                Collections.singletonList("com.google.android.gm")
            )
        );
        apps.put(
            "chatgpt",
            new AppDefinition(
                "ChatGPT",
                Collections.singletonList("com.openai.chatgpt")
            )
        );
        apps.put(
            "claude",
            new AppDefinition(
                "Claude",
                Collections.singletonList("com.anthropic.claude")
            )
        );
        return Collections.unmodifiableMap(apps);
    }

    private static final class AppDefinition {
        private final String displayName;
        private final List<String> packageNames;

        private AppDefinition(String displayName, List<String> packageNames) {
            this.displayName = displayName;
            this.packageNames = packageNames;
        }
    }

    public static final class ResolvedApp {
        private final String key;
        private final String packageName;
        private final String displayName;

        private ResolvedApp(
            String key,
            String packageName,
            String displayName
        ) {
            this.key = key;
            this.packageName = packageName;
            this.displayName = displayName;
        }

        public String getKey() {
            return key;
        }

        public String getPackageName() {
            return packageName;
        }

        public String getDisplayName() {
            return displayName;
        }
    }
}
