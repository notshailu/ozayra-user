import { PermissionsAndroid, Platform } from "react-native";
import notifee, {
  AndroidImportance,
  EventType,
} from "@notifee/react-native";
import { getApp } from "@react-native-firebase/app";
import {
  getInitialNotification,
  getMessaging,
  getToken,
  onMessage,
  onNotificationOpenedApp,
  onTokenRefresh,
  registerDeviceForRemoteMessages,
  setAutoInitEnabled,
} from "@react-native-firebase/messaging";

import {
  CHANNEL_ID,
  CHANNEL_NAME,
  extractNotificationPayload,
  extractOrderOpenPayload,
  FCM_SAVE_URL,
  FCM_REMOVE_URL,
} from "./firebaseConfig";

const messaging = getMessaging(getApp());

export async function ensureNotificationChannel() {
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: CHANNEL_NAME,
    importance: AndroidImportance.HIGH,
    vibration: true,
    sound: "default",
  });
  
  await notifee.createChannel({
    id: "default",
    name: "Default Notifications",
    importance: AndroidImportance.HIGH,
    vibration: true,
    sound: "default",
  });
}

export async function requestNotificationPermission() {
  if (Platform.OS !== "android") {
    return true;
  }

  if (Platform.Version < 33) {
    return true;
  }

  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
  );

  return result === PermissionsAndroid.RESULTS.GRANTED;
}

export async function initializePushNotifications() {
  await ensureNotificationChannel();
  await setAutoInitEnabled(messaging, true);
  await registerDeviceForRemoteMessages(messaging);

  const granted = await requestNotificationPermission();
  if (!granted) {
    return { permissionGranted: false, token: null };
  }

  const token = await getToken(messaging);
  return {
    permissionGranted: true,
    token,
  };
}

export async function displayForegroundNotification(payload) {
  if (!payload?.body) {
    return;
  }

  await ensureNotificationChannel();
  await notifee.displayNotification({
    title: payload.title,
    body: payload.body,
    data: {
      orderId: payload.orderId || "",
      url: payload.url || "",
      appType: payload.appType || "",
      source: payload.source || "foreground-message",
    },
    android: {
      channelId: payload.channelId || CHANNEL_ID,
      importance: AndroidImportance.HIGH,
      smallIcon: "ic_launcher",
      pressAction: {
        id: "default",
        launchActivity: "default",
      },
      sound: payload.sound || "default",
    },
  });
}

export async function handleBackgroundMessage(remoteMessage) {
  const payload = extractNotificationPayload(remoteMessage);

  if (remoteMessage?.notification) {
    return;
  }

  await displayForegroundNotification(payload);
}

export async function handleBackgroundNotifeeEvent({ type, detail }) {
  if (type === EventType.PRESS || type === EventType.ACTION_PRESS) {
    console.log("[FCM] Background notification press", detail?.notification?.data);
  }
}

export async function getInitialNotificationOpen() {
  const notifeeInitial = await notifee.getInitialNotification();
  if (notifeeInitial?.notification?.data) {
    return extractOrderOpenPayload({
      ...notifeeInitial.notification.data,
      source: "notifee-initial-notification",
    });
  }

  const firebaseInitial = await getInitialNotification(messaging);
  if (firebaseInitial) {
    return extractOrderOpenPayload({
      ...extractNotificationPayload(firebaseInitial),
      source: "firebase-initial-notification",
    });
  }

  return null;
}

export function registerPushRuntimeHandlers({
  onToken,
  onNotificationOpen,
}) {
  const unsubscribeOnMessage = onMessage(messaging, async (remoteMessage) => {
    const payload = extractNotificationPayload(remoteMessage);
    await displayForegroundNotification(payload);
  });

  const unsubscribeTokenRefresh = onTokenRefresh(messaging, async (token) => {
    await onToken?.(token);
  });

  const unsubscribeNotificationOpened = onNotificationOpenedApp(
    messaging,
    async (remoteMessage) => {
      onNotificationOpen?.({
        ...extractNotificationPayload(remoteMessage),
        source: "firebase-on-notification-opened",
      });
    }
  );

  const unsubscribeNotifeeForeground = notifee.onForegroundEvent(
    ({ type, detail }) => {
      if (
        type === EventType.PRESS ||
        type === EventType.ACTION_PRESS
      ) {
        onNotificationOpen?.({
          ...detail.notification?.data,
          source: "notifee-foreground-press",
        });
      }
    }
  );

  return () => {
    unsubscribeOnMessage();
    unsubscribeTokenRefresh();
    unsubscribeNotificationOpened();
    unsubscribeNotifeeForeground();
  };
}

export async function syncFcmTokenToBackend({ authToken, body }) {
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const response = await fetch(FCM_SAVE_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const responseText = await response.text();
  let parsedBody = responseText;

  try {
    parsedBody = JSON.parse(responseText);
  } catch (_error) {
  }

  if (!response.ok) {
    const error = new Error(
      `FCM backend sync failed with status ${response.status}`
    );
    error.status = response.status;
    error.body = parsedBody;
    throw error;
  }

  return {
    ok: response.ok,
    status: response.status,
    body: parsedBody,
  };
}

export async function removeFcmTokenFromBackend({ authToken, body }) {
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const response = await fetch(FCM_REMOVE_URL, {
    method: "DELETE",
    headers,
    body: JSON.stringify(body),
  });

  const responseText = await response.text();
  let parsedBody = responseText;

  try {
    parsedBody = JSON.parse(responseText);
  } catch (_error) {}

  return {
    ok: response.ok,
    status: response.status,
    body: parsedBody,
  };
}

