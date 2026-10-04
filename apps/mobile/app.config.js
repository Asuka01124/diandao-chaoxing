const base = require('./app.json').expo;

module.exports = {
  expo: {
    ...base,
    plugins: [
      ...base.plugins,
      './plugins/with-android-packaging',
      ['expo-gaode-map', {
        androidKey: process.env.AMAP_ANDROID_KEY?.trim(),
        iosKey: process.env.AMAP_IOS_KEY?.trim(),
        locationDescription: '用于在地图上选择签到位置',
      }],
    ],
    extra: {
      ...base.extra,
      amapAndroidConfigured: !!process.env.AMAP_ANDROID_KEY?.trim(),
      amapIosConfigured: !!process.env.AMAP_IOS_KEY?.trim(),
    },
  },
};
