import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { isNativeApp, takeCameraPhoto } from "../native";

type SelectedFile = {
  name: string;
  type: string;
  size: number;
};

export function DeviceAccessCard() {
  const cameraInput = useRef<HTMLInputElement>(null);
  const documentInput = useRef<HTMLInputElement>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoIsObjectUrl, setPhotoIsObjectUrl] = useState(false);
  const [file, setFile] = useState<SelectedFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (photoUrl && photoIsObjectUrl) URL.revokeObjectURL(photoUrl);
    },
    [photoIsObjectUrl, photoUrl],
  );

  async function openCamera() {
    setMessage(null);
    if (!isNativeApp()) {
      cameraInput.current?.click();
      return;
    }
    setBusy(true);
    try {
      const photo = await takeCameraPhoto();
      replacePhoto(photo.previewUrl, false);
    } catch {
      setMessage("Die Aufnahme wurde abgebrochen oder konnte nicht geöffnet werden.");
    } finally {
      setBusy(false);
    }
  }

  function selectPhoto(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    if (!selected) return;
    replacePhoto(URL.createObjectURL(selected), true);
    event.target.value = "";
  }

  function selectDocument(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    if (!selected) return;
    setFile({
      name: selected.name,
      type: selected.type || "Unbekannter Dateityp",
      size: selected.size,
    });
    setMessage(null);
    event.target.value = "";
  }

  function replacePhoto(url: string, isObjectUrl: boolean) {
    if (photoUrl && photoIsObjectUrl) URL.revokeObjectURL(photoUrl);
    setPhotoUrl(url);
    setPhotoIsObjectUrl(isObjectUrl);
    setMessage(null);
  }

  function clearPhoto() {
    if (photoUrl && photoIsObjectUrl) URL.revokeObjectURL(photoUrl);
    setPhotoUrl(null);
    setPhotoIsObjectUrl(false);
  }

  return (
    <section className="surface-card device-access">
      <strong>Kamera und Dateien</strong>
      <p>
        Jarvis öffnet Kamera oder Systempicker nur nach deinem Antippen. Die
        Auswahl bleibt lokal und wird nicht automatisch hochgeladen.
      </p>
      <div className="device-actions">
        <button onClick={() => void openCamera()} disabled={busy}>
          {busy ? "Kamera wird geöffnet…" : "Foto aufnehmen"}
        </button>
        <button onClick={() => documentInput.current?.click()}>
          Dokument auswählen
        </button>
      </div>

      <input
        ref={cameraInput}
        className="visually-hidden"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={selectPhoto}
        tabIndex={-1}
      />
      <input
        ref={documentInput}
        className="visually-hidden"
        type="file"
        accept=".pdf,.txt,.md,.doc,.docx,.odt,image/*"
        onChange={selectDocument}
        tabIndex={-1}
      />

      {photoUrl && (
        <div className="device-selection">
          <img src={photoUrl} alt="Lokale Kameravorschau" />
          <div>
            <strong>Foto lokal ausgewählt</strong>
            <button onClick={clearPhoto}>Vorschau verwerfen</button>
          </div>
        </div>
      )}

      {file && (
        <div className="device-selection">
          <div>
            <strong>{file.name}</strong>
            <p>
              {file.type} · {formatBytes(file.size)}
            </p>
            <button onClick={() => setFile(null)}>Auswahl verwerfen</button>
          </div>
        </div>
      )}
      {message && <p className="surface-error">{message}</p>}
    </section>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
