# Controlador instalado

Placa: Wemos D1 R1. Destino de compilación: `esp8266:esp8266:d1`.
No usar `d1_mini`: D1 y D2 corresponden a otros GPIO.

Pines de la D1 R1: D1=GPIO1, D2=GPIO16, D5=GPIO14, D6=GPIO12, D7=GPIO13.
El firmware rechaza compilaciones para otra placa.

`GET /api/hardware` informa el GPIO y nivel leído de cada salida.
Esto verifica la señal del controlador, no el cierre físico del contacto del relé.

Compilar: `arduino-cli compile --fqbn esp8266:esp8266:d1 firmware/Sketch_API_V1`.

## Verificación de banco, 7 de octubre de 2026

Firmware 2.6.4-d1-r1-relay-diagnostics cargado por USB.
Los cuatro canales pasaron OFF → ON → OFF: 12 verificaciones de estado lógico y lectura del GPIO.
La prueba no certifica contactos físicos ni apagado de cargas sin alimentación del controlador.
Se requiere observar el módulo y comprobar su polaridad real antes de habilitar cargas ambientales.

## Protección local 2.6.5

Compilar únicamente para `esp8266:esp8266:d1` (D1 R1). La calefacción arranca apagada y bloqueada hasta revisar y rearmar desde Ambiente y protección. Sensor inválido, temperatura crítica o 15 minutos continuos detienen y bloquean la calefacción también en manual y con supervisión desactivada. La luz manual queda limitada a una hora; la luz automática necesita reloj válido y respeta su horario (incluida una configuración explícita de 24 horas). Repetir ON no renueva el límite.

Estas protecciones actúan sobre órdenes de salida, no confirman el estado físico de la carga. No garantizan apagado con el controlador sin alimentación, relé soldado o entrada flotante. Antes de volver a la Sala, validar con una lámpara de prueba el apagado al retirar alimentación del Wemos manteniendo alimentado el módulo. La calefacción necesita protección térmica independiente. No reconectar equipos de riesgo hasta completar esa comprobación.

El servidor revisa cada minuto y agrupa pérdidas de telemetría superiores a cinco minutos y protecciones críticas. Esto crea avisos en Bitácora con la app cerrada. La entrega de notificaciones externas requiere un servicio configurado; no está incluida todavía.

## Cableado COM + NO (firmware 2.6.6)

El módulo probado usa entradas activas en LOW: ON = LOW; OFF = HIGH. Las cargas deben estar verificadas en COM + NO. Esta polaridad reemplaza la adaptación anterior al cableado NC. No mezclar firmware y cableado de las dos variantes. Verificar físicamente la carga al desconectar únicamente el controlador manteniendo alimentado el módulo; los niveles GPIO no prueban el estado de los contactos ni garantizan protección con el controlador sin alimentación.
