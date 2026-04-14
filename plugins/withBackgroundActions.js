const { withAndroidManifest, withInfoPlist } = require("expo/config-plugins");

/**
 * react-native-background-actions용 Expo config plugin.
 *
 * Android: FOREGROUND_SERVICE_DATA_SYNC 권한 + 서비스 foregroundServiceType 선언
 * iOS: UIBackgroundModes 추가
 */
function withBackgroundActions(config) {
  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    // 권한 추가
    const permissions = manifest["uses-permission"] || [];
    const needed = [
      "android.permission.FOREGROUND_SERVICE",
      "android.permission.FOREGROUND_SERVICE_DATA_SYNC",
      "android.permission.WAKE_LOCK",
    ];
    for (const perm of needed) {
      if (!permissions.some((p) => p.$?.["android:name"] === perm)) {
        permissions.push({ $: { "android:name": perm } });
      }
    }
    manifest["uses-permission"] = permissions;

    // 서비스 선언에 foregroundServiceType 추가
    const app = manifest.application?.[0];
    if (app) {
      const services = app.service || [];
      const existing = services.find(
        (s) => s.$?.["android:name"] === "com.asterinet.react.bgactions.RNBackgroundActionsTask"
      );
      if (existing) {
        existing.$["android:foregroundServiceType"] = "dataSync";
      } else {
        services.push({
          $: {
            "android:name": "com.asterinet.react.bgactions.RNBackgroundActionsTask",
            "android:foregroundServiceType": "dataSync",
          },
        });
      }
      app.service = services;
    }

    return config;
  });

  config = withInfoPlist(config, (config) => {
    const modes = config.modResults.UIBackgroundModes || [];
    if (!modes.includes("fetch")) modes.push("fetch");
    if (!modes.includes("processing")) modes.push("processing");
    config.modResults.UIBackgroundModes = modes;
    return config;
  });

  return config;
}

module.exports = withBackgroundActions;
