# Grow Manager · Fase 1 ambiental

Implementación en `work/rooms-production`, la base más reciente de Salas y controladores. No incluye AC, humidificación/deshumidificación, CO₂ ni riego. La migración ambiental se aplicó en Supabase y el firmware se instaló por OTA en el Wemos el 5 de octubre de 2026.

## Hardware comprobado

Consulta de sólo lectura realizada el 5 de octubre de 2026 a `192.168.1.25`:

- Firmware instalado: `2.5-multi-light`.
- Wemos ESP8266, DHT21 operativo.
- Relé 1: luz automática, D1.
- Relé 2: ventilación automática, D2.
- Relé 3: luz automática, D6.
- Relé 4: sin asignar, manual, D7.

La función de un relé acredita su configuración; no acredita la identidad, potencia o respuesta del equipo físico. No hay calefacción, extracción ni intracción asignadas. La circulación y el recambio de aire se representan por separado: no se convierte el ventilador existente en extractor por suposición.

## Arquitectura y comportamiento

El controlador conserva sensores, objetivos y decisiones en la Sala. La UI consulta su API por LAN; el nuevo acceso local no exige sesión de nube. La aplicación Android ya empaqueta los archivos necesarios. La PWA precarga los recursos locales: debe instalarse/cargarse antes de quedar sin Internet. No se cachean respuestas de API. La nube sólo recibe telemetría; no ofrece comandos remotos.

`EnvironmentalControl.h` es el núcleo sin dependencias de Wi-Fi, NTP, backend o UI. Recibe lecturas válidas, objetivos y capacidades de cuatro canales. Se integra al firmware ESP8266 existente, preservando horarios independientes de luces, asignaciones, pines y EEPROM previa. La EEPROM aumenta a 1024 bytes; la configuración ambiental comienza en 256 y la vinculación remota en 384.

El control supervisado comienza desactivado. Activarlo requiere una Sala vinculada, sensor válido y límites coherentes. En configuración se elige la etapa ambiental y se confirman sus objetivos comunes, contemplando cultivos concurrentes. Los rangos iniciales son editables, no prescripciones automáticas. Los cambios de etapa de cultivo no reprograman equipos silenciosamente.

VPD del aire: `0.6108 × exp(17.27 × T / (T + 237.3)) × (1 − HR/100)`, en kPa. Sin temperatura de hoja, no se presenta como VPD foliar. Se rechazan lecturas no finitas, fuera de rango o humedad cero. Las lecturas inválidas o vencidas no se clasifican como óptimas.

- Calefacción: regulación térmica con histéresis, inhibida cuando se necesita recambio de aire. Apagado prioritario por sensor inválido, exceso térmico o falta de respuesta.
- Ventilación existente: conserva su estrategia de ciclos y pulsos de emergencia; se supervisa el efecto térmico de un pulso incluso después de apagarlo.
- Extracción/intracción: roles nuevos asignables a equipos reales. Intervienen por temperatura alta o VPD bajo asociado a humedad alta, evitando enfriar una Sala debajo de su objetivo mínimo. No se promete corregir VPD alto sin los actuadores adecuados.
- Histéresis y tiempo mínimo entre cambios; las protecciones e interbloqueos tienen prioridad sobre ese tiempo.
- Supervisión: plazo configurable, variación mínima térmica o de humedad. Falta de respuesta significa que no se observó el efecto esperado; no prueba por sí sola una avería física.
- Alarmas: sensor inválido, temperatura crítica alta/baja, humedad crítica y falta de respuesta. Una calefacción sin respuesta queda detenida hasta rearme explícito.
- Contingencia sin sensor: calefacción apagada; recambio según la opción elegida para la instalación. Circulación mantiene sus ciclos existentes.
- Registro local acotado a los últimos 64 cambios de alarmas/salidas (la API local muestra los 16 más recientes) por arranque. La nube conserva eventos recibidos, deduplicados por Sala, arranque y secuencia. Un reinicio pierde el registro RAM que todavía no se haya transmitido.

El estado de relé refleja la salida ordenada. No existe realimentación eléctrica o mecánica para confirmar encendido físico.

## Conectividad remota

`environment_status` y `environment_events` están vinculadas a Sala/proyecto y sólo se consultan con membresía del proyecto. `provision_environment_device` requiere permisos de edición y entrega un token de 256 bits; se guarda su hash. Regenerarlo revoca el acceso anterior. El token sólo permite publicar telemetría en esa Sala y no leer proyectos ni manejar equipos.

El Wemos publica directamente por HTTPS cada minuto. No requiere computadora, aplicación abierta ni otro equipo en la LAN. Compilar para `esp8266:esp8266:d1:xtal=160` (160 MHz, opción oficial del core ESP8266). El buffer TLS de recepción es de 8 KiB más overhead; el endpoint de telemetría utiliza respuestas pequeñas. Un registro que exceda el buffer se rechaza sin omitir validación TLS. La conexión verifica el certificado y el nombre del servidor con GTS Root R4 y hora UTC válida; no existe una alternativa TLS insegura. DNS y TLS avanzan por pasos dentro del ciclo principal, con plazo de transacción de 15 segundos, supervisión de pasos criptográficos de hasta cinco segundos, con control local atendido en los puntos de cesión del core cada 200 ms y reintentos acotados. El reloj se sincroniza sin esperas bloqueantes.

El token se entrega por POST local y se guarda en EEPROM del Wemos; no se expone en el estado ni se guarda en el código de la aplicación. No se usa una clave service_role ni se abren puertos del controlador a Internet. La nube no participa de las decisiones ambientales.

El controlador conserva en RAM hasta 32 muestras de cinco minutos (aproximadamente 2 h 40 min) para recuperar histórico tras una desconexión. Al llenarse descarta las más antiguas y muestra el contador; un reinicio pierde los pendientes. Antes de tener hora válida no registra muestras con fecha inventada. Los eventos tienen un buffer separado de 64 entradas. La recuperación envía hasta ocho muestras y ocho eventos por petición y confirma sólo los enviados, para mantener acotado el consumo de memoria. Estos buffers acotados no garantizan un histórico completo durante desconexiones prolongadas.

La UI muestra conexión, antigüedad del último envío, pendientes y errores. La consulta remota se actualiza cada minuto y considera vencidas las lecturas de más de 120 segundos; la local conserva su mayor frecuencia.

Puesta en marcha:

1. Aplicar y validar `supabase/migrations/202610050037_environment_phase1.sql` en el proyecto existente.
2. Instalar el firmware compilado y verificar pines, polaridad y configuración previa.
3. Vincular la Sala real, revisar objetivos y límites, asignar sólo equipos presentes y activar el control supervisado.
4. En “Consulta remota”, elegir “Vincular Wemos para consulta remota”. La aplicación provisiona el acceso exclusivo de la Sala y lo transfiere al controlador.
5. Cerrar la aplicación local y comprobar desde otra red estado, eventos e histórico. Cortar Internet y verificar que el control local continúa; restablecerlo y comprobar recuperación de muestras pendientes.

## Validaciones realizadas y pendientes

Realizado:

- Compilación ESP8266/Wemos D1 mini y D1 R1 con core instalado 3.1.2 (la compilación final D1 incluye los últimos ajustes).
- Pruebas C++ del núcleo: cálculo, sensor inválido, protección aun en manual, calor crítico, falta de respuesta y rearme, supervisión de humedad, supervisión posterior a pulsos, interbloqueo y rollover de `millis()`.
- Pruebas JS: clasificación, lecturas inválidas/vencidas y fases; clasificación local/remota; pruebas C++ de cola acotada, reintentos, rollover y respuesta HTTP fragmentada.
- Pruebas existentes de modelos de cultivo, presentación y esquema Supabase.
- Prueba de navegador con Wemos real: ingreso sin sesión, lectura de temperatura/humedad y cálculo de VPD. Con firmware anterior, guardado del nuevo control deshabilitado.

Estado de puesta en marcha y validaciones físicas pendientes:

- Backend verificado mediante transacción con rollback: provisión, token inválido/nulo, aislamiento de Sala, histórico pendiente y deduplicación. RLS y FORCE RLS comprobados.
- Instalar y probar físicamente el nuevo firmware: acciones, respuesta, cortes de Internet/backend, pérdida de sensor/comunicación y reinicios.
- Validar publicación directa en el Wemos físico: memoria disponible, duración de pasos TLS, certificados, consulta desde otra red y recuperación del histórico.
- Confirmar capacidad y límites del equipo conectado al relé 2. Con las asignaciones actuales no existe calefacción ni recambio dedicado; las contingencias sólo pueden actuar con equipos presentes.
- Protección ante fallo total del controlador, relé soldado o corte eléctrico requiere diseño físico de salidas, corte independiente/termostato cuando corresponda. Software y telemetría no acreditan esa protección.
- La iluminación tras reinicio sin Internet conserva la limitación actual: sin hora válida no puede reconstruir el horario hasta sincronizar el reloj. No se agregó RTC ni se modificó ese subsistema fuera del módulo ambiental.

Las alertas implementadas son visibles dentro de la aplicación y en el histórico remoto. No se implementaron notificaciones push, SMS o email.

El controlador conectado no tenía una Sala vinculada. Se solicitó identificar Sala Vegetativo o Sala Flora del proyecto real antes de activar objetivos y publicación; no se asigna una Sala por suposición.

Publicación verificada: versión web 2.6.0, versionCode 20 y APK firmado disponibles en GitHub Pages. La prueba física de TLS encontró que el límite inicial de 500 ms era demasiado corto para la validación del certificado; se ajustó el presupuesto y se compiló a 160 MHz. Un callback recurrente atiende las automatizaciones durante la criptografía; la API informa el intervalo máximo observado de control y la causa del último reinicio. Se reservó memoria para la pila TLS y la atención HTTP, y se trasladaron los fragmentos JSON constantes a flash. Ante watchdog, excepción o un fallo registrado del controlador tras un vínculo guardado, la publicación queda detenida hasta volver a vincular.

Verificación física final de transporte: conexión TLS validada, respuesta HTTP 401 con token deliberadamente inválido, sin reinicios, paso criptográfico máximo de 1695 ms e intervalo de control máximo de 208 ms. Se retiró el vínculo de prueba. El registro de telemetría con el token de la Sala real sigue pendiente de identificar esa Sala; no está marcado como probado.

La revisión automática rechazó crear una Sala técnica temporal, emitir credenciales y activar el control sin una Sala elegida. Esa prueba no se ejecutó. La alternativa es completar la vinculación sobre la Sala real seleccionada por el usuario.
