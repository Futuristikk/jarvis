package ch.jarvis.assistant.action;

import java.util.EnumSet;
import java.util.Set;

public final class ConfirmationManager {
    private static final Set<ActionType> DIRECT_ACTIONS = EnumSet.of(
        ActionType.OPEN_APP,
        ActionType.OPEN_URL,
        ActionType.WEB_SEARCH,
        ActionType.OPEN_CAMERA,
        ActionType.CAPTURE_PHOTO,
        ActionType.COMPOSE_EMAIL,
        ActionType.OPEN_WHATSAPP,
        ActionType.PREPARE_WHATSAPP_MESSAGE,
        ActionType.GO_BACK,
        ActionType.CLOSE_ASSISTANT
    );

    public ActionResult validate(ActionRequest request) {
        if (request.getActionType() == ActionType.UNKNOWN_COMMAND) {
            return ActionResult.failure(
                "Diesen Befehl kann ich noch nicht lokal ausführen."
            );
        }
        if (!DIRECT_ACTIONS.contains(request.getActionType())) {
            return ActionResult.failure(
                "Diese Aktion ist aus Sicherheitsgründen nicht freigegeben."
            );
        }
        if (request.isConfirmationRequired()) {
            return ActionResult.failure(
                "Für diese Aktion ist eine sichtbare Bestätigung erforderlich."
            );
        }
        if (request.getRiskLevel() == RiskLevel.HIGH) {
            return ActionResult.failure(
                "Diese Aktion wird lokal nicht automatisch ausgeführt."
            );
        }
        return ActionResult.success("Aktion freigegeben.", false);
    }
}
