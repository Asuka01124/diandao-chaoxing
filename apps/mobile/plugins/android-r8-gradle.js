const fs = require('node:fs');

// Shared by Expo prebuild and the Windows APK script; never persist generated Gradle edits.
module.exports = function applyAndroidR8(contents) {
  const proguard = /\bproguardFiles\s+getDefaultProguardFile\(["']proguard-android(?:-optimize)?\.txt["']\),\s*["']proguard-rules\.pro["'](?:,\s*["']\.\.\/\.\.\/config\/android-r8\.pro["'])?/g;
  if ([...contents.matchAll(proguard)].length !== 1) {
    throw new Error('Expected exactly one release ProGuard configuration in app/build.gradle');
  }
  let result = contents.replace(
    proguard,
    'proguardFiles getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro", "../../config/android-r8.pro"',
  );
  const resourceSource = 'android.sourceSets.main.res.srcDir(file("../../config/android-resources"))';
  if (!result.includes(resourceSource)) result += '\n' + resourceSource + '\n';
  return result;
};

if (require.main === module) {
  process.stdout.write(module.exports(fs.readFileSync(process.argv[2], 'utf8')));
}
