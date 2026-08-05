# Ozayra FCM Production Setup

This app now uses:

- `@react-native-firebase/app`
- `@react-native-firebase/messaging`
- `@notifee/react-native`
- `react-native-webview`

## Flow

1. Android app starts and requests notification permission on Android 13+.
2. App creates a high-importance notification channel.
3. App gets the FCM token from Firebase Messaging.
4. App injects the token context into the WebView as browser events.
5. Website sends authenticated user state back to React Native with `window.ReactNativeWebView.postMessage(...)`.
6. React Native saves the token to the backend with the user's auth token.
7. Foreground messages are displayed with Notifee.
8. Background data-only messages are displayed with Notifee.
9. Notification clicks reopen the app and dispatch `OPEN_ORDER_POPUP`.

## WebView Listener Example

Add this to the website so the browser side can receive the token and send login state back to the native app.

```html
<script>
  (function () {
    function postToNative(type, payload) {
      if (!window.ReactNativeWebView || !window.ReactNativeWebView.postMessage) {
        return;
      }

      window.ReactNativeWebView.postMessage(JSON.stringify({
        source: "ozayra-native",
        type: type,
        payload: payload || {}
      }));
    }

    window.addEventListener("OZAYRA_NATIVE_BRIDGE_READY", function () {
      postToNative("REQUEST_PUSH_CONTEXT", { source: "bridge-ready" });
    });

    window.addEventListener("OZAYRA_FCM_CONTEXT", function (event) {
      var pushContext = event.detail;
      window.__OZAYRA_PUSH_CONTEXT__ = pushContext;
      console.log("Received push context", pushContext);
    });

    window.addEventListener("OPEN_ORDER_POPUP", function (event) {
      var detail = event.detail || {};
      console.log("Open order popup", detail);

      if (detail.orderId) {
        window.dispatchEvent(new CustomEvent("OPEN_ORDER_MODAL", {
          detail: { orderId: detail.orderId }
        }));
        return;
      }

      if (detail.url) {
        window.location.href = detail.url;
      }
    });

    window.notifyNativeAuthState = function notifyNativeAuthState(authState) {
      postToNative("AUTH_STATE", {
        authenticated: true,
        authToken: authState.token,
        userId: authState.user.id,
        appType: authState.user.role
      });
    };

    window.notifyNativeLogout = function notifyNativeLogout() {
      postToNative("LOGOUT", {});
    };
  })();
</script>
```

Call `window.notifyNativeAuthState(...)` right after login and again on page reload if the user is already logged in.

## Backend API Example

Example Express route for `POST /api/v1/fcm-tokens/save`

```js
import express from "express";
import jwt from "jsonwebtoken";
import FcmToken from "../models/FcmToken.js";

const router = express.Router();

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Authentication token missing",
    });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid authentication token",
    });
  }
}

router.post("/api/v1/fcm-tokens/save", authMiddleware, async (req, res) => {
  const { token, platform, appVersion, appType, userId } = req.body;

  if (!token) {
    return res.status(422).json({
      success: false,
      message: "FCM token is required",
    });
  }

  const document = await FcmToken.findOneAndUpdate(
    {
      token,
      userId: userId || req.user.id,
      appType: appType || req.user.role,
    },
    {
      token,
      platform,
      appVersion,
      appType: appType || req.user.role,
      userId: userId || req.user.id,
      lastSeenAt: new Date(),
      isActive: true,
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }
  );

  return res.json({
    success: true,
    message: "FCM token saved",
    data: document,
  });
});

export default router;
```

## Suggested Mongo Schema

```js
import mongoose from "mongoose";

const fcmTokenSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    appType: {
      type: String,
      enum: ["customer", "restaurant", "delivery_partner"],
      required: true,
      index: true,
    },
    token: { type: String, required: true, unique: true },
    platform: { type: String, default: "android" },
    appVersion: { type: String, default: "1.0.0" },
    isActive: { type: Boolean, default: true },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model("FcmToken", fcmTokenSchema);
```

## Notification Payload Example

Use data payloads for best background handling consistency:

```json
{
  "to": "<fcm-token>",
  "priority": "high",
  "data": {
    "title": "New Order Assigned",
    "body": "Order #7842 is ready to review",
    "orderId": "7842",
    "appType": "delivery_partner",
    "url": "https://ozayra.com/orders/7842",
    "sound": "default"
  }
}
```

## Production Notes

- Keep backend token storage as an upsert to avoid duplicate token rows.
- Always send auth state from the website after login and after page refresh.
- Prefer FCM data payloads instead of mixed notification payloads for custom handling.
- Add custom sounds later by placing audio files in `android/app/src/main/res/raw/` and sending the raw resource name in `sound`.
- If you support logout, call `notifyNativeLogout()` from the website.
