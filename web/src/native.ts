import { AppLauncher } from "@capacitor/app-launcher";
import { Browser } from "@capacitor/browser";
import { Camera } from "@capacitor/camera";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { Share } from "@capacitor/share";
import { Geolocation } from "@capacitor/geolocation";

const JARVIS_URL = "https://jarvis-production-5588.up.railway.app/";

type ContactPickerResult = {
  cancelled: boolean;
  name?: string;
  phone?: string;
};

type ContactPickerPlugin = {
  pickPhoneContact(): Promise<ContactPickerResult>;
};

const ContactPicker = registerPlugin<ContactPickerPlugin>("ContactPicker");

export type CalendarEventDraft = {
  title: string;
  startTime: number;
  endTime: number;
  location?: string;
  description?: string;
};

type CalendarIntentPlugin = {
  prepareEvent(draft: CalendarEventDraft): Promise<{ opened: boolean }>;
};

const CalendarIntent =
  registerPlugin<CalendarIntentPlugin>("CalendarIntent");

export type PhoneContact = {
  name: string;
  phone: string;
};

export function isNativeApp() {
  return Capacitor.isNativePlatform();
}

export async function openCalendarEventDraft(draft: CalendarEventDraft) {
  if (!Capacitor.isNativePlatform()) {
    throw new Error(
      "Die Kalenderübergabe ist nur in der installierten Android-App verfügbar.",
    );
  }
  if (!draft.title.trim()) {
    throw new Error("Der Termin benötigt einen Titel.");
  }
  if (
    !Number.isFinite(draft.startTime) ||
    !Number.isFinite(draft.endTime) ||
    draft.endTime <= draft.startTime
  ) {
    throw new Error("Die Endzeit muss nach der Startzeit liegen.");
  }

  await CalendarIntent.prepareEvent({
    ...draft,
    title: draft.title.trim(),
    location: draft.location?.trim() || undefined,
    description: draft.description?.trim() || undefined,
  });
}

export async function pickPhoneContact(): Promise<PhoneContact | null> {
  if (!Capacitor.isNativePlatform()) {
    throw new Error(
      "Die Kontaktauswahl ist nur in der installierten Android-App verfügbar.",
    );
  }

  const result = await ContactPicker.pickPhoneContact();
  if (result.cancelled) {
    return null;
  }

  const phone = result.phone?.trim();
  if (!phone) {
    throw new Error("Für den ausgewählten Kontakt wurde keine Telefonnummer gefunden.");
  }

  return {
    name: result.name?.trim() || "Kontakt ohne Namen",
    phone,
  };
}

export async function openWebSearch() {
  await Browser.open({ url: "https://www.google.com/" });
}

export async function openWhatsApp() {
  await Browser.open({ url: "https://wa.me/" });
}

export async function shareJarvis() {
  await Share.share({
    title: "Jarvis",
    text: "Öffne meinen persönlichen Jarvis-Assistenten.",
    url: JARVIS_URL,
    dialogTitle: "Jarvis teilen",
  });
}

export type CapturedPhoto = {
  previewUrl: string;
  format: string;
};

export async function takeCameraPhoto(): Promise<CapturedPhoto> {
  const photo = await Camera.takePhoto({
    quality: 85,
    targetWidth: 1600,
    targetHeight: 1600,
    includeMetadata: true,
    saveToGallery: false,
  });
  const format = photo.metadata?.format ?? "jpeg";
  const previewUrl =
    photo.webPath ??
    (photo.thumbnail
      ? `data:image/${format};base64,${photo.thumbnail}`
      : undefined);
  if (!previewUrl) {
    throw new Error("Die Kamera hat keine Vorschau zurückgegeben.");
  }
  return { previewUrl, format };
}

export type CurrentLocation = {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
};

export async function getCurrentLocation(): Promise<CurrentLocation> {
  if (Capacitor.isNativePlatform()) {
    let permission = await Geolocation.checkPermissions();
    if (
      permission.coarseLocation === "prompt" ||
      permission.coarseLocation === "prompt-with-rationale"
    ) {
      permission = await Geolocation.requestPermissions({
        permissions: ["coarseLocation"],
      });
    }
    if (permission.coarseLocation !== "granted") {
      throw new Error(
        "Der Standort wurde nicht freigegeben. Erlaube ungefähren Standort in den App-Einstellungen.",
      );
    }
  }

  const position = await Geolocation.getCurrentPosition({
    enableHighAccuracy: false,
    timeout: 15_000,
    maximumAge: 30_000,
  });
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
    timestamp: position.timestamp,
  };
}

export async function openLocationInMaps(location: CurrentLocation) {
  const query = `${location.latitude},${location.longitude}`;
  if (Capacitor.isNativePlatform()) {
    try {
      await AppLauncher.openUrl({
        url: `geo:${query}?q=${query}`,
      });
      return;
    } catch {
      // Fällt auf eine HTTPS-Kartenansicht zurück.
    }
  }
  await Browser.open({
    url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`,
  });
}
