import { Browser } from "@capacitor/browser";
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
