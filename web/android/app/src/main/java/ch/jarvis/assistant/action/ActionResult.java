package ch.jarvis.assistant.action;

public final class ActionResult {
    private final boolean success;
    private final boolean targetOpened;
    private final String message;

    private ActionResult(boolean success, boolean targetOpened, String message) {
        this.success = success;
        this.targetOpened = targetOpened;
        this.message = message;
    }

    public static ActionResult success(String message, boolean targetOpened) {
        return new ActionResult(true, targetOpened, message);
    }

    public static ActionResult failure(String message) {
        return new ActionResult(false, false, message);
    }

    public boolean isSuccess() {
        return success;
    }

    public boolean isTargetOpened() {
        return targetOpened;
    }

    public String getMessage() {
        return message;
    }
}
