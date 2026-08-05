import { registerRootComponent } from "expo";
import notifee from "@notifee/react-native";
import { getApp } from "@react-native-firebase/app";
import {
  getMessaging,
  setBackgroundMessageHandler,
} from "@react-native-firebase/messaging";

import App from "./app";
import {
  handleBackgroundMessage,
  handleBackgroundNotifeeEvent,
} from "./pushNotifications";

const messaging = getMessaging(getApp());

setBackgroundMessageHandler(messaging, handleBackgroundMessage);
notifee.onBackgroundEvent(handleBackgroundNotifeeEvent);

registerRootComponent(App);
