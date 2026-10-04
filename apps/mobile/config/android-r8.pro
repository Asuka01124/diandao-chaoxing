# Conservative first pass: retain names for reflection, JNI and readable crash logs.
-dontobfuscate
-keepattributes Signature,InnerClasses,EnclosingMethod,RuntimeVisibleAnnotations,RuntimeInvisibleAnnotations,AnnotationDefault

# AMap map/location/search SDK: vendor-required reflection and native entry points.
# https://lbs.amap.com/api/android-location-sdk/guide/create-project/dev-attention
-keep class com.amap.** { *; }
-keep class com.autonavi.** { *; }
-keep class com.loc.** { *; }

# Expo Kotlin reflection and JS/native module dispatch.
-keep class expo.modules.** { *; }

# Fabric/JNI UI and animation entry points; do not change screen rendering behavior.
-keep class com.swmansion.** { *; }
-keep class com.horcrux.svg.** { *; }
-keep class com.th3rdwave.safeareacontext.** { *; }

# Missing optional classes in the existing AMap combined SDK and baseline APK.
# Apply only the two exact warnings emitted by R8; do not hide other missing classes.
-dontwarn com.amap.ams.gnss.GnssSoftLocator
-dontwarn net.jafama.FastMath
