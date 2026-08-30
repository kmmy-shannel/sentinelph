module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // If using NativeWind v2, include its plugin here:
      'nativewind/babel',
    ],
  };
};