# OPC UA

Lea y escriba las variables de un servidor OPC UA desde Gladys: PLC (Siemens
S7-1200/1500, Beckhoff TwinCAT, WAGO, B&R, Schneider), pasarelas (Kepware,
Softing, Unified Automation) o cualquier servidor OPC UA de su red.

> Desarrollada sin el hardware: sus comentarios son bienvenidos. La integración
> se probó con el simulador OPC PLC de Microsoft, no con un PLC real.

## Lo que obtiene

- Un dispositivo de Gladys para el servidor, una función por variable
  declarada: números (con su unidad), valores de encendido/apagado y textos.
- Valores actualizados por **suscripción**: el servidor avisa de cada cambio,
  nada se consulta en bucle.
- La escritura, desactivada por defecto: un interruptor o una consigna del
  panel, un botón de configuración y una acción de escena escriben las
  variables que usted haya permitido.
- Tres disparadores de escena (servidor perdido, servidor recuperado, variable
  en mal estado) y un widget **Servidor OPC UA** para el panel.

## Requisitos

- Gladys 5.1 o posterior.
- Un servidor OPC UA accesible desde Gladys por TCP (`opc.tcp://`), con una
  dirección IP fija. En un Siemens S7-1500, active el servidor OPC UA de la CPU
  en TIA Portal y permita el acceso a los bloques de datos que desee leer.

## Configuración

### Servidor

1. Introduzca la **dirección del servidor**: `opc.tcp://`, la dirección IP y el
   puerto, por ejemplo `opc.tcp://192.168.1.50:4840` (4840 por defecto, 4852
   en Beckhoff, 49320 en Kepware).
2. Elija el **modo de seguridad**, y un **nombre de usuario** y una
   **contraseña** si el servidor no acepta el acceso anónimo.
3. Guarde y pulse **Explorar el servidor** para enumerar sus variables.

Gladys identifica el servidor por la dirección y el puerto introducidos aquí:
cambiarlos crea un nuevo dispositivo.

### Seguridad y certificado

- **Ninguna**: sin firma ni cifrado. Aceptable en una red de máquinas aislada.
- **Firmar** o **Firmar y cifrar**, con la **política de seguridad** que acepte
  el servidor (Basic256Sha256 es la más habitual). Gladys crea su propio
  certificado (`Gladys Assistant OPC UA`, guardado en los datos de la
  integración) en la primera conexión. La mayoría de los servidores rechazan
  un certificado desconocido: apruébelo en el servidor (TIA Portal: gestor de
  certificados, Kepware: OPC UA Configuration Manager, TwinCAT: mover la
  carpeta `rejected` a `trusted`) y espere un minuto, Gladys lo reintenta sola.
- El certificado del servidor se acepta en la primera conexión y se conserva.
- Con el modo Ninguna, una contraseña puede cruzar la red en claro: prefiera
  Firmar y cifrar cuando el servidor pida una.

### Variables

El campo **Variables** contiene entradas separadas por punto y coma:

```
Nombre: NodeId [tipo] [write] [opciones]
```

```
Ida: ns=3;s="Boiler"."FlowTemp" temperature; Bomba: ns=3;s="Boiler"."Pump" switch; Modo: ns=2;s=Plant.Mode write
```

- **NodeId**: copiado de **Explorar el servidor**: `ns=3;s=Texto` (cadena),
  `ns=2;i=1002` (número), `g=` (GUID), `b=` (opaco). Se entiende el punto y
  coma interno de un NodeId. Un NodeId termina en el primer espacio, salvo
  entre comillas (los nombres de Siemens como `ns=3;s="DB1"."Temp"` funcionan
  tal cual). Los NodeId con `nsu=` no son compatibles.
- **Nombre**: opcional; sin él, la variable toma su nombre en el servidor.
- **Tipo** (opcional): `temperature`, `humidity`, `pressure`, `power`,
  `energy`, `production`, `solar_power`, `grid_power`, `voltage`, `current`,
  `battery`, `volume`, `duration`, `value`, `binary`, `switch`, `setpoint`,
  `text`. Sin tipo: un booleano es un valor de encendido/apagado, un número un
  valor simple, una cadena o una fecha un texto. `energy` y `production` se
  publican en kWh, para que Gladys calcule el consumo y su coste.
- **write**: la variable puede escribirse desde Gladys (ver más abajo).
  `switch` y `setpoint` lo implican.
- **Opciones**: `scale=0.1` y `offset=-40` (valor = bruto × scale + offset),
  `unit=kWh`, `min=` y `max=` (límites de visualización), `precision=1`
  (decimales).

Hasta 100 variables. Las matrices y las estructuras no son compatibles.
**Comprobar la configuración** enumera las entradas erróneas o ausentes del
servidor.

### Escritura

La escritura permanece desactivada hasta que active **Permitir la escritura**.
Entonces:

- una variable declarada `switch` (booleano) o `setpoint` (temperatura)
  recibe un control en el panel. Para Gladys son entradas de
  encendido/apagado y consignas de calentador de agua, nunca interruptores ni
  termostatos: los asistentes de voz no las controlan;
- cualquier variable declarada `write` puede escribirse con el botón
  **Escribir un valor** y la acción de escena **Escribir una variable OPC UA**,
  por su nombre o su NodeId: números (scale y offset invertidos, rango del
  tipo entero comprobado), 0/1 o true/false, textos para una variable String.

El servidor también debe permitir la escritura. Escribir una variable
equivocada puede detener o dañar una instalación: declare `write` solo lo que
Gladys deba cambiar.

## Acciones

- **Explorar el servidor**: enumera hasta 60 variables (NodeId, tipo, acceso)
  desde la carpeta Objects, o desde el NodeId de una carpeta indicada como nodo
  de inicio.
- **Comprobar la configuración**: si el servidor está conectado, con qué
  seguridad, y los errores entrada por entrada.
- **Escribir un valor**: escribe un valor en una variable declarada.

## Escenas

- **Se pierde el servidor OPC UA** (disparador), con el error como variable.
- **El servidor OPC UA ha vuelto** (disparador).
- **Una variable OPC UA pasa a mal estado** (disparador): el servidor indica
  un mal estado (sensor en fallo, entrada perdida), con el nombre de la
  variable y el estado.
- **Escribir una variable OPC UA** (acción).

Los valores en sí son funciones: utilice los disparadores y condiciones
habituales de Gladys sobre el valor de un dispositivo para los umbrales.

## Panel

El widget **Servidor OPC UA** muestra los seis primeros valores y el estado
del enlace: conectado o no, seguridad, variables en buen estado, hora del
último valor.

## Límites

- Un solo servidor por integración.
- Gladys acepta 300 valores por minuto: los valores se envían en cada
  intervalo de muestreo, o con menos frecuencia con muchas variables (100
  variables: cada 25 s). Solo se envían los cambios, y un valor sin cambios
  cada 6 horas.
- El contenedor no tiene difusión de red: no hay descubrimiento automático de
  servidores, introduzca la dirección.

## Solución de problemas

- **El servidor no responde**: compruebe la dirección y el puerto, y que el
  PLC acepte conexiones desde el equipo de Gladys (cortafuegos).
- **El servidor rechaza el certificado de Gladys**: apruébelo en el servidor,
  ver más arriba.
- **El servidor rechaza el usuario o la contraseña**: compruébelos, o el
  ajuste de acceso anónimo del servidor.
- **Ningún punto de acceso con este modo de seguridad**: elija el modo y la
  política que ofrece el servidor.
- Registros detallados: configure `LOG_LEVEL=debug` en la integración.

## Créditos

Construida sobre [node-opcua](https://github.com/node-opcua/node-opcua) (MIT)
de Etienne Rossignon y colaboradores. OPC UA es un estándar de la OPC
Foundation. Esta integración no está afiliada a la OPC Foundation ni a ningún
fabricante de PLC.
