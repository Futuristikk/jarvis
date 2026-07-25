package ch.jarvis.assistant.action;

import static org.junit.Assert.assertEquals;

import org.junit.Before;
import org.junit.Test;

public class GermanCommandParserTest {
    private GermanCommandParser parser;

    @Before
    public void setUp() {
        parser = new GermanCommandParser();
    }

    @Test
    public void opensWhatsApp() {
        ActionRequest request = parser.parse("Öffne WhatsApp");
        assertEquals(ActionType.OPEN_WHATSAPP, request.getActionType());
        assertEquals("whatsapp", request.getTargetApp());
    }

    @Test
    public void startsOutlook() {
        ActionRequest request = parser.parse("Starte Outlook");
        assertEquals(ActionType.OPEN_APP, request.getActionType());
        assertEquals("outlook", request.getTargetApp());
    }

    @Test
    public void opensSmartWeWithoutGuessingPackage() {
        ActionRequest request = parser.parse("Öffne SmartWe");
        assertEquals(ActionType.OPEN_APP, request.getActionType());
        assertEquals("smartwe", request.getTargetApp());
    }

    @Test
    public void opensChrome() {
        ActionRequest request = parser.parse("Öffne Chrome");
        assertEquals(ActionType.OPEN_APP, request.getActionType());
        assertEquals("chrome", request.getTargetApp());
    }

    @Test
    public void searchesInternet() {
        ActionRequest request = parser.parse(
            "Suche im Internet nach Golf-News"
        );
        assertEquals(ActionType.WEB_SEARCH, request.getActionType());
        assertEquals("Golf-News", request.getParameter("query"));
    }

    @Test
    public void opensCamera() {
        ActionRequest request = parser.parse("Öffne die Kamera");
        assertEquals(ActionType.OPEN_CAMERA, request.getActionType());
    }

    @Test
    public void capturesPhoto() {
        ActionRequest request = parser.parse("Mache ein Foto");
        assertEquals(ActionType.CAPTURE_PHOTO, request.getActionType());
        assertEquals(RiskLevel.MEDIUM, request.getRiskLevel());
    }

    @Test
    public void rejectsUnknownCommand() {
        ActionRequest request = parser.parse("Bestelle mir ein neues Handy");
        assertEquals(ActionType.UNKNOWN_COMMAND, request.getActionType());
    }

    @Test
    public void preparesEmailDraft() {
        ActionRequest request = parser.parse(
            "Schreibe eine E-Mail an test@example.com mit Betreff Termin " +
            "und Text Ich melde mich morgen."
        );
        assertEquals(ActionType.COMPOSE_EMAIL, request.getActionType());
        assertEquals("test@example.com", request.getParameter("recipient"));
        assertEquals("Termin", request.getParameter("subject"));
        assertEquals(
            "Ich melde mich morgen.",
            request.getParameter("body")
        );
    }

    @Test
    public void preparesWhatsAppTextWithoutSending() {
        ActionRequest request = parser.parse(
            "Schreibe über WhatsApp: Ich komme später."
        );
        assertEquals(
            ActionType.PREPARE_WHATSAPP_MESSAGE,
            request.getActionType()
        );
        assertEquals(
            "Ich komme später.",
            request.getParameter("text")
        );
    }

    @Test
    public void doesNotAcceptUnsafeUrlScheme() {
        ActionRequest request = parser.parse("Öffne javascript:alert(1)");
        assertEquals(ActionType.UNKNOWN_COMMAND, request.getActionType());
    }
}
