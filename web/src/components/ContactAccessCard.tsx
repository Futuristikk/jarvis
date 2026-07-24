import { useState } from "react";
import {
  isNativeApp,
  pickPhoneContact,
  type PhoneContact,
} from "../native";

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Der Kontakt konnte nicht ausgewählt werden.";
}

export function ContactAccessCard() {
  const [contact, setContact] = useState<PhoneContact | null>(null);
  const [isPicking, setIsPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function chooseContact() {
    setError(null);
    setIsPicking(true);
    try {
      const selected = await pickPhoneContact();
      if (selected) {
        setContact(selected);
      }
    } catch (selectionError) {
      setError(getErrorMessage(selectionError));
    } finally {
      setIsPicking(false);
    }
  }

  return (
    <section className="surface-card">
      <strong>Kontakt auswählen</strong>
      <p>
        Jarvis liest nie dein gesamtes Adressbuch. Erst nach deinem Antippen
        öffnet Android den Systempicker; nur der von dir ausgewählte Name und
        die Telefonnummer werden vorübergehend in dieser Ansicht angezeigt.
      </p>

      <button
        className="contact-primary"
        type="button"
        onClick={() => void chooseContact()}
        disabled={isPicking}
      >
        {isPicking ? "Kontakte werden geöffnet …" : "Telefonkontakt auswählen"}
      </button>

      {!isNativeApp() && (
        <p className="surface-error">
          Diese Funktion ist in der installierten Android-App verfügbar.
        </p>
      )}
      {error && <p className="surface-error">{error}</p>}

      {contact && (
        <div className="contact-result" aria-live="polite">
          <strong>{contact.name}</strong>
          <span>{contact.phone}</span>
          <button type="button" onClick={() => setContact(null)}>
            Auswahl verwerfen
          </button>
        </div>
      )}
    </section>
  );
}
