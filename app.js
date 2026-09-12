import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  AppState,
  BackHandler,
  Image,
  Linking,
  PermissionsAndroid,
  Platform,
  Share,
  StatusBar,
  View,
  Text,
  TouchableOpacity,
} from "react-native";
import { useNetInfo } from "@react-native-community/netinfo";
import * as NavigationBar from "expo-navigation-bar";
import Constants from "expo-constants";
import * as Location from "expo-location";
import * as SplashScreen from "expo-splash-screen";
import { WebView } from "react-native-webview";

import {
  APP_TYPES,
  APP_URL,
  BRIDGE_SOURCE,
  EVENTS,
  FCM_SAVE_URL,
  buildOrderUrl,
  buildPushContext,
  buildSyncSignature,
  extractOrderOpenPayload,
  getAppVersion,
  isExpoDevelopmentUrl,
  isWebViewAllowedUrl,
  stringifyForInjection,
} from "./firebaseConfig";
import {
  getInitialNotificationOpen,
  initializePushNotifications,
  registerPushRuntimeHandlers,
  syncFcmTokenToBackend,
  removeFcmTokenFromBackend,
} from "./pushNotifications";

const APP_VERSION = getAppVersion(Constants);
const DEBUG_NATIVE_LOGS = typeof __DEV__ !== "undefined" && __DEV__;

SplashScreen.preventAutoHideAsync().catch(() => {});

const noWhitePatchRoutes = ["/", "/login", "/under-250"];
const nonCustomerRoutePrefixes = [
  "/restaurant",
  "/delivery",
  "/delivery-partner",
  "/partner",
  "/vendor",
  "/admin",
];

function getPathnameFromUrl(url) {
  try {
    return new URL(url || APP_URL).pathname;
  } catch {
    return "/";
  }
}

function normalizePathname(pathname) {
  return (pathname || "/").replace(/\/+$/, "") || "/";
}

function isDiningRestaurantPage(pathname) {
  const parts = normalizePathname(pathname).split("/").filter(Boolean);

  return parts.length === 4 && parts[0] === "user" && parts[1] === "dining";
}

function shouldShowWhitePatch(pathname) {
  return false;
}

function matchesPathPrefix(pathname, prefix) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function isNonCustomerPath(pathname) {
  const normalizedPathname = normalizePathname(pathname);

  return nonCustomerRoutePrefixes.some((prefix) =>
    matchesPathPrefix(normalizedPathname, prefix)
  );
}

const injectedJavaScriptBeforeContentLoaded = `
  (function() {
    if (window.__OZAYRA_NATIVE_BRIDGE_READY__) {
      return true;
    }

    function postToApp(type, payload) {
      if (!window.ReactNativeWebView || !window.ReactNativeWebView.postMessage) {
        return;
      }

      window.ReactNativeWebView.postMessage(JSON.stringify({
        source: ${JSON.stringify(BRIDGE_SOURCE)},
        type: type,
        payload: payload || {}
      }));
    }

    function injectScrollbarStyles() {
      if (document.getElementById("ozayra-scrollbar-style")) {
        return;
      }

      var style = document.createElement("style");
      style.id = "ozayra-scrollbar-style";
      style.textContent =
        "html, body {" +
        "scrollbar-width: none !important;" +
        "-ms-overflow-style: none !important;" +
        "}" +
        "html::-webkit-scrollbar," +
        "body::-webkit-scrollbar," +
        "*::-webkit-scrollbar {" +
        "width: 0 !important;" +
        "height: 0 !important;" +
        "display: none !important;" +
        "background: transparent !important;" +
        "}";

      document.head.appendChild(style);
    }

    function shouldApplyBookingTopGap() {
      if (!document.body) {
        return false;
      }

      var pageText = (document.body.innerText || "").toLowerCase();

      return (
        pageText.indexOf("confirm your seat") !== -1 ||
        pageText.indexOf("my table bookings") !== -1 ||
        pageText.indexOf("book a table") !== -1
      );
    }

    function applyBookingTopGap() {
      if (!document.body) {
        return;
      }

      var spacerId = "ozayra-native-top-gap";
      var existingSpacer = document.getElementById(spacerId);
      var shouldApply = shouldApplyBookingTopGap();

      if (!shouldApply) {
        if (existingSpacer && existingSpacer.parentNode) {
          existingSpacer.parentNode.removeChild(existingSpacer);
        }
        return;
      }

      if (!existingSpacer) {
        existingSpacer = document.createElement("div");
        existingSpacer.id = spacerId;
        existingSpacer.setAttribute("aria-hidden", "true");
        existingSpacer.style.width = "100%";
        existingSpacer.style.height = "28px";
        existingSpacer.style.flexShrink = "0";
        existingSpacer.style.pointerEvents = "none";
        existingSpacer.style.background = "transparent";
        document.body.insertBefore(existingSpacer, document.body.firstChild);
      }
    }

    function installBookingTopGapObserver() {
      if (window.__OZAYRA_BOOKING_TOP_GAP_INSTALLED__) {
        applyBookingTopGap();
        return;
      }

      window.__OZAYRA_BOOKING_TOP_GAP_INSTALLED__ = true;
      var bookingGapRaf = null;

      var bookingGapObserver = new MutationObserver(function() {
        if (bookingGapRaf) {
          return;
        }

        bookingGapRaf = window.requestAnimationFrame(function() {
          bookingGapRaf = null;
          applyBookingTopGap();
        });
      });

      bookingGapObserver.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true
      });

      setTimeout(applyBookingTopGap, 0);
      setTimeout(applyBookingTopGap, 500);
      setTimeout(applyBookingTopGap, 1500);
    }

    function notifyRouteChange(source) {
      var pathname =
        window.location && window.location.pathname
          ? window.location.pathname
          : "/";
      var href =
        window.location && window.location.href ? window.location.href : "";
      var signature = pathname + "::" + href;

      if (window.__OZAYRA_LAST_ROUTE_SIGNATURE__ === signature) {
        return;
      }

      window.__OZAYRA_LAST_ROUTE_SIGNATURE__ = signature;

      postToApp("ROUTE_CHANGE", {
        pathname: pathname,
        href: href,
        source: source || "unknown"
      });
    }

    function installRouteChangeTracking() {
      if (window.__OZAYRA_ROUTE_TRACKING_INSTALLED__) {
        notifyRouteChange("route-tracking-already-installed");
        return;
      }

      window.__OZAYRA_ROUTE_TRACKING_INSTALLED__ = true;

      var originalPushState = window.history.pushState;
      var originalReplaceState = window.history.replaceState;

      window.history.pushState = function() {
        var result = originalPushState.apply(this, arguments);
        setTimeout(function() {
          notifyRouteChange("pushState");
        }, 0);
        return result;
      };

      window.history.replaceState = function() {
        var result = originalReplaceState.apply(this, arguments);
        setTimeout(function() {
          notifyRouteChange("replaceState");
        }, 0);
        return result;
      };

      window.addEventListener("popstate", function() {
        notifyRouteChange("popstate");
      });

      window.addEventListener("hashchange", function() {
        notifyRouteChange("hashchange");
      });

      notifyRouteChange("install");
    }

    function readStorageValue(storage, keys) {
      if (!storage) {
        return null;
      }

      for (var i = 0; i < keys.length; i += 1) {
        var key = keys[i];
        try {
          var value = storage.getItem(key);
          if (value && value !== "undefined" && value !== "null") {
            return value;
          }
        } catch (_error) {
        }
      }

      return null;
    }

    function readCookieValue(names) {
      if (!document.cookie) {
        return null;
      }

      var cookies = document.cookie.split(";");
      for (var i = 0; i < cookies.length; i += 1) {
        var parts = cookies[i].split("=");
        var key = parts[0] ? parts[0].trim() : "";
        if (!key) {
          continue;
        }

        for (var j = 0; j < names.length; j += 1) {
          if (key === names[j]) {
            var cookieValue = parts.slice(1).join("=");
            if (cookieValue) {
              return decodeURIComponent(cookieValue);
            }
          }
        }
      }

      return null;
    }

    function maybeParseJson(value) {
      if (!value || typeof value !== "string") {
        return value;
      }

      try {
        return JSON.parse(value);
      } catch (_error) {
        return value;
      }
    }

    function maybeExtractToken(value) {
      if (!value) {
        return null;
      }

      if (typeof value === "string") {
        if (value.indexOf("Bearer ") === 0) {
          return value.slice(7).trim();
        }

        var trimmedValue = value.trim();
        if (!trimmedValue || trimmedValue[0] === "{" || trimmedValue[0] === "[") {
          return null;
        }

        var jwtParts = trimmedValue.split(".");
        if (jwtParts.length === 3 && jwtParts[0] && jwtParts[1] && jwtParts[2]) {
          return trimmedValue;
        }

        if (trimmedValue.indexOf("eyJ") === 0 && trimmedValue.length > 20) {
          return trimmedValue;
        }

        if (trimmedValue.length > 20 && trimmedValue.indexOf(" ") === -1) {
          return value;
        }

        return null;
      }

      if (typeof value === "object") {
        return (
          value.authToken ||
          value.token ||
          value.accessToken ||
          value.access_token ||
          value.jwt ||
          value.jwtToken ||
          (value.data && maybeExtractToken(value.data)) ||
          (value.user && maybeExtractToken(value.user)) ||
          null
        );
      }

      return null;
    }

    function readUserObject() {
      var userKeys = [
        "user",
        "authUser",
        "currentUser",
        "customer",
        "profile",
        "sessionUser"
      ];

      var storedUser =
        readStorageValue(window.localStorage, userKeys) ||
        readStorageValue(window.sessionStorage, userKeys);

      var parsedUser = maybeParseJson(storedUser);
      if (parsedUser && typeof parsedUser === "object") {
        return parsedUser;
      }

      if (window.__OZAYRA_AUTH_STATE__ && window.__OZAYRA_AUTH_STATE__.user) {
        return window.__OZAYRA_AUTH_STATE__.user;
      }

      return null;
    }

    function extractAuthState() {
      if (window.__OZAYRA_AUTH_STATE__ && window.__OZAYRA_AUTH_STATE__.authToken) {
        return window.__OZAYRA_AUTH_STATE__;
      }

      var user = readUserObject();
      var tokenKeys = [
        "authToken",
        "token",
        "accessToken",
        "access_token",
        "jwt",
        "jwtToken",
        "userToken",
        "customerToken"
      ];
      var cookieKeys = [
        "authToken",
        "token",
        "access_token",
        "jwt",
        "jwt_token"
      ];

      var authToken =
        readStorageValue(window.localStorage, tokenKeys) ||
        readStorageValue(window.sessionStorage, tokenKeys) ||
        readCookieValue(cookieKeys) ||
        (user && (
          user.authToken ||
          user.token ||
          user.accessToken ||
          user.access_token ||
          user.jwt ||
          user.jwtToken ||
          (user.auth && (
            user.auth.token ||
            user.auth.accessToken ||
            user.auth.authToken
          )) ||
          (user.session && (
            user.session.token ||
            user.session.accessToken ||
            user.session.authToken
          ))
        ));

      if (!authToken) {
        return null;
      }

      return {
        authenticated: true,
        authToken: authToken,
        userId: user ? (user.id || user._id || user.userId || null) : null,
        appType: user ? (user.role || user.appType || user.userType || null) : null,
      };
    }

    function syncDetectedAuthState() {
      var authState = extractAuthState();
      var signature = authState ? JSON.stringify(authState) : "logged-out";

      if (window.__OZAYRA_LAST_AUTH_SIGNATURE__ === signature) {
        return;
      }

      window.__OZAYRA_LAST_AUTH_SIGNATURE__ = signature;

      if (!authState) {
        postToApp("AUTH_DEBUG", {
          source: "auto-auth-detect",
          localStorageKeys: Object.keys(window.localStorage || {}),
          sessionStorageKeys: Object.keys(window.sessionStorage || {}),
          cookiePresent: !!document.cookie,
          hasUserObject: !!readUserObject()
        });
        postToApp("LOGOUT", { source: "auto-auth-detect" });
        return;
      }

      postToApp("AUTH_DEBUG", {
        source: "auto-auth-detect",
        localStorageKeys: Object.keys(window.localStorage || {}),
        sessionStorageKeys: Object.keys(window.sessionStorage || {}),
        cookiePresent: !!document.cookie,
        hasUserObject: !!readUserObject(),
        authTokenPreview: String(authState.authToken || "").slice(0, 16)
      });
      postToApp("AUTH_STATE", authState);
    }

    function scheduleAuthStateSync(delay) {
      if (window.__OZAYRA_AUTH_SYNC_TIMER__) {
        clearTimeout(window.__OZAYRA_AUTH_SYNC_TIMER__);
      }

      window.__OZAYRA_AUTH_SYNC_TIMER__ = setTimeout(function() {
        window.__OZAYRA_AUTH_SYNC_TIMER__ = null;
        syncDetectedAuthState();
      }, typeof delay === "number" ? delay : 0);
    }

    function storeDetectedAuthState(partialState) {
      if (!partialState) {
        return;
      }

      var existingState = window.__OZAYRA_AUTH_STATE__ || {};
      var mergedUser = partialState.user || existingState.user || null;
      var mergedState = {
        authenticated:
          partialState.authenticated !== undefined
            ? partialState.authenticated
            : existingState.authenticated !== false,
        authToken:
          partialState.authToken ||
          partialState.token ||
          existingState.authToken ||
          existingState.token ||
          null,
        userId:
          partialState.userId ||
          partialState.id ||
          (mergedUser && (mergedUser.id || mergedUser._id || mergedUser.userId)) ||
          existingState.userId ||
          null,
        appType:
          partialState.appType ||
          partialState.userType ||
          (mergedUser && (mergedUser.role || mergedUser.userType || mergedUser.appType)) ||
          existingState.appType ||
          null,
        user: mergedUser
      };

      if (!mergedState.authToken) {
        return;
      }

      window.__OZAYRA_AUTH_STATE__ = mergedState;
      postToApp("AUTH_DEBUG", {
        source: partialState.__source || "token-capture",
        authTokenPreview: String(mergedState.authToken).slice(0, 16),
        userId: mergedState.userId || null,
        appType: mergedState.appType || null
      });
      syncDetectedAuthState();
    }

    function captureTokenCandidate(candidate, source) {
      var token = maybeExtractToken(candidate);
      if (!token) {
        return;
      }

      storeDetectedAuthState({
        authenticated: true,
        authToken: token,
        __source: source
      });
    }

    function installAuthCaptureHooks() {
      var originalFetch = window.fetch;
      if (typeof originalFetch === "function") {
        window.fetch = function(input, init) {
          var requestUrl =
            typeof input === "string"
              ? input
              : input && input.url
                ? input.url
                : "";

          try {
            var headerBag =
              (init && init.headers) ||
              (input && input.headers) ||
              null;

            if (headerBag) {
              if (typeof Headers !== "undefined" && headerBag instanceof Headers) {
                captureTokenCandidate(headerBag.get("Authorization"), "fetch-headers");
              } else if (Array.isArray(headerBag)) {
                for (var i = 0; i < headerBag.length; i += 1) {
                  if (String(headerBag[i][0]).toLowerCase() === "authorization") {
                    captureTokenCandidate(headerBag[i][1], "fetch-headers");
                  }
                }
              } else {
                captureTokenCandidate(
                  headerBag.Authorization || headerBag.authorization,
                  "fetch-headers"
                );
              }
            }
          } catch (_error) {
          }

          return originalFetch.apply(this, arguments).then(function(response) {
            try {
              var lowerUrl = String(requestUrl || "").toLowerCase();
              var shouldInspectResponse =
                !window.__OZAYRA_AUTH_STATE__ &&
                (
                  lowerUrl.indexOf("login") !== -1 ||
                  lowerUrl.indexOf("auth") !== -1 ||
                  lowerUrl.indexOf("token") !== -1 ||
                  lowerUrl.indexOf("session") !== -1 ||
                  lowerUrl.indexOf("profile") !== -1 ||
                  lowerUrl.indexOf("user") !== -1
                );

              if (shouldInspectResponse) {
                var clonedResponse = response.clone();
                clonedResponse.text().then(function(text) {
                  var parsed = maybeParseJson(text);
                  captureTokenCandidate(parsed, "fetch-response");
                }).catch(function() {});
              }
            } catch (_error) {
            }

            return response;
          });
        };
      }

      var OriginalXHR = window.XMLHttpRequest;
      if (typeof OriginalXHR === "function") {
        var originalOpen = OriginalXHR.prototype.open;
        var originalSetRequestHeader = OriginalXHR.prototype.setRequestHeader;
        var originalSend = OriginalXHR.prototype.send;

        OriginalXHR.prototype.open = function() {
          this.__ozayraAuthHeader = null;
          this.__ozayraRequestUrl = arguments.length > 1 ? arguments[1] : "";
          return originalOpen.apply(this, arguments);
        };

        OriginalXHR.prototype.setRequestHeader = function(name, value) {
          if (String(name).toLowerCase() === "authorization") {
            this.__ozayraAuthHeader = value;
            captureTokenCandidate(value, "xhr-headers");
          }

          return originalSetRequestHeader.apply(this, arguments);
        };

        OriginalXHR.prototype.send = function() {
          this.addEventListener("load", function() {
            try {
              var lowerUrl = String(this.__ozayraRequestUrl || "").toLowerCase();
              var shouldInspectResponse =
                !window.__OZAYRA_AUTH_STATE__ &&
                (
                  lowerUrl.indexOf("login") !== -1 ||
                  lowerUrl.indexOf("auth") !== -1 ||
                  lowerUrl.indexOf("token") !== -1 ||
                  lowerUrl.indexOf("session") !== -1 ||
                  lowerUrl.indexOf("profile") !== -1 ||
                  lowerUrl.indexOf("user") !== -1
                );

              if (shouldInspectResponse) {
                captureTokenCandidate(this.responseText, "xhr-response");
              }
            } catch (_error) {
            }
          });

          return originalSend.apply(this, arguments);
        };
      }
    }

    function wrapStorage(storage) {
      if (!storage || storage.__OZAYRA_WRAPPED__) {
        return;
      }

      var originalSetItem = storage.setItem;
      var originalRemoveItem = storage.removeItem;
      var originalClear = storage.clear;

      storage.setItem = function(key, value) {
        var result = originalSetItem.apply(this, arguments);
        scheduleAuthStateSync(0);
        return result;
      };

      storage.removeItem = function(key) {
        var result = originalRemoveItem.apply(this, arguments);
        scheduleAuthStateSync(0);
        return result;
      };

      storage.clear = function() {
        var result = originalClear.apply(this, arguments);
        scheduleAuthStateSync(0);
        return result;
      };

      storage.__OZAYRA_WRAPPED__ = true;
    }

    function createLocationError(code, message) {
      return {
        code: code,
        message: message
      };
    }

    function dispatchLocationEvent(eventName, detail) {
      window.dispatchEvent(new CustomEvent(eventName, {
        detail: detail
      }));
    }

    window.__OZAYRA_LOCATION_REQUEST_ID__ = 0;
    window.__OZAYRA_LOCATION_PENDING__ = {};
    window.__OZAYRA_LOCATION_WATCHERS__ = {};
    window.__OZAYRA_LAST_LOCATION__ = null;
    window.__OZAYRA_GEO_PERMISSION_STATE__ =
      window.__OZAYRA_GEO_PERMISSION_STATE__ || "prompt";

    window.__OZAYRA_RECEIVE_LOCATION = function(payload) {
      if (!payload || !payload.position) {
        return;
      }

      window.__OZAYRA_LAST_LOCATION__ = payload.position;
      dispatchLocationEvent(${JSON.stringify(EVENTS.LOCATION_UPDATE)}, payload.position);

      var pendingRequest = window.__OZAYRA_LOCATION_PENDING__[payload.requestId];
      if (pendingRequest && typeof pendingRequest.success === "function") {
        pendingRequest.success(payload.position);
      }
      delete window.__OZAYRA_LOCATION_PENDING__[payload.requestId];

      var watcher = window.__OZAYRA_LOCATION_WATCHERS__[payload.requestId];
      if (watcher && typeof watcher.success === "function") {
        watcher.success(payload.position);
      }
    };

    window.__OZAYRA_RECEIVE_LOCATION_ERROR = function(payload) {
      var error = createLocationError(
        payload && payload.code ? payload.code : 2,
        payload && payload.message ? payload.message : "Unable to fetch location."
      );

      dispatchLocationEvent(${JSON.stringify(EVENTS.LOCATION_ERROR)}, error);

      var pendingRequest = payload ? window.__OZAYRA_LOCATION_PENDING__[payload.requestId] : null;
      if (pendingRequest && typeof pendingRequest.error === "function") {
        pendingRequest.error(error);
      }
      if (payload) {
        delete window.__OZAYRA_LOCATION_PENDING__[payload.requestId];
      }

      var watcher = payload ? window.__OZAYRA_LOCATION_WATCHERS__[payload.requestId] : null;
      if (watcher && typeof watcher.error === "function") {
        watcher.error(error);
      }
    };

    function installGeolocationBridge() {
      var geolocation = {
        getCurrentPosition: function(success, error, options) {
          var requestId = "geo-" + (++window.__OZAYRA_LOCATION_REQUEST_ID__);
          window.__OZAYRA_LOCATION_PENDING__[requestId] = {
            success: success,
            error: error
          };

          if (window.__OZAYRA_LAST_LOCATION__ && options && options.maximumAge > 0) {
            success(window.__OZAYRA_LAST_LOCATION__);
            delete window.__OZAYRA_LOCATION_PENDING__[requestId];
            return;
          }

          postToApp("REQUEST_LOCATION", {
            requestId: requestId,
            watch: false,
            options: options || {}
          });
        },
        watchPosition: function(success, error, options) {
          var requestId = "watch-" + (++window.__OZAYRA_LOCATION_REQUEST_ID__);
          window.__OZAYRA_LOCATION_WATCHERS__[requestId] = {
            success: success,
            error: error
          };

          if (window.__OZAYRA_LAST_LOCATION__ && typeof success === "function") {
            success(window.__OZAYRA_LAST_LOCATION__);
          }

          postToApp("REQUEST_LOCATION", {
            requestId: requestId,
            watch: true,
            options: options || {}
          });

          return requestId;
        },
        clearWatch: function(requestId) {
          delete window.__OZAYRA_LOCATION_WATCHERS__[requestId];
          postToApp("CLEAR_LOCATION_WATCH", {
            requestId: requestId
          });
        }
      };

      try {
        Object.defineProperty(window.navigator, "geolocation", {
          configurable: true,
          enumerable: true,
          value: geolocation
        });
      } catch (_error) {
        window.navigator.geolocation = geolocation;
      }
    }

    function installPermissionsBridge() {
      var existingPermissions = window.navigator.permissions;
      var originalQuery =
        existingPermissions && typeof existingPermissions.query === "function"
          ? existingPermissions.query.bind(existingPermissions)
          : null;

      var permissionsBridge = existingPermissions || {};

      permissionsBridge.query = function(descriptor) {
        var permissionName =
          descriptor && descriptor.name ? String(descriptor.name) : "";

        if (permissionName === "geolocation") {
          return Promise.resolve({
            name: "geolocation",
            state: window.__OZAYRA_GEO_PERMISSION_STATE__ || "prompt",
            onchange: null
          });
        }

        if (originalQuery) {
          return originalQuery(descriptor);
        }

        return Promise.resolve({
          name: permissionName,
          state: "prompt",
          onchange: null
        });
      };

      try {
        Object.defineProperty(window.navigator, "permissions", {
          configurable: true,
          enumerable: true,
          value: permissionsBridge
        });
      } catch (_error) {
        window.navigator.permissions = permissionsBridge;
      }
    }

    function installShareBridge() {
      if (typeof window.navigator.share === "function") {
        return;
      }

      window.navigator.share = function(shareData) {
        return new Promise(function(resolve) {
          postToApp("SHARE", {
            title: shareData && shareData.title ? shareData.title : "",
            text: shareData && shareData.text ? shareData.text : "",
            url: shareData && shareData.url ? shareData.url : ""
          });
          resolve();
        });
      };

      window.navigator.canShare = function(shareData) {
        return !!(
          shareData &&
          (shareData.title || shareData.text || shareData.url)
        );
      };
    }

    window.__OZAYRA_NATIVE_BRIDGE_READY__ = true;
    window.__OZAYRA_PUSH_CONTEXT__ = window.__OZAYRA_PUSH_CONTEXT__ || null;
    window.__OZAYRA_PENDING_NOTIFICATION_OPEN__ =
      window.__OZAYRA_PENDING_NOTIFICATION_OPEN__ || null;

    window.OzayraNativeBridge = {
      post: postToApp,
      notifyReady: function(payload) {
        postToApp("WEBVIEW_READY", payload || {});
      },
      setAuthState: function(payload) {
        postToApp("AUTH_STATE", payload || {});
      },
      logout: function(payload) {
        postToApp("LOGOUT", payload || {});
      },
      requestPushContext: function(payload) {
        postToApp("REQUEST_PUSH_CONTEXT", payload || {});
      },
      ackTokenSaved: function(payload) {
        postToApp("FCM_SYNC_ACK", payload || {});
      }
    };

    window.notifyNativeAuthState = function(authState) {
      var normalized = authState || {};
      var normalizedUser = normalized.user || null;
      window.__OZAYRA_AUTH_STATE__ = {
        authenticated: normalized.authenticated !== false,
        authToken: normalized.authToken || normalized.token || null,
        userId: normalized.userId || normalized.id || (normalizedUser && normalizedUser.id) || null,
        appType: normalized.appType || normalized.userType || (normalizedUser && normalizedUser.role) || null,
        user: normalizedUser
      };
      syncDetectedAuthState();
    };

    window.notifyNativeLogout = function() {
      window.__OZAYRA_AUTH_STATE__ = null;
      window.__OZAYRA_LAST_AUTH_SIGNATURE__ = null;
      postToApp("LOGOUT", { source: "notifyNativeLogout" });
    };

    wrapStorage(window.localStorage);
    wrapStorage(window.sessionStorage);
    installAuthCaptureHooks();
    installGeolocationBridge();
    installPermissionsBridge();
    installShareBridge();

    window.dispatchEvent(new CustomEvent(${JSON.stringify(EVENTS.BRIDGE_READY)}, {
      detail: { source: "native-app", appVersion: ${JSON.stringify(APP_VERSION)} }
    }));

    document.addEventListener("DOMContentLoaded", function() {
      injectScrollbarStyles();
      installRouteChangeTracking();
      installBookingTopGapObserver();
      window.OzayraNativeBridge.notifyReady({ phase: "dom-content-loaded" });
      syncDetectedAuthState();
    });

    window.addEventListener("load", function() {
      injectScrollbarStyles();
      applyBookingTopGap();
      notifyRouteChange("window-load");
      window.OzayraNativeBridge.notifyReady({ phase: "window-load" });
      syncDetectedAuthState();
    });

    setInterval(syncDetectedAuthState, 10000);
    setTimeout(syncDetectedAuthState, 1000);
    setTimeout(syncDetectedAuthState, 5000);

    return true;
  })();
`;

function AppContent() {
  const netInfo = useNetInfo();
  const webViewRef = useRef(null);
  const [webViewSourceUrl, setWebViewSourceUrl] = useState(APP_URL);
  const [currentPathname, setCurrentPathname] = useState(
    normalizePathname(getPathnameFromUrl(APP_URL))
  );
  const [showLaunchSplash, setShowLaunchSplash] = useState(true);
  const splashHiddenRef = useRef(false);
  const canGoBackRef = useRef(false);
  const currentPathnameRef = useRef(
    normalizePathname(getPathnameFromUrl(APP_URL))
  );
  const webViewSourceUrlRef = useRef(APP_URL);
  const currentTokenRef = useRef(null);
  const currentLocationRef = useRef(null);
  const authContextRef = useRef({
    authenticated: false,
    authToken: null,
    userId: null,
    appType: null,
  });
  const pageReadyRef = useRef(false);
  const lastInjectedSignatureRef = useRef(null);
  const lastBackendSyncSignatureRef = useRef(null);
  const lastWebsiteSyncSignatureRef = useRef(null);
  const websiteSessionSyncEnabledRef = useRef(true);
  const lastOpenedOrderSignatureRef = useRef(null);
  const pendingOpenRef = useRef(null);
  const currentUrlRef = useRef(APP_URL);
  const lastBackPressAtRef = useRef(0);
  const activeLocationWatchesRef = useRef(new Set());
  const locationSubscriptionRef = useRef(null);

  const retryConnection = () => {
    if (netInfo.isConnected === false) {
      Alert.alert(
        "Checking Connection",
        "Please ensure your device is connected to the internet. The app will automatically resume when the connection is restored."
      );
    }
  };


  useEffect(() => {
    if (Platform.OS === "android") {
      const hideNavigationBar = async () => {
        try {
          await NavigationBar.setVisibilityAsync("hidden");
          await NavigationBar.setBehaviorAsync("overlay-swipe");
        } catch (error) {
          if (DEBUG_NATIVE_LOGS) {
            console.warn("[NavigationBar] Failed to configure visibility", error);
          }
        }
      };

      hideNavigationBar();

      const subscription = AppState.addEventListener("change", (nextAppState) => {
        if (nextAppState === "active") {
          hideNavigationBar();
        }
      });

      return () => {
        subscription.remove();
      };
    }
  }, []);

  const isRootWebsiteUrl = (url) => {
    try {
      const parsedUrl = new URL(url || APP_URL);
      const appBaseUrl = new URL(APP_URL);
      const normalizedPath = normalizePathname(parsedUrl.pathname);

      return (
        parsedUrl.origin === appBaseUrl.origin &&
        normalizedPath === "/" &&
        !parsedUrl.search &&
        !parsedUrl.hash
      );
    } catch (_error) {
      return url === APP_URL;
    }
  };

  const updateCurrentPathname = (url) => {
    const pathname = normalizePathname(getPathnameFromUrl(url));
    if (currentPathnameRef.current === pathname) {
      return;
    }

    currentPathnameRef.current = pathname;
    setCurrentPathname(pathname);
  };

  const updateCanGoBack = (nextValue) => {
    const normalizedValue = !!nextValue;

    if (canGoBackRef.current === normalizedValue) {
      return;
    }

    canGoBackRef.current = normalizedValue;
  };

  const updateWebViewSourceUrl = (nextUrl) => {
    const normalizedUrl = nextUrl || APP_URL;

    if (webViewSourceUrlRef.current === normalizedUrl) {
      return;
    }

    webViewSourceUrlRef.current = normalizedUrl;
    setWebViewSourceUrl(normalizedUrl);
  };

  const showWhitePatch = shouldShowWhitePatch(currentPathname);
  const topWhitePatchHeight =
    Platform.OS === "android"
      ? Math.max(StatusBar.currentHeight ?? 0, 36)
      : 36;

  const buildLocationPayload = (location) => ({
    coords: {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      accuracy: location.coords.accuracy ?? null,
      altitude: location.coords.altitude ?? null,
      altitudeAccuracy: location.coords.altitudeAccuracy ?? null,
      heading: location.coords.heading ?? null,
      speed: location.coords.speed ?? null,
    },
    timestamp: location.timestamp ?? Date.now(),
  });

  const injectJavaScript = (script) => {
    if (!webViewRef.current) {
      return false;
    }

    webViewRef.current.injectJavaScript(script);
    return true;
  };

  const isCustomerAuthType = (appType) => {
    if (!appType) {
      return true;
    }

    return String(appType).toLowerCase() === APP_TYPES.CUSTOMER;
  };

  const resetToCustomerSurface = (reason, details = {}) => {
    if (DEBUG_NATIVE_LOGS) {
      console.warn("[Routing] Resetting non-customer session", {
        reason,
        ...details,
      });
    }

    authContextRef.current = {
      authenticated: false,
      authToken: null,
      userId: null,
      appType: null,
    };
    lastBackendSyncSignatureRef.current = null;
    lastWebsiteSyncSignatureRef.current = null;
    websiteSessionSyncEnabledRef.current = true;
    currentUrlRef.current = APP_URL;
    updateWebViewSourceUrl(APP_URL);
    updateCurrentPathname(APP_URL);

    injectJavaScript(`
      (function() {
        try {
          var keys = [
            "user",
            "authUser",
            "currentUser",
            "customer",
            "profile",
            "sessionUser",
            "authToken",
            "token",
            "accessToken",
            "access_token",
            "jwt",
            "jwtToken",
            "userToken",
            "customerToken"
          ];

          keys.forEach(function(key) {
            try {
              window.localStorage.removeItem(key);
            } catch (_error) {
            }

            try {
              window.sessionStorage.removeItem(key);
            } catch (_error) {
            }
          });

          window.__OZAYRA_AUTH_STATE__ = null;
          window.__OZAYRA_LAST_AUTH_SIGNATURE__ = null;

          var cookies = document.cookie ? document.cookie.split(";") : [];
          cookies.forEach(function(cookie) {
            var separatorIndex = cookie.indexOf("=");
            var name =
              separatorIndex === -1
                ? cookie.trim()
                : cookie.slice(0, separatorIndex).trim();

            if (!name) {
              return;
            }

            document.cookie =
              name + "=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
          });

          if (window.location.href !== ${JSON.stringify(APP_URL)}) {
            window.location.replace(${JSON.stringify(APP_URL)});
          }
        } catch (_error) {
          if (window.location.href !== ${JSON.stringify(APP_URL)}) {
            window.location.replace(${JSON.stringify(APP_URL)});
          }
        }

        return true;
      })();
    `);
  };

  const enforceCustomerRoute = (url, source) => {
    const pathname = normalizePathname(getPathnameFromUrl(url));

    if (!isNonCustomerPath(pathname)) {
      return false;
    }

    resetToCustomerSurface("non-customer-route", {
      source,
      pathname,
      url,
    });
    return true;
  };

  const hideSplashScreenIfReady = async () => {
    if (splashHiddenRef.current) {
      return;
    }

    splashHiddenRef.current = true;

    try {
      await SplashScreen.hideAsync();
    } catch (_error) {
    }

    setShowLaunchSplash(false);
  };

  const pushLocationToWebsite = ({ requestId, position, error }) => {
    if (error) {
      return injectJavaScript(`
        (function() {
          if (typeof window.__OZAYRA_RECEIVE_LOCATION_ERROR === "function") {
            window.__OZAYRA_RECEIVE_LOCATION_ERROR(${stringifyForInjection({
              requestId,
              ...error,
            })});
          }
          return true;
        })();
      `);
    }

    return injectJavaScript(`
      (function() {
        if (typeof window.__OZAYRA_RECEIVE_LOCATION === "function") {
          window.__OZAYRA_RECEIVE_LOCATION(${stringifyForInjection({
            requestId,
            position,
          })});
        }
        return true;
      })();
    `);
  };

  const ensureLocationPermission = async () => {
    const setWebsiteGeolocationPermissionState = (state) =>
      injectJavaScript(`
        (function() {
          window.__OZAYRA_GEO_PERMISSION_STATE__ = ${JSON.stringify(state)};
          return true;
        })();
      `);

    const promptToOpenLocationSettings = () => {
      Alert.alert(
        "Location permission needed",
        "Please enable location permission from app settings to show nearby restaurants.",
        [
          { text: "Not now", style: "cancel" },
          {
            text: "Open settings",
            onPress: () => {
              Linking.openSettings().catch(() => {});
            },
          },
        ]
      );
    };

    if (Platform.OS === "android") {
      const fineLocationGranted = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
      );
      const coarseLocationGranted = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION
      );

      if (!fineLocationGranted && !coarseLocationGranted) {
        const androidPermissionResult =
          await PermissionsAndroid.requestMultiple([
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
          ]);

        const hasAndroidLocationPermission =
          androidPermissionResult[
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
          ] === PermissionsAndroid.RESULTS.GRANTED ||
          androidPermissionResult[
            PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION
          ] === PermissionsAndroid.RESULTS.GRANTED;

        const isAndroidLocationBlocked =
          androidPermissionResult[
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
          ] === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN ||
          androidPermissionResult[
            PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION
          ] === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN;

        if (!hasAndroidLocationPermission && isAndroidLocationBlocked) {
          setWebsiteGeolocationPermissionState("denied");
          promptToOpenLocationSettings();
          return false;
        }
      }
    }

    const existingPermission = await Location.getForegroundPermissionsAsync();
    if (existingPermission.granted) {
      setWebsiteGeolocationPermissionState("granted");
      return true;
    }

    if (existingPermission.canAskAgain === false) {
      setWebsiteGeolocationPermissionState("denied");
      if (Platform.OS === "android") {
        promptToOpenLocationSettings();
      }
      return false;
    }

    const requestedPermission = await Location.requestForegroundPermissionsAsync();
    setWebsiteGeolocationPermissionState(
      requestedPermission.granted ? "granted" : "denied"
    );
    return requestedPermission.granted;
  };

  const createLocationOptions = (options = {}, watch = false) => ({
    accuracy: options.enableHighAccuracy
      ? Location.Accuracy.High
      : Location.Accuracy.Balanced,
    distanceInterval: watch ? 10 : undefined,
    timeInterval: watch ? 5000 : undefined,
    mayShowUserSettingsDialog: true,
  });

  const stopLocationWatchIfIdle = () => {
    if (
      locationSubscriptionRef.current &&
      activeLocationWatchesRef.current.size === 0
    ) {
      locationSubscriptionRef.current.remove();
      locationSubscriptionRef.current = null;
    }
  };

  const startLocationWatchIfNeeded = async (options = {}) => {
    if (locationSubscriptionRef.current) {
      return;
    }

    locationSubscriptionRef.current = await Location.watchPositionAsync(
      createLocationOptions(options, true),
      (location) => {
        const position = buildLocationPayload(location);
        currentLocationRef.current = position;

        activeLocationWatchesRef.current.forEach((requestId) => {
          pushLocationToWebsite({ requestId, position });
        });
      }
    );
  };

  const handleLocationRequest = async (payload = {}) => {
    const requestId = payload.requestId || `geo-${Date.now()}`;
    const isGranted = await ensureLocationPermission();

    if (!isGranted) {
      pushLocationToWebsite({
        requestId,
        error: {
          code: 1,
          message: "Location permission denied.",
        },
      });
      return;
    }

    try {
      const location = await Location.getCurrentPositionAsync(
        createLocationOptions(payload.options, payload.watch)
      );
      const position = buildLocationPayload(location);
      currentLocationRef.current = position;
      pushLocationToWebsite({ requestId, position });

      if (payload.watch) {
        activeLocationWatchesRef.current.add(requestId);
        await startLocationWatchIfNeeded(payload.options);
      }
    } catch (error) {
      pushLocationToWebsite({
        requestId,
        error: {
          code: 2,
          message: error?.message || "Unable to fetch location.",
        },
      });
    }
  };

  const handleClearLocationWatch = (payload = {}) => {
    if (payload.requestId) {
      activeLocationWatchesRef.current.delete(payload.requestId);
    }
    stopLocationWatchIfIdle();
  };

  const primeLocationForWebsite = async () => {
    const isGranted = await ensureLocationPermission();
    if (!isGranted) {
      return;
    }

    try {
      const lastKnownLocation = await Location.getLastKnownPositionAsync();
      if (lastKnownLocation) {
        const lastKnownPosition = buildLocationPayload(lastKnownLocation);
        currentLocationRef.current = lastKnownPosition;
        pushLocationToWebsite({
          requestId: "native-last-known-location",
          position: lastKnownPosition,
        });
      }
    } catch (_error) {
    }

    try {
      const currentLocation = await Location.getCurrentPositionAsync(
        createLocationOptions({}, false)
      );
      const currentPosition = buildLocationPayload(currentLocation);
      currentLocationRef.current = currentPosition;
      pushLocationToWebsite({
        requestId: "native-current-location",
        position: currentPosition,
      });
    } catch (_error) {
    }
  };

  const handleShareRequest = async (payload = {}) => {
    const title = payload?.title ? String(payload.title) : "";
    const text = payload?.text ? String(payload.text) : "";
    const url = payload?.url ? String(payload.url) : "";
    const message = [text, url].filter(Boolean).join(" ").trim();

    try {
      await Share.share({
        title: title || undefined,
        message: message || undefined,
        url: url || undefined,
      });
    } catch (error) {
      if (DEBUG_NATIVE_LOGS) {
        console.warn("[Share] Failed", {
          message: error?.message,
        });
      }
    }
  };

  const syncPushContextToWebsite = (force = false) => {
    if (!currentTokenRef.current || !webViewRef.current) {
      return;
    }

    const context = buildPushContext({
      token: currentTokenRef.current,
      appVersion: APP_VERSION,
      appType: authContextRef.current.appType,
      userId: authContextRef.current.userId,
    });

    const signature = buildSyncSignature(context);
    if (!force && lastInjectedSignatureRef.current === signature) {
      return;
    }

    lastInjectedSignatureRef.current = signature;

    const script = `
      (function() {
        var payload = ${stringifyForInjection(context)};
        window.__OZAYRA_PUSH_CONTEXT__ = payload;
        window.dispatchEvent(new CustomEvent(${JSON.stringify(EVENTS.PUSH_CONTEXT)}, { detail: payload }));
        window.dispatchEvent(new CustomEvent(${JSON.stringify(EVENTS.LEGACY_PUSH_CONTEXT)}, { detail: payload }));
        window.dispatchEvent(new CustomEvent(${JSON.stringify(EVENTS.LEGACY_FCM_TOKEN)}, { detail: payload }));
        return true;
      })();
    `;

    injectJavaScript(script);
  };

  const syncTokenViaWebsiteSession = (force = false) => {
    if (
      !currentTokenRef.current ||
      !webViewRef.current ||
      !websiteSessionSyncEnabledRef.current ||
      authContextRef.current.authToken
    ) {
      return;
    }

    const payload = buildPushContext({
      token: currentTokenRef.current,
      appVersion: APP_VERSION,
      appType: authContextRef.current.appType,
      userId: authContextRef.current.userId,
    });

    const signature = buildSyncSignature(payload);
    if (!force && lastWebsiteSyncSignatureRef.current === signature) {
      return;
    }

    lastWebsiteSyncSignatureRef.current = signature;

    injectJavaScript(`
      (function() {
        var payload = ${stringifyForInjection(payload)};
        fetch(${JSON.stringify(FCM_SAVE_URL)}, {
          method: "POST",
          credentials: "include",
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        }).then(async function(response) {
          var text = await response.text();
          var body = text;
          try {
            body = JSON.parse(text);
          } catch (_error) {
          }

          if (window.OzayraNativeBridge && window.OzayraNativeBridge.ackTokenSaved) {
            window.OzayraNativeBridge.ackTokenSaved({
              source: "website-session-sync",
              ok: response.ok,
              status: response.status,
              body: body
            });
          }
        }).catch(function(error) {
          if (window.OzayraNativeBridge && window.OzayraNativeBridge.ackTokenSaved) {
            window.OzayraNativeBridge.ackTokenSaved({
              source: "website-session-sync",
              ok: false,
              status: 0,
              error: error && error.message ? error.message : String(error)
            });
          }
        });
        return true;
      })();
    `);
  };

  const openNotificationTargetInWebsite = (payload, force = false) => {
    if (!payload || !webViewRef.current) {
      return;
    }

    const signature = buildSyncSignature(payload);
    if (!force && lastOpenedOrderSignatureRef.current === signature) {
      return;
    }

    lastOpenedOrderSignatureRef.current = signature;

    const script = `
      (function() {
        var payload = ${stringifyForInjection(payload)};
        window.__OZAYRA_PENDING_NOTIFICATION_OPEN__ = payload;
        window.dispatchEvent(new CustomEvent(${JSON.stringify(EVENTS.OPEN_ORDER_POPUP)}, { detail: payload }));
        window.dispatchEvent(new CustomEvent(${JSON.stringify(EVENTS.NOTIFICATION_OPEN)}, { detail: payload }));
        if (payload.url && window.location.href !== payload.url) {
          setTimeout(function() {
            if (window.location.href !== payload.url) {
              window.location.href = payload.url;
            }
          }, 250);
        }
        return true;
      })();
    `;

    injectJavaScript(script);
  };

  const flushPendingOpen = (force = false) => {
    if (!pageReadyRef.current || !pendingOpenRef.current) {
      return;
    }

    openNotificationTargetInWebsite(pendingOpenRef.current, force);
  };

  const persistTokenToBackend = async (force = false) => {
    const { authenticated, authToken, userId, appType } = authContextRef.current;
    const token = currentTokenRef.current;
    if (!token) {
      return;
    }

    const signature = buildSyncSignature({
      token,
      userId,
      appType,
      authenticated,
      hasAuthToken: !!authToken,
    });

    if (!force && lastBackendSyncSignatureRef.current === signature) {
      return;
    }

    const payload = buildPushContext({
      token,
      appVersion: APP_VERSION,
      appType,
      userId,
    });

    try {
      const result = await syncFcmTokenToBackend({
        authToken,
        body: payload,
      });

      if (DEBUG_NATIVE_LOGS) {
        console.log("[FCM] Backend sync success", {
          status: result.status,
          usedAuthToken: !!authToken,
          body: result.body,
        });
      }
      if (authToken) {
        websiteSessionSyncEnabledRef.current = false;
      }
      lastBackendSyncSignatureRef.current = signature;

      injectJavaScript(`
        (function() {
          window.dispatchEvent(new CustomEvent(${JSON.stringify(EVENTS.TOKEN_SYNCED)}, {
            detail: ${stringifyForInjection(result)}
          }));
          return true;
        })();
      `);
    } catch (error) {
      if (DEBUG_NATIVE_LOGS) {
        console.warn("[FCM] Backend sync failed", {
          message: error?.message,
          status: error?.status,
          body: error?.body,
        });
      }
      lastBackendSyncSignatureRef.current = null;
    }
  };

  const updateToken = async (token, options = {}) => {
    if (!token) {
      if (DEBUG_NATIVE_LOGS) {
        console.log("[FCM] Empty token received");
      }
      return;
    }

    if (DEBUG_NATIVE_LOGS) {
      console.log("[FCM] Token available", {
        preview: String(token).slice(0, 16),
      });
    }
    currentTokenRef.current = token;
    syncPushContextToWebsite(options.forceWebSync ?? false);
    syncTokenViaWebsiteSession(options.forceWebSync ?? false);
    await persistTokenToBackend(options.forceBackendSync ?? false);
  };

  const handleNotificationOpen = (payload, options = {}) => {
    pendingOpenRef.current = null;
    lastOpenedOrderSignatureRef.current = null;
    currentUrlRef.current = APP_URL;
    updateWebViewSourceUrl(APP_URL);
    updateCurrentPathname(APP_URL);
  };

  const syncForAuthenticatedWebsite = async (payload = {}) => {
    const normalized = {
      authenticated: !!payload.authenticated,
      authToken: payload.authToken || payload.token || null,
      userId: payload.userId || payload.id || null,
      appType: payload.appType || payload.userType || null,
    };

    authContextRef.current = normalized;

    if (DEBUG_NATIVE_LOGS) {
      console.log("[FCM] Auth state updated", {
        authenticated: normalized.authenticated,
        appType: normalized.appType,
        userId: normalized.userId,
      });
    }

    syncPushContextToWebsite(true);
    syncTokenViaWebsiteSession(true);
    await persistTokenToBackend(true);
  };

  const handleWebViewMessage = async (event) => {
    const rawData = event.nativeEvent.data;
    let message;

    try {
      message = JSON.parse(rawData);
    } catch (_error) {
      if (DEBUG_NATIVE_LOGS) {
        console.log("[WebView] Non-JSON message", rawData);
      }
      return;
    }

    if (message?.source !== BRIDGE_SOURCE) {
      if (DEBUG_NATIVE_LOGS) {
        console.log("[WebView] External message", message);
      }
      return;
    }

    const { type, payload } = message;
    if (DEBUG_NATIVE_LOGS) {
      console.log("[WebView] Bridge message", { type, payload });
    }

    if (type === "WEBVIEW_READY") {
      pageReadyRef.current = true;
      syncPushContextToWebsite(true);
      syncTokenViaWebsiteSession(true);
      flushPendingOpen(true);
      primeLocationForWebsite().catch(() => {});
      return;
    }

    if (type === "REQUEST_PUSH_CONTEXT") {
      syncPushContextToWebsite(true);
      syncTokenViaWebsiteSession(true);
      flushPendingOpen(false);
      return;
    }

    if (type === "ROUTE_CHANGE") {
      const nextUrl = payload?.href || currentUrlRef.current;
      if (enforceCustomerRoute(nextUrl, "route-change")) {
        return;
      }
      currentUrlRef.current = nextUrl;
      updateCurrentPathname(payload?.pathname || getPathnameFromUrl(nextUrl));
      return;
    }

    if (type === "AUTH_STATE") {
      if (!isCustomerAuthType(payload?.appType || payload?.userType)) {
        resetToCustomerSurface("non-customer-auth-state", {
          appType: payload?.appType || payload?.userType || null,
        });
        return;
      }

      websiteSessionSyncEnabledRef.current = !payload?.authToken;
      await syncForAuthenticatedWebsite(payload);
      return;
    }

    if (type === "REQUEST_LOCATION") {
      await handleLocationRequest(payload);
      return;
    }

    if (type === "CLEAR_LOCATION_WATCH") {
      handleClearLocationWatch(payload);
      return;
    }

    if (type === "SHARE") {
      await handleShareRequest(payload);
      return;
    }

    if (type === "AUTH_DEBUG") {
      if (DEBUG_NATIVE_LOGS) {
        console.log("[AUTH_DEBUG]", payload);
      }
      return;
    }

    if (type === "LOGOUT") {
      const { authToken, token: currentFcmToken } = authContextRef.current || {};
      if (authToken && currentFcmToken) {
        removeFcmTokenFromBackend({
          authToken,
          body: {
            token: currentFcmToken,
            platform: "mobile"
          }
        }).catch(err => console.log("[FCM] Failed to remove token on logout:", err));
      }

      authContextRef.current = {
        authenticated: false,
        authToken: null,
        userId: null,
        appType: null,
        token: null,
      };
      lastBackendSyncSignatureRef.current = null;
      lastWebsiteSyncSignatureRef.current = null;
      websiteSessionSyncEnabledRef.current = true;
      return;
    }

    if (type === "FCM_SYNC_ACK") {
      if (payload?.ok) {
        websiteSessionSyncEnabledRef.current = false;
      }
      if (DEBUG_NATIVE_LOGS) {
        console.log("[FCM] Website acknowledged token sync", payload);
      }
    }
  };

  const requestTokenAndInitialNotifications = async () => {
    const setup = await initializePushNotifications();

    if (setup.token) {
      await updateToken(setup.token, {
        forceWebSync: true,
        forceBackendSync: true,
      });
    }

    const initialNotificationOpen = await getInitialNotificationOpen();
    if (initialNotificationOpen) {
      handleNotificationOpen(initialNotificationOpen, { force: true });
    }
  };

  const onBackPress = () => {
    if (webViewRef.current && canGoBackRef.current) {
      webViewRef.current.goBack();
      return true;
    }

    if (webViewRef.current && !isRootWebsiteUrl(currentUrlRef.current)) {
      injectJavaScript(`
        (function() {
          if (window.history.length > 1) {
            window.history.back();
          }
          return true;
        })();
      `);
      return true;
    }

    const now = Date.now();
    if (now - lastBackPressAtRef.current < 2000) {
      BackHandler.exitApp();
      return true;
    }

    lastBackPressAtRef.current = now;

    Alert.alert(
      "Exit App",
      "Press back again to exit, or stay on the home page.",
      [{ text: "OK", style: "cancel" }]
    );

    return true;
  };

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      onBackPress
    );

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    requestTokenAndInitialNotifications().catch((error) => {
      if (mounted) {
        if (DEBUG_NATIVE_LOGS) {
          console.warn("[FCM] Initial setup failed", error);
        }
      }
    });

    primeLocationForWebsite().catch((error) => {
      if (mounted && DEBUG_NATIVE_LOGS) {
        console.warn("[Location] Initial prime failed", error);
      }
    });

    const unsubscribePush = registerPushRuntimeHandlers({
      onToken: async (token) => {
        if (DEBUG_NATIVE_LOGS) {
          console.log("[FCM] Token refresh received");
        }
        await updateToken(token, {
          forceWebSync: true,
          forceBackendSync: true,
        });
      },
      onNotificationOpen: (payload) => {
        if (DEBUG_NATIVE_LOGS) {
          console.log("[FCM] Notification open event", payload);
        }
        handleNotificationOpen(payload, { force: true });
      },
    });

    const linkingSubscription = Linking.addEventListener("url", ({ url }) => {
      if (DEBUG_NATIVE_LOGS) {
        console.log("[Linking] URL event", url);
      }
      handleNotificationOpen(
        extractOrderOpenPayload({
          url,
          orderId: null,
          source: "deep-link-event",
        }),
        { force: true }
      );
    });

    Linking.getInitialURL().then((url) => {
      if (!url) {
        return;
      }

      if (DEBUG_NATIVE_LOGS) {
        console.log("[Linking] Initial URL", url);
      }
      handleNotificationOpen(
        extractOrderOpenPayload({
          url,
          orderId: null,
          source: "initial-deep-link",
        }),
        { force: true }
      );
    });

    return () => {
      mounted = false;
      unsubscribePush();
      linkingSubscription.remove();
      if (locationSubscriptionRef.current) {
        locationSubscriptionRef.current.remove();
        locationSubscriptionRef.current = null;
      }
    };
  }, []);

  if (netInfo.isConnected === false) {
    return (
      <View style={{ flex: 1, backgroundColor: "#F9FAFB", justifyContent: "center", alignItems: "center", padding: 24 }}>
        <StatusBar hidden={false} barStyle="dark-content" backgroundColor="#F9FAFB" />
        
        {/* Glowing Icon Container */}
        <View style={{ marginBottom: 48, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(251, 187, 1, 0.05)', position: 'absolute' }} />
          <View style={{ width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(251, 187, 1, 0.1)', position: 'absolute' }} />
          <View style={{ width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(251, 187, 1, 0.15)', alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 70, height: 70, borderRadius: 35, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.08, shadowRadius: 20, elevation: 5 }}>
              <Text style={{ fontSize: 32 }}>📡</Text>
            </View>
          </View>
        </View>

        <Text style={{ fontSize: 28, fontWeight: "800", color: "#111827", marginBottom: 12, textAlign: "center", letterSpacing: -0.5 }}>
          Oops, No Connection
        </Text>
        
        <Text style={{ fontSize: 16, color: "#6B7280", textAlign: "center", marginBottom: 40, lineHeight: 24, paddingHorizontal: 20 }}>
          It seems you're currently offline. Please check your network settings and try again.
        </Text>

        <TouchableOpacity 
          style={{ 
            backgroundColor: "#FBBB01", 
            paddingHorizontal: 32, 
            paddingVertical: 18, 
            borderRadius: 100, 
            flexDirection: 'row', 
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: "#FBBB01", 
            shadowOffset: { width: 0, height: 8 }, 
            shadowOpacity: 0.4, 
            shadowRadius: 16, 
            elevation: 8,
            width: '100%',
            maxWidth: 300
          }}
          activeOpacity={0.85}
          onPress={retryConnection}
        >
          <Text style={{ color: "#111827", fontSize: 16, fontWeight: "700", letterSpacing: 0.3 }}>
            Check Connection
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <StatusBar hidden />
      {showLaunchSplash ? (
        <View
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            backgroundColor: "#FBBB01",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 20,
          }}
        >
          <Image
            source={require("./assets/images/splash.png")}
            style={{
              width: "100%",
              height: "100%",
            }}
            resizeMode="cover"
          />
        </View>
      ) : null}
      <WebView
        ref={webViewRef}
        source={{ uri: webViewSourceUrl }}
        style={{ flex: 1 }}
        refreshControlLightMode={false}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        overScrollMode="never"
        injectedJavaScriptBeforeContentLoaded={
          injectedJavaScriptBeforeContentLoaded
        }
        onNavigationStateChange={(state) => {
          if (enforceCustomerRoute(state.url, "navigation-state-change")) {
            return;
          }
          currentUrlRef.current = state.url;
          updateCurrentPathname(state.url);
          updateCanGoBack(state.canGoBack);
        }}
        onLoadProgress={({ nativeEvent }) => {
          if (nativeEvent.url) {
            if (enforceCustomerRoute(nativeEvent.url, "load-progress")) {
              return;
            }
            currentUrlRef.current = nativeEvent.url;
            updateCurrentPathname(nativeEvent.url);
          }
        }}
        onLoadStart={({ nativeEvent }) => {
          pageReadyRef.current = false;
          if (nativeEvent?.url) {
            if (enforceCustomerRoute(nativeEvent.url, "load-start")) {
              return;
            }
            currentUrlRef.current = nativeEvent.url;
            updateCurrentPathname(nativeEvent.url);
          }
        }}
        onLoadEnd={() => {
          pageReadyRef.current = true;
          updateCurrentPathname(currentUrlRef.current);
          syncPushContextToWebsite(true);
          syncTokenViaWebsiteSession(true);
          flushPendingOpen(false);
          hideSplashScreenIfReady();
        }}
        onError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          if (DEBUG_NATIVE_LOGS) {
            console.warn("[WebView] Load error", nativeEvent);
          }
          hideSplashScreenIfReady();
        }}
        onContentProcessDidTerminate={() => {
          if (DEBUG_NATIVE_LOGS) {
            console.warn("[WebView] Content process terminated, reloading");
          }
          webViewRef.current?.reload();
        }}
        onRenderProcessGone={() => {
          if (DEBUG_NATIVE_LOGS) {
            console.warn("[WebView] Render process gone, reloading");
          }
          webViewRef.current?.reload();
        }}
        onMessage={handleWebViewMessage}
        onGeolocationPermissionsShowPrompt={async (_origin, callback) => {
          const isGranted = await ensureLocationPermission();
          callback(isGranted, false);
        }}
        onShouldStartLoadWithRequest={(request) => {
          if (request.url) {
            currentUrlRef.current = request.url;
            updateCurrentPathname(request.url);
          }

          if (isWebViewAllowedUrl(request.url)) {
            return true;
          }

          if (isExpoDevelopmentUrl(request.url)) {
            if (DEBUG_NATIVE_LOGS) {
              console.log("[WebView] Ignored Expo dev-client URL", request.url);
            }
            return false;
          }

          let urlToOpen = request.url;
          let fallbackUrl = null;

          if (request.url.startsWith("intent:")) {
            const intentPathStart = request.url.startsWith("intent://") ? 9 : 7;
            const intentPathEnd = request.url.indexOf("#Intent");
            
            if (intentPathEnd !== -1) {
              const schemeMatch = request.url.match(/scheme=([^;]+)/);
              if (schemeMatch && schemeMatch[1]) {
                const intentPath = request.url.substring(intentPathStart, intentPathEnd);
                urlToOpen = `${schemeMatch[1]}://${intentPath}`;
              }
              const fallbackMatch = request.url.match(/browser_fallback_url=([^;]+)/);
              if (fallbackMatch && fallbackMatch[1]) {
                fallbackUrl = decodeURIComponent(fallbackMatch[1]);
              }
            }
          }

          Linking.openURL(urlToOpen).catch((error) => {
            if (fallbackUrl) {
              Linking.openURL(fallbackUrl).catch(() => {});
              return;
            }
            if (DEBUG_NATIVE_LOGS) {
              console.warn("[WebView] Failed to open external URL", {
                url: request.url,
                error,
              });
            }
          });
          return false;
        }}
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled={false}
        cacheMode="LOAD_NO_CACHE"
        allowFileAccess
        allowUniversalAccessFromFileURLs
        geolocationEnabled
        mediaCapturePermissionGrantType="grantIfSameHostElsePrompt"
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
        mixedContentMode="always"
        originWhitelist={["*"]}
        pullToRefreshEnabled
        setSupportMultipleWindows={false}
        androidLayerType="hardware"
        thirdPartyCookiesEnabled
        sharedCookiesEnabled
        incognito={false}
      />
      {showWhitePatch ? (
        <View
          pointerEvents="none"
          collapsable={false}
          renderToHardwareTextureAndroid
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: topWhitePatchHeight,
            backgroundColor: "#ffffff",
            borderBottomWidth: 1,
            borderBottomColor: "#dfe5ea",
            zIndex: 9999,
            elevation: 9999,
          }}
        />
      ) : null}
    </View>
  );
}

export default function App() {
  return <AppContent />;
}
