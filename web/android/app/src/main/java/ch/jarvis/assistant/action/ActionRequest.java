package ch.jarvis.assistant.action;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

public final class ActionRequest {
    private final ActionType actionType;
    private final String targetApp;
    private final Map<String, String> parameters;
    private final RiskLevel riskLevel;
    private final boolean confirmationRequired;
    private final long timeoutMs;

    private ActionRequest(
        ActionType actionType,
        String targetApp,
        Map<String, String> parameters,
        RiskLevel riskLevel,
        boolean confirmationRequired,
        long timeoutMs
    ) {
        this.actionType = actionType;
        this.targetApp = targetApp;
        this.parameters = Collections.unmodifiableMap(
            new LinkedHashMap<>(parameters)
        );
        this.riskLevel = riskLevel;
        this.confirmationRequired = confirmationRequired;
        this.timeoutMs = timeoutMs;
    }

    public static ActionRequest of(ActionType actionType) {
        return new ActionRequest(
            actionType,
            "",
            Collections.emptyMap(),
            RiskLevel.LOW,
            false,
            10_000L
        );
    }

    public ActionRequest withTargetApp(String targetApp) {
        return new ActionRequest(
            actionType,
            targetApp,
            parameters,
            riskLevel,
            confirmationRequired,
            timeoutMs
        );
    }

    public ActionRequest withParameter(String key, String value) {
        Map<String, String> updated = new LinkedHashMap<>(parameters);
        if (value != null && !value.trim().isEmpty()) {
            updated.put(key, value.trim());
        }
        return new ActionRequest(
            actionType,
            targetApp,
            updated,
            riskLevel,
            confirmationRequired,
            timeoutMs
        );
    }

    public ActionRequest withSafety(
        RiskLevel riskLevel,
        boolean confirmationRequired,
        long timeoutMs
    ) {
        return new ActionRequest(
            actionType,
            targetApp,
            parameters,
            riskLevel,
            confirmationRequired,
            timeoutMs
        );
    }

    public ActionType getActionType() {
        return actionType;
    }

    public String getTargetApp() {
        return targetApp;
    }

    public Map<String, String> getParameters() {
        return parameters;
    }

    public String getParameter(String key) {
        String value = parameters.get(key);
        return value == null ? "" : value;
    }

    public RiskLevel getRiskLevel() {
        return riskLevel;
    }

    public boolean isConfirmationRequired() {
        return confirmationRequired;
    }

    public long getTimeoutMs() {
        return timeoutMs;
    }
}
