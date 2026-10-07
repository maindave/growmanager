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
