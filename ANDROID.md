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

## 3. Abrir Android Studio

```bash
npm run android:open
```

También podés abrir manualmente la carpeta `android/` desde Android Studio.

## 4. Preparar el teléfono

1. Activá **Opciones de desarrollador** tocando siete veces **Número de compilación** en la información del teléfono.
2. Activá **Depuración USB**.
3. Conectá el teléfono por USB y aceptá la autorización de depuración.
4. Verificá que el teléfono esté conectado a la misma red Wi-Fi que el Wemos.

## 5. Ejecutar la aplicación

En Android Studio, seleccioná el teléfono en la barra superior y presioná **Run**. La dirección inicial es `192.168.1.25` y puede cambiarse desde la pantalla Conexión.

## 6. Generar un APK debug

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
