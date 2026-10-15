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

Compilar únicamente para `esp8266:esp8266:d1` (D1 R1). La calefacción arranca apagada; solo puede activarse con lectura válida y condiciones seguras. Sensor inválido, temperatura crítica o 15 minutos continuos detienen y bloquean la calefacción también en manual y con supervisión desactivada. La luz manual queda limitada a una hora; la luz automática necesita reloj válido y respeta su horario (incluida una configuración explícita de 24 horas). Repetir ON no renueva el límite.

Estas protecciones actúan sobre órdenes de salida, no confirman el estado físico de la carga. No garantizan apagado con el controlador sin alimentación, relé soldado o entrada flotante. Antes de volver a la Sala, validar con una lámpara de prueba el apagado al retirar alimentación del Wemos manteniendo alimentado el módulo. La calefacción necesita protección térmica independiente. No reconectar equipos de riesgo hasta completar esa comprobación.

El servidor revisa cada minuto y agrupa pérdidas de telemetría superiores a cinco minutos y protecciones críticas. Esto crea avisos en Bitácora con la app cerrada. La entrega de notificaciones externas requiere un servicio configurado; no está incluida todavía.

## Cableado COM + NO (firmware 2.6.6)

El módulo probado usa entradas activas en LOW: ON = LOW; OFF = HIGH. Las cargas deben estar verificadas en COM + NO. Esta polaridad reemplaza la adaptación anterior al cableado NC. No mezclar firmware y cableado de las dos variantes. Verificar físicamente la carga al desconectar únicamente el controlador manteniendo alimentado el módulo; los niveles GPIO no prueban el estado de los contactos ni garantizan protección con el controlador sin alimentación.

## Revisión 2.6.7
UART se desactiva antes de configurar los relés porque D1 utiliza GPIO1/TX. Las actualizaciones del mapa de pines se guardan en EEPROM y se aplican al reiniciar, sin cambiar el mapa activo durante operación. Esto no elimina los pulsos ROM previos al firmware ni garantiza el estado de entradas con el controlador sin alimentación; sigue siendo necesaria la validación física del circuito.

## Incubadora (2.6.8)
Función `incubator` con valor EEPROM 7; preserva los valores existentes 0–6. Se guarda y recupera en modo manual. No participa del control térmico/VPD ni tiene automatización propia definida. La API anuncia funciones compatibles para evitar que versiones anteriores reciban funciones desconocidas. La instalación OTA reinicia el controlador; coordinarla cuando la Sala pueda tolerar la interrupción.

## Limpieza 2.6.9
Eliminada la regla StartupReview, sin opción para habilitarla. El reinicio ya no exige rearme por sí mismo. Se conservan corte térmico, sensor válido, límites de tiempo y rearme ante fallas reales. Eliminadas las variables de suelo sin uso y las impresiones UART que no se utilizaban con GPIO1 asignado al relé. Los campos JSON de suelo en false se mantienen únicamente por compatibilidad con clientes existentes.

## Protección de calefacción (2.6.10, reemplaza las reglas 2.6.5–2.6.9)

El único bloqueo retenido se aplica a la función `heater`, en el enchufe actualmente asignado. Se activa después de 300 segundos sin una lectura válida del DHT, medidos desde la última lectura correcta o desde el arranque si nunca hubo datos. Afecta manual, automático y pruebas. Antes del plazo no corta por pérdida del sensor; el automático conserva su orden previa durante ese intervalo. Una lectura válida reinicia el plazo, pero un bloqueo ya disparado requiere rearme con el sensor recuperado. Reiniciar el controlador reinicia el estado en memoria y arranca con las salidas apagadas.

Luz, ventilación, extracción, intracción, bomba e incubadora quedan fuera del bloqueo. Se eliminaron los límites de encendido continuo y los bloqueos por temperatura y respuesta insuficiente. Los avisos ambientales y la regulación automática por temperatura siguen disponibles. Cambiar la función del enchufe limpia el bloqueo anterior; asignar calefacción evalúa la antigüedad real del sensor.

`POST /api/environment` admite `heaterSensorProtectionEnabled=0|1` y `heaterSensorTimeoutSeconds=60..3600` (entero). Se guardan en un registro independiente de EEPROM en 512, sin mover salas, pines ni configuración existente. Desactivar libera el bloqueo sin encender una salida manual apagada. La configuración se muestra en Control → Ambiente y protección → Protección de calefacción, en minutos (1–60). `GET /api/environment` y `/api/status` anuncian soporte, plazo, antigüedad del sensor y motivos por canal (`0` libre, `2` bloqueado por sensor).

La interfaz muestra un punto rojo en el icono de calefacción y el texto «Bloqueada · Sin datos del sensor». Desde la tarjeta se accede a la configuración y al rearme. La incubadora no hereda el indicador al reutilizar un enchufe. Las versiones anteriores muestran un aviso de actualización y no ofrecen guardar ajustes que el controlador no admite.

Validación local: pruebas C++ de plazo exacto, tiempo configurable, movimiento entre cuatro canales, funciones excluidas, rearme, desactivación y desborde de millis; regresión ambiental; prueba de navegador móvil con API simulada; compilación para `esp8266:esp8266:d1`. Estas pruebas no accionan ni certifican el relé físico. Para aplicar este cambio se necesitan la app actualizada y este firmware instalado en el Wemos.

## Tarjetas de sensado (firmware 2.6.11 / app 2.6.24)

La telemetría ambiental incluye `tempMin`, `tempMax`, `humidityMin` y `humidityMax` para que las tarjetas usen los mismos objetivos en local y remoto. Temperatura utiliza el rango existente de Automatización; VPD utiliza el rango ambiental existente. Humedad tiene un objetivo visual inicialmente de 55–70 %, editable desde Ambiente y protección. Estos valores son objetivos de visualización: no agregan bloqueos ni modifican las decisiones de los actuadores.

`POST /api/environment` permite actualizar `humidityMin` y `humidityMax` (valores finitos, mínimo >=1, máximo <=100 y máximo > mínimo); rechaza rangos inválidos antes de mutar la configuración. Se guardan en un registro EEPROM independiente desde 528, sin desplazar los pines, la Sala, el vínculo remoto ni la protección de calefacción. El firmware anterior muestra los objetivos de humedad como no configurables hasta actualizar.

Las tarjetas muestran verde dentro del rango, coral con acento #FF622E fuera de rango, rojo en los umbrales críticos de temperatura/humedad ya configurados y gris sin lectura actual. VPD no inventa un umbral crítico. Cada tarjeta conserva su acceso al histórico y combina icono, etiqueta y objetivo. Las lecturas antiguas no se presentan como saludables; una configuración ausente tampoco se presenta como «En rango».

## Persistencia de incubadora (2.6.12)

El estado manual ON/OFF de cada enchufe asignado a `incubator` se guarda en un registro EEPROM independiente desde 560, con validación de integridad. Al arrancar se inicializan las salidas y se recupera ese estado antes de conectar Wi-Fi. Las órdenes duplicadas no vuelven a escribir flash; las pruebas temporales y las automatizaciones no modifican la elección guardada. Cambiar la función del enchufe borra su elección anterior, para que no se transfiera a otra carga. Guardar nuevamente una función/modo idénticos conserva la salida actual. Los registros de pines, funciones, modos, horarios, objetivos, protección y vinculación remota permanecen en sus ubicaciones existentes.

La primera instalación no inventa un encendido previo: si no existe registro válido, la incubadora arranca apagada; desde la primera orden manual guarda la elección. Esta recuperación se limita a incubadora: calefacción conserva su arranque apagado y su protección de sensor. Validación: pruebas C++ de persistencia ON/OFF, independencia de canales, reasignación, corrupción y deduplicación de escritura; regresiones de seguridad, pruebas temporales, ambiente, nube y objetivos; compilación D1 R1 a 160 MHz.
