package ch.jarvis.assistant.action;

import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class GermanCommandParser {
    private static final Pattern URL_COMMAND = Pattern.compile(
        "^(?:öffne|rufe)\\s+((?:https?://|www\\.)\\S+)$",
        Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE
    );
    private static final Pattern INTERNET_SEARCH = Pattern.compile(
        "^(?:suche|such)\\s+(?:im internet|im web|online)\\s+nach\\s+(.+)$",
        Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE
    );
    private static final Pattern SIMPLE_SEARCH = Pattern.compile(
        "^(?:suche|such)\\s+nach\\s+(.+)$",
        Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE
    );
    private static final Pattern EMAIL = Pattern.compile(
        "^(?:schreibe|verfasse|erstelle)(?:\\s+(?:eine\\s+neue|eine|neue))?" +
        "\\s+e-?mail(?:\\s+an\\s+(\\S+))?" +
        "(?:\\s+mit\\s+betreff\\s+(.*?)(?=\\s+und\\s+text\\s+|$))?" +
        "(?:\\s+und\\s+text\\s+(.+))?$",
        Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE | Pattern.DOTALL
    );
    private static final Pattern WHATSAPP_TEXT = Pattern.compile(
        "^(?:schreibe|sende|verfasse)(?:\\s+eine\\s+nachricht)?" +
        "\\s+(?:über|per)\\s+whatsapp\\s*:?\\s*(.*)$",
        Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE | Pattern.DOTALL
    );
    private static final Pattern WHATSAPP_CONTACT = Pattern.compile(
        "^(?:schreibe|sende|verfasse)\\s+(?:eine\\s+)?" +
        "whatsapp(?:-nachricht)?\\s+an\\s+([^:]+?)(?:\\s*:\\s*(.+))?$",
        Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE | Pattern.DOTALL
    );

    private static final Map<String, String> APP_ALIASES = createAliases();

    public ActionRequest parse(String spokenText) {
        String command = spokenText == null ? "" : spokenText.trim();
        if (command.isEmpty()) {
            return ActionRequest.of(ActionType.UNKNOWN_COMMAND);
        }
        String normalized = command
            .toLowerCase(Locale.GERMAN)
            .replaceAll("[.!?]+$", "")
            .trim();

        if (
            normalized.equals("schließe jarvis") ||
            normalized.equals("beende jarvis") ||
            normalized.equals("schließe den assistenten")
        ) {
            return ActionRequest.of(ActionType.CLOSE_ASSISTANT);
        }
        if (
            normalized.equals("gehe zurück") ||
            normalized.equals("geh zurück") ||
            normalized.equals("zurück")
        ) {
            return ActionRequest.of(ActionType.GO_BACK);
        }
        if (
            normalized.equals("mache ein foto") ||
            normalized.equals("mach ein foto") ||
            normalized.equals("fotografiere") ||
            normalized.equals("nimm ein foto auf")
        ) {
            return ActionRequest.of(ActionType.CAPTURE_PHOTO)
                .withSafety(RiskLevel.MEDIUM, false, 30_000L);
        }
        if (
            normalized.equals("öffne die kamera") ||
            normalized.equals("öffne kamera") ||
            normalized.equals("starte die kamera")
        ) {
            return ActionRequest.of(ActionType.OPEN_CAMERA);
        }

        Matcher email = EMAIL.matcher(command);
        if (email.matches()) {
            return ActionRequest.of(ActionType.COMPOSE_EMAIL)
                .withTargetApp("outlook")
                .withParameter("recipient", email.group(1))
                .withParameter("subject", email.group(2))
                .withParameter("body", email.group(3))
                .withSafety(RiskLevel.MEDIUM, false, 15_000L);
        }

        Matcher whatsappContact = WHATSAPP_CONTACT.matcher(command);
        if (whatsappContact.matches()) {
            return ActionRequest.of(ActionType.PREPARE_WHATSAPP_MESSAGE)
                .withTargetApp("whatsapp")
                .withParameter("recipientName", whatsappContact.group(1))
                .withParameter("text", whatsappContact.group(2))
                .withSafety(RiskLevel.MEDIUM, false, 15_000L);
        }

        Matcher whatsappText = WHATSAPP_TEXT.matcher(command);
        if (whatsappText.matches()) {
            return ActionRequest.of(ActionType.PREPARE_WHATSAPP_MESSAGE)
                .withTargetApp("whatsapp")
                .withParameter("text", whatsappText.group(1))
                .withSafety(RiskLevel.MEDIUM, false, 15_000L);
        }

        if (
            normalized.equals("öffne whatsapp") ||
            normalized.equals("starte whatsapp")
        ) {
            return ActionRequest.of(ActionType.OPEN_APP)
                .withTargetApp("whatsapp");
        }

        Matcher url = URL_COMMAND.matcher(command);
        if (url.matches()) {
            String value = url.group(1);
            if (value.toLowerCase(Locale.ROOT).startsWith("www.")) {
                value = "https://" + value;
            }
            return ActionRequest.of(ActionType.OPEN_URL)
                .withTargetApp("browser")
                .withParameter("url", value);
        }

        Matcher internetSearch = INTERNET_SEARCH.matcher(command);
        if (internetSearch.matches()) {
            return search(internetSearch.group(1));
        }
        Matcher simpleSearch = SIMPLE_SEARCH.matcher(command);
        if (simpleSearch.matches()) {
            return search(simpleSearch.group(1));
        }

        String appName = extractOpenedApp(normalized);
        String targetApp = APP_ALIASES.get(appName);
        if (targetApp != null) {
            return ActionRequest.of(ActionType.OPEN_APP)
                .withTargetApp(targetApp);
        }

        return ActionRequest.of(ActionType.UNKNOWN_COMMAND)
            .withParameter("spokenText", command);
    }

    private ActionRequest search(String query) {
        return ActionRequest.of(ActionType.WEB_SEARCH)
            .withTargetApp("browser")
            .withParameter("query", query);
    }

    private String extractOpenedApp(String normalized) {
        String[] prefixes = { "öffne ", "starte " };
        for (String prefix : prefixes) {
            if (normalized.startsWith(prefix)) {
                return normalized.substring(prefix.length())
                    .replaceFirst("^(die|den|das)\\s+", "")
                    .trim();
            }
        }
        return "";
    }

    private static Map<String, String> createAliases() {
        Map<String, String> aliases = new LinkedHashMap<>();
        aliases.put("outlook", "outlook");
        aliases.put("microsoft outlook", "outlook");
        aliases.put("smartwe", "smartwe");
        aliases.put("smart we", "smartwe");
        aliases.put("chrome", "chrome");
        aliases.put("google chrome", "chrome");
        aliases.put("browser", "browser");
        aliases.put("standardbrowser", "browser");
        aliases.put("telefon", "phone");
        aliases.put("kontakte", "contacts");
        aliases.put("kalender", "calendar");
        aliases.put("google maps", "maps");
        aliases.put("maps", "maps");
        aliases.put("gmail", "gmail");
        aliases.put("chatgpt", "chatgpt");
        aliases.put("claude", "claude");
        return aliases;
    }
}
