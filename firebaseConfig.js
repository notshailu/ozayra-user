import { Platform } from "react-native";

export const APP_URL = "https://ozayra.com";
export const APP_SCHEME = "ozayra";
export const FCM_SAVE_URL = `${APP_URL}/api/v1/fcm-tokens/save`;
export const FCM_REMOVE_URL = `${APP_URL}/api/v1/fcm-tokens/remove`;
export const BRIDGE_SOURCE = "ozayra-native";
export const CHANNEL_ID = "ozayra_orders_high";
export const CHANNEL_NAME = "Ozayra Orders";
export const APP_TYPES = {
  CUSTOMER: "customer",
  RESTAURANT: "restaurant",
  DELIVERY_PARTNER: "delivery_partner",
};

export const USER_NOTIFICATION_ROUTES = {
  order_confirmation: "/user/orders/:orderId",
  order_status_update: "/user/orders/:orderId",
  order_delivered: "/user/orders/:orderId",
  order_cancelled: "/user/orders/:orderId",
  payment_confirmation: "/user/orders/:orderId/invoice",
  promotional_offers: "/user/offers",
  refund_processed: "/user/orders/:orderId",
  wallet_transaction: "/user/wallet",
  delivery_accepted: "/user/orders",
  broadcast: "/user/notifications",
};

const CUSTOMER_ROUTE_PREFIXES = [
  "/",
  "/user",
  "/offers",
  "/wallet",
  "/notifications",
];

export const EVENTS = {
  BRIDGE_READY: "OZAYRA_NATIVE_BRIDGE_READY",
  PUSH_CONTEXT: "OZAYRA_FCM_CONTEXT",
  LEGACY_PUSH_CONTEXT: "ozayra:fcm-context",
  LEGACY_FCM_TOKEN: "ozayra:fcm-token",
  TOKEN_SYNCED: "OZAYRA_FCM_SYNCED",
  LOCATION_UPDATE: "OZAYRA_LOCATION_UPDATE",
  LOCATION_ERROR: "OZAYRA_LOCATION_ERROR",
  OPEN_ORDER_POPUP: "OPEN_ORDER_POPUP",
  NOTIFICATION_OPEN: "OZAYRA_NOTIFICATION_OPEN",
};

export function getAppVersion(constants) {
  return (
    constants?.expoConfig?.version ||
    constants?.manifest2?.extra?.expoClient?.version ||
    constants?.nativeAppVersion ||
    "1.0.0"
  );
}

export function buildPushContext({
  token,
  appVersion,
  appType,
  userId,
}) {
  return {
    token,
    platform: "mobile",
    os: Platform.OS,
    appVersion,
    appType: appType || null,
    userId: userId || null,
  };
}

export function buildOrderUrl(orderId) {
  if (!orderId) {
    return `${APP_URL}/user/orders`;
  }

  return `${APP_URL}/user/orders/${encodeURIComponent(orderId)}`;
}

export function normalizeAppRoute(route) {
  if (!route) {
    return "/user/notifications";
  }

  const normalizedRoute = String(route).trim().replace(/^\/food(?=\/|$)/, "");
  return normalizedRoute || "/user/notifications";
}

export function isCustomerAppRoute(route) {
  if (!route) {
    return false;
  }

  const normalizedRoute = String(route).trim();
  return CUSTOMER_ROUTE_PREFIXES.some((prefix) => {
    if (prefix === "/") {
      return normalizedRoute === "/";
    }

    return (
      normalizedRoute === prefix ||
      normalizedRoute.startsWith(`${prefix}/`) ||
      normalizedRoute.startsWith(`${prefix}?`) ||
      normalizedRoute.startsWith(`${prefix}#`)
    );
  });
}

export function buildAppUrlFromRoute(route) {
  const normalizedRoute = normalizeAppRoute(route);

  try {
    return new URL(normalizedRoute, APP_URL).toString();
  } catch (_error) {
    return `${APP_URL}/user/notifications`;
  }
}

export function getUserNotificationRoute(notification) {
  const type = String(
    notification?.type ||
      notification?.category ||
      notification?.data?.type ||
      notification?.data?.category ||
      ""
  ).toLowerCase();

  const orderId =
    notification?.orderId ||
    notification?.orderMongoId ||
    notification?.order_id ||
    notification?.data?.orderId ||
    notification?.data?.orderMongoId ||
    notification?.data?.order_id ||
    null;

  switch (type) {
    case "order_confirmation":
    case "order_created":
    case "order_created_pending_payment":
    case "order_status_update":
    case "order_delivered":
    case "order_cancelled":
      return orderId ? `/user/orders/${orderId}` : "/user/orders";

    case "payment_confirmation":
      return orderId ? `/user/orders/${orderId}/invoice` : "/user/orders";

    case "refund_processed":
      return orderId ? `/user/orders/${orderId}` : "/user/profile/refund";

    case "wallet_transaction":
      return "/user/wallet";

    case "promotional_offers":
      return "/user/offers";

    case "delivery_accepted":
      return "/user/orders";

    case "broadcast":
    default:
      return (
        notification?.link ||
        notification?.url ||
        notification?.deepLink ||
        notification?.data?.link ||
        notification?.data?.url ||
        notification?.data?.deepLink ||
        "/user/notifications"
      );
  }
}

export function isExpoDevelopmentUrl(url) {
  return typeof url === "string" && url.includes("expo-development-client");
}

export function normalizeIncomingUrl(url) {
  if (!url || isExpoDevelopmentUrl(url)) {
    return null;
  }

  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:") {
      const normalizedPath = parsedUrl.pathname || "/";
      if (!isCustomerAppRoute(normalizedPath)) {
        return null;
      }

      return parsedUrl.toString();
    }

    if (parsedUrl.protocol !== `${APP_SCHEME}:`) {
      return null;
    }

    const path = `${parsedUrl.hostname}${parsedUrl.pathname}`.replace(/^\/+/, "");
    const normalizedPath = path ? `/${path}` : "";
    const normalizedQuery = parsedUrl.search || "";
    const normalizedHash = parsedUrl.hash || "";

    if (!isCustomerAppRoute(normalizedPath || "/")) {
      return null;
    }

    return `${APP_URL}${normalizedPath}${normalizedQuery}${normalizedHash}`;
  } catch (_error) {
    return null;
  }
}

export function isWebViewAllowedUrl(url) {
  if (!url) {
    return false;
  }

  if (url === "about:blank") {
    return true;
  }

  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:";
  } catch (_error) {
    return false;
  }
}

export function extractNotificationPayload(remoteMessage) {
  const data = remoteMessage?.data || {};
  const notification = remoteMessage?.notification || {};
  const orderId = data.orderId || data.order_id || null;
  const resolvedRoute = getUserNotificationRoute({
    ...data,
    data,
  });
  const url = buildAppUrlFromRoute(resolvedRoute || buildOrderUrl(orderId));
  const appType =
    data.appType || data.userType || data.targetApp || APP_TYPES.CUSTOMER;

  return {
    title: notification.title || data.title || "Ozayra",
    body: notification.body || data.body || "",
    orderId,
    url,
    type: data.type || data.category || null,
    sound: data.sound || "default",
    channelId: data.channelId || CHANNEL_ID,
    appType,
    source: data.source || "fcm",
    rawData: data,
  };
}

export function extractOrderOpenPayload(payload) {
  if (!payload) {
    return null;
  }

  const orderId =
    payload.orderId ||
    payload.order_id ||
    payload?.data?.orderId ||
    payload?.data?.order_id ||
    null;

  const resolvedRoute = getUserNotificationRoute(payload);
  const rawUrl =
    payload.url ||
    payload.deepLink ||
    payload.link ||
    payload?.data?.url ||
    payload?.data?.deepLink ||
    payload?.data?.link ||
    resolvedRoute ||
    (orderId ? buildOrderUrl(orderId) : "/user/notifications");
  const url = normalizeIncomingUrl(rawUrl);

  if (!url) {
    return null;
  }

  return {
    orderId,
    url: buildAppUrlFromRoute(url),
    route: normalizeAppRoute(resolvedRoute),
    type:
      payload.type ||
      payload.category ||
      payload?.data?.type ||
      payload?.data?.category ||
      null,
    source: payload.source || "notification-open",
    appType:
      payload.appType ||
      payload.userType ||
      payload?.data?.appType ||
      payload?.data?.userType ||
      null,
  };
}

export function buildSyncSignature(value) {
  return JSON.stringify(value);
}

export function stringifyForInjection(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
