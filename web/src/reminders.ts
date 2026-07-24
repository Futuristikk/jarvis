import { LocalNotifications } from "@capacitor/local-notifications";
import { Capacitor } from "@capacitor/core";

const STORAGE_KEY = "jarvis.local-reminders.v1";
const CHANNEL_ID = "jarvis-reminders";
const timers = new Map<number, number>();

export type LocalReminder = {
  id: number;
  title: string;
  at: string;
  createdAt: string;
};

export class ReminderPermissionError extends Error {}

export function loadReminders(): LocalReminder[] {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value
      .filter(isReminder)
      .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  } catch {
    return [];
  }
}

export function restoreWebReminders() {
  if (Capacitor.isNativePlatform()) return;
  for (const reminder of loadReminders()) scheduleWebTimer(reminder);
}

export async function createReminder(title: string, at: Date) {
  const cleanTitle = title.trim();
  if (!cleanTitle) throw new Error("Bitte gib einen Titel ein.");
  if (!Number.isFinite(at.getTime()) || at.getTime() <= Date.now()) {
    throw new Error("Wähle einen Zeitpunkt in der Zukunft.");
  }

  const reminder: LocalReminder = {
    id: createId(),
    title: cleanTitle,
    at: at.toISOString(),
    createdAt: new Date().toISOString(),
  };

  if (Capacitor.isNativePlatform()) {
    let permission = await LocalNotifications.checkPermissions();
    if (permission.display === "prompt") {
      permission = await LocalNotifications.requestPermissions();
    }
    if (permission.display !== "granted") {
      throw new ReminderPermissionError(
        "Benachrichtigungen sind deaktiviert. Erlaube sie in den Android-App-Einstellungen.",
      );
    }

    await LocalNotifications.createChannel({
      id: CHANNEL_ID,
      name: "Jarvis Erinnerungen",
      description: "Von dir angelegte lokale Erinnerungen",
      importance: 4,
      visibility: 1,
    });
    await LocalNotifications.schedule({
      notifications: [
        {
          id: reminder.id,
          title: "Jarvis-Erinnerung",
          body: reminder.title,
          schedule: { at },
          channelId: CHANNEL_ID,
          autoCancel: true,
          extra: { reminderId: reminder.id },
        },
      ],
    });
  } else {
    const permission = await requestBrowserNotificationPermission();
    if (permission !== "granted") {
      throw new ReminderPermissionError(
        "Benachrichtigungen wurden im Browser nicht erlaubt.",
      );
    }
    scheduleWebTimer(reminder);
  }

  const reminders = [...loadReminders(), reminder];
  saveReminders(reminders);
  return reminder;
}

export async function removeReminder(id: number) {
  if (Capacitor.isNativePlatform()) {
    await LocalNotifications.cancel({ notifications: [{ id }] });
  } else {
    const timer = timers.get(id);
    if (timer !== undefined) window.clearTimeout(timer);
    timers.delete(id);
  }
  saveReminders(loadReminders().filter((reminder) => reminder.id !== id));
}

function saveReminders(reminders: LocalReminder[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(reminders));
}

function scheduleWebTimer(reminder: LocalReminder) {
  const delay = new Date(reminder.at).getTime() - Date.now();
  if (delay <= 0 || delay > 2_147_000_000) return;
  const existing = timers.get(reminder.id);
  if (existing !== undefined) window.clearTimeout(existing);
  timers.set(
    reminder.id,
    window.setTimeout(() => {
      void showBrowserNotification(reminder);
      timers.delete(reminder.id);
    }, delay),
  );
}

async function showBrowserNotification(reminder: LocalReminder) {
  const registration = await navigator.serviceWorker?.getRegistration();
  if (registration) {
    await registration.showNotification("Jarvis-Erinnerung", {
      body: reminder.title,
      tag: String(reminder.id),
    });
    return;
  }
  new Notification("Jarvis-Erinnerung", { body: reminder.title });
}

async function requestBrowserNotificationPermission() {
  if (!("Notification" in window)) return "denied";
  if (Notification.permission !== "default") return Notification.permission;
  return Notification.requestPermission();
}

function createId() {
  const timestamp = Date.now() % 2_000_000_000;
  let id = timestamp;
  const used = new Set(loadReminders().map((reminder) => reminder.id));
  while (used.has(id)) id = (id + 1) % 2_000_000_000;
  return id;
}

function isReminder(value: unknown): value is LocalReminder {
  if (!value || typeof value !== "object") return false;
  const reminder = value as Partial<LocalReminder>;
  return (
    typeof reminder.id === "number" &&
    typeof reminder.title === "string" &&
    typeof reminder.at === "string" &&
    typeof reminder.createdAt === "string"
  );
}
