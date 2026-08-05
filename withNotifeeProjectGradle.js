const { withProjectBuildGradle } = require('@expo/config-plugins');

module.exports = function withNotifeeProjectGradle(config) {
  return withProjectBuildGradle(config, async (config) => {
    const buildGradle = config.modResults.contents;
    
    // Check if the repository is already added
    if (buildGradle.includes('@notifee/react-native/android/libs')) {
      return config;
    }
    
    const notifeeRepo = `        maven { url "$rootDir/../node_modules/@notifee/react-native/android/libs" }`;
    
    // Add inside allprojects { repositories { ... } }
    const allProjectsRegex = /allprojects\s*\{\s*repositories\s*\{/;
    if (allProjectsRegex.test(buildGradle)) {
      config.modResults.contents = buildGradle.replace(
        allProjectsRegex,
        `allprojects {\n    repositories {\n${notifeeRepo}`
      );
    }
    
    return config;
  });
};
