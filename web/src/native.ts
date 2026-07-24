import { Browser } from "@capacitor/browser";
import { Camera } from "@capacitor/camera";
import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";

const JARVIS_URL = "https://jarvis-production-5588.up.railway.app/";

export function isNativeApp() {
  return Capacitor.isNativePlatform();
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
