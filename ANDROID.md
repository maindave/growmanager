# Cultivo Flora en Android

La aplicación web se empaqueta dentro de la APK mediante Capacitor. No necesita hosting ni conexión a Internet para abrir; solamente necesita Wi-Fi local para comunicarse con el Wemos.

## 1. Instalar dependencias

Desde la carpeta `APP`:

```bash
npm install
```

Necesitás Android Studio con su Android SDK y un JDK compatible instalados. Android Studio puede usar su JDK integrado.

## 2. Sincronizar cambios web

Cada vez que modifiques `index.html`, `style.css`, `app.js` o `energy.js`:

```bash
npm run android:sync
```

Este comando copia los archivos a `www/` y luego actualiza el proyecto Android.

## 3. Actualizaciones automáticas

La web puede instalarse como PWA y se actualiza automáticamente al abrirla. La aplicación Android consulta `app-version.json`; cuando GitHub publica una compilación superior, muestra **Actualizar app** y abre la descarga del APK firmado.

El workflow `.github/workflows/deploy-pages.yml` sincroniza Capacitor, construye el APK release y lo publica en:

```text
https://maindave.github.io/growmanager/downloads/growmanager-latest.apk
```

La firma se obtiene exclusivamente de los secretos `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` y `ANDROID_KEY_PASSWORD`. La clave privada nunca debe agregarse al repositorio.

Android siempre solicita confirmación antes de instalar una APK descargada. Si la aplicación anterior fue firmada con una clave diferente, es necesario desinstalarla e instalar una vez la versión base con la firma definitiva.

## 4. Abrir Android Studio (solo desarrollo)

```bash
npm run android:open
```

También podés abrir manualmente la carpeta `android/` desde Android Studio.

## 5. Preparar el teléfono

1. Activá **Opciones de desarrollador** tocando siete veces **Número de compilación** en la información del teléfono.
2. Activá **Depuración USB**.
3. Conectá el teléfono por USB y aceptá la autorización de depuración.
4. Verificá que el teléfono esté conectado a la misma red Wi-Fi que el Wemos.

## 6. Ejecutar la aplicación

En Android Studio, seleccioná el teléfono en la barra superior y presioná **Run**. La dirección inicial es `192.168.1.25` y puede cambiarse desde la pantalla Conexión.

## 7. Generar un APK debug

Desde Android Studio: **Build → Build Bundle(s) / APK(s) → Build APK(s)**.

O desde terminal, con un JDK configurado:

```bash
cd android
./gradlew assembleDebug
```

El APK queda en:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Los iconos y splash temporales están en `android/app/src/main/res/`. Se pueden reemplazar más adelante sin cambiar la aplicación web.
