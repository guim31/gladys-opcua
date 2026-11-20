// -----------------------------------------------------------------------------
// Every text the container sends to Gladys, in the four languages of its
// interface: connection status, configuration mistakes, write failures.
// German says "du", Spanish "usted".
// -----------------------------------------------------------------------------

import { localize } from './i18n.js';
import { unitLabel } from './kinds.js';

/** Connection status of the Configuration screen, by error code of client.js. */
export const STATUS = {
  noEndpoint: {
    en: 'Enter the address of the OPC UA server (opc.tcp://...).',
    fr: "Saisissez l'adresse du serveur OPC UA (opc.tcp://...).",
    de: 'Gib die Adresse des OPC-UA-Servers ein (opc.tcp://...).',
    es: 'Introduzca la dirección del servidor OPC UA (opc.tcp://...).',
  },
  badEndpoint: {
    en: 'The address must start with opc.tcp://, e.g. opc.tcp://192.168.1.50:4840.',
    fr: "L'adresse doit commencer par opc.tcp://, par exemple opc.tcp://192.168.1.50:4840.",
    de: 'Die Adresse muss mit opc.tcp:// beginnen, z. B. opc.tcp://192.168.1.50:4840.',
    es: 'La dirección debe empezar por opc.tcp://, por ejemplo opc.tcp://192.168.1.50:4840.',
  },
  unreachable: {
    en: 'The OPC UA server does not answer: check its address and port. Retrying.',
    fr: 'Le serveur OPC UA ne répond pas : vérifiez son adresse et son port. Nouvel essai en cours.',
    de: 'Der OPC-UA-Server antwortet nicht: Prüfe Adresse und Port. Neuer Versuch läuft.',
    es: 'El servidor OPC UA no responde: compruebe su dirección y su puerto. Reintentando.',
  },
  unknownHost: {
    en: 'Unknown host name: use the IP address of the OPC UA server.',
    fr: "Nom d'hôte inconnu : utilisez l'adresse IP du serveur OPC UA.",
    de: 'Unbekannter Hostname: Verwende die IP-Adresse des OPC-UA-Servers.',
    es: 'Nombre de host desconocido: utilice la dirección IP del servidor OPC UA.',
  },
  accessDenied: {
    en: 'The server refuses the user name or password (or anonymous access). Retrying every minute.',
    fr: "Le serveur refuse l'utilisateur ou le mot de passe (ou l'accès anonyme). Nouvel essai chaque minute.",
    de: 'Der Server lehnt Benutzername oder Passwort (oder den anonymen Zugang) ab. Neuer Versuch jede Minute.',
    es: 'El servidor rechaza el usuario o la contraseña (o el acceso anónimo). Reintento cada minuto.',
  },
  certificate: {
    en: 'The server refuses the Gladys certificate: trust it in the server (rejected certificates), then wait a minute.',
    fr: 'Le serveur refuse le certificat de Gladys : approuvez-le dans le serveur (certificats rejetés), puis attendez une minute.',
    de: 'Der Server lehnt das Gladys-Zertifikat ab: Vertraue ihm im Server (abgelehnte Zertifikate) und warte eine Minute.',
    es: 'El servidor rechaza el certificado de Gladys: apruébelo en el servidor (certificados rechazados) y espere un minuto.',
  },
  endpoint: {
    en: 'The server offers no endpoint with this security mode and policy: choose another one.',
    fr: "Le serveur ne propose pas de point d'accès avec ce mode et cette politique de sécurité : choisissez-en d'autres.",
    de: 'Der Server bietet keinen Endpunkt mit diesem Sicherheitsmodus und dieser Richtlinie: Wähle andere.',
    es: 'El servidor no ofrece ningún punto de acceso con este modo y esta política de seguridad: elija otros.',
  },
  configErrors: {
    en: (count) =>
      `Connected, but ${count} variable(s) are ignored: run "Check the configuration".`,
    fr: (count) =>
      `Connecté, mais ${count} variable(s) ignorée(s) : lancez « Vérifier la configuration ».`,
    de: (count) => `Verbunden, aber ${count} Variable(n) ignoriert: Starte „Konfiguration prüfen“.`,
    es: (count) =>
      `Conectado, pero se ignoran ${count} variable(s): ejecute «Comprobar la configuración».`,
  },
  initFailed: {
    en: 'The integration could not start: see its logs.',
    fr: "L'intégration n'a pas pu démarrer : consultez ses journaux.",
    de: 'Die Integration konnte nicht starten: Sieh dir ihre Protokolle an.',
    es: 'La integración no pudo iniciarse: consulte sus registros.',
  },
};

/** Mistakes in the "Variables" field (variables.js) and on the server. */
export const VARIABLE_ERRORS = {
  noNodeId: {
    en: 'no NodeId after the name',
    fr: 'pas de NodeId après le nom',
    de: 'keine NodeId nach dem Namen',
    es: 'falta el NodeId después del nombre',
  },
  badNodeId: {
    en: ({ nodeId }) => `"${nodeId}" is not a NodeId (e.g. ns=3;s=Temperature or ns=2;i=1002)`,
    fr: ({ nodeId }) => `« ${nodeId} » n'est pas un NodeId (ex. ns=3;s=Temperature ou ns=2;i=1002)`,
    de: ({ nodeId }) => `„${nodeId}“ ist keine NodeId (z. B. ns=3;s=Temperature oder ns=2;i=1002)`,
    es: ({ nodeId }) => `«${nodeId}» no es un NodeId (p. ej. ns=3;s=Temperature o ns=2;i=1002)`,
  },
  duplicateNodeId: {
    en: ({ nodeId }) => `${nodeId} is already declared`,
    fr: ({ nodeId }) => `${nodeId} est déjà déclaré`,
    de: ({ nodeId }) => `${nodeId} ist schon deklariert`,
    es: ({ nodeId }) => `${nodeId} ya está declarado`,
  },
  unknownWord: {
    en: ({ word }) => `unknown word "${word}"`,
    fr: ({ word }) => `mot inconnu « ${word} »`,
    de: ({ word }) => `unbekanntes Wort „${word}“`,
    es: ({ word }) => `palabra desconocida «${word}»`,
  },
  unknownUnit: {
    en: ({ unit }) => `unknown unit "${unit}"`,
    fr: ({ unit }) => `unité inconnue « ${unit} »`,
    de: ({ unit }) => `unbekannte Einheit „${unit}“`,
    es: ({ unit }) => `unidad desconocida «${unit}»`,
  },
  badNumber: {
    en: ({ option, value }) => `${option}=${value} is not a valid number`,
    fr: ({ option, value }) => `${option}=${value} n'est pas un nombre valide`,
    de: ({ option, value }) => `${option}=${value} ist keine gültige Zahl`,
    es: ({ option, value }) => `${option}=${value} no es un número válido`,
  },
  unitOfKind: {
    en: ({ unit, kind }) => `the unit ${unitLabel(unit)} does not fit the kind ${kind}`,
    fr: ({ unit, kind }) => `l'unité ${unitLabel(unit)} ne convient pas à la nature ${kind}`,
    de: ({ unit, kind }) => `die Einheit ${unitLabel(unit)} passt nicht zur Art ${kind}`,
    es: ({ unit, kind }) => `la unidad ${unitLabel(unit)} no corresponde al tipo ${kind}`,
  },
  minMax: {
    en: 'min must be lower than max',
    fr: 'min doit être inférieur à max',
    de: 'min muss kleiner als max sein',
    es: 'min debe ser menor que max',
  },
  tooMany: {
    en: ({ max }) => `more than ${max} variables: ignored`,
    fr: ({ max }) => `plus de ${max} variables : ignorée`,
    de: ({ max }) => `mehr als ${max} Variablen: ignoriert`,
    es: ({ max }) => `más de ${max} variables: ignorada`,
  },
  notFound: {
    en: ({ status }) => `not found on the server (${status})`,
    fr: ({ status }) => `introuvable sur le serveur (${status})`,
    de: ({ status }) => `auf dem Server nicht gefunden (${status})`,
    es: ({ status }) => `no encontrada en el servidor (${status})`,
  },
  arrayType: {
    en: 'an array: not supported',
    fr: 'un tableau : non pris en charge',
    de: 'ein Array: nicht unterstützt',
    es: 'una matriz: no compatible',
  },
  unsupportedType: {
    en: ({ type }) => `type ${type ?? 'unknown'} not supported (numbers, booleans and texts only)`,
    fr: ({ type }) =>
      `type ${type ?? 'inconnu'} non pris en charge (nombres, booléens et textes seulement)`,
    de: ({ type }) =>
      `Typ ${type ?? 'unbekannt'} nicht unterstützt (nur Zahlen, Booleans und Texte)`,
    es: ({ type }) =>
      `tipo ${type ?? 'desconocido'} no compatible (solo números, booleanos y textos)`,
  },
  kindOfType: {
    en: ({ type, kind }) => `the kind ${kind} does not fit a ${type}`,
    fr: ({ type, kind }) => `la nature ${kind} ne convient pas à un ${type}`,
    de: ({ type, kind }) => `die Art ${kind} passt nicht zu einem ${type}`,
    es: ({ type, kind }) => `el tipo ${kind} no corresponde a un ${type}`,
  },
  notWritable: {
    en: 'declared "write", but read-only on the server',
    fr: 'déclarée « write », mais en lecture seule sur le serveur',
    de: 'als „write“ deklariert, aber auf dem Server schreibgeschützt',
    es: 'declarada «write», pero de solo lectura en el servidor',
  },
};

/** Why a write failed. */
export const WRITE_ERRORS = {
  writeDisabled: {
    en: 'Writing is off: turn on "Allow writing" in the configuration.',
    fr: "L'écriture est désactivée : activez « Autoriser l'écriture » dans la configuration.",
    de: 'Schreiben ist aus: Aktiviere „Schreiben erlauben“ in der Konfiguration.',
    es: 'La escritura está desactivada: active «Permitir la escritura» en la configuración.',
  },
  notDeclaredWritable: {
    en: ({ name }) => `${name} is not declared "write" in the variables.`,
    fr: ({ name }) => `${name} n'est pas déclarée « write » dans les variables.`,
    de: ({ name }) => `${name} ist in den Variablen nicht als „write“ deklariert.`,
    es: ({ name }) => `${name} no está declarada «write» en las variables.`,
  },
  unknownVariable: {
    en: ({ name }) => `No declared variable is called ${name}.`,
    fr: ({ name }) => `Aucune variable déclarée ne s'appelle ${name}.`,
    de: ({ name }) => `Keine deklarierte Variable heißt ${name}.`,
    es: ({ name }) => `Ninguna variable declarada se llama ${name}.`,
  },
  notConnected: {
    en: 'The OPC UA server is not connected.',
    fr: "Le serveur OPC UA n'est pas connecté.",
    de: 'Der OPC-UA-Server ist nicht verbunden.',
    es: 'El servidor OPC UA no está conectado.',
  },
  notResolved: {
    en: ({ name }) => `${name} has not been read on the server yet.`,
    fr: ({ name }) => `${name} n'a pas encore été lue sur le serveur.`,
    de: ({ name }) => `${name} wurde noch nicht auf dem Server gelesen.`,
    es: ({ name }) => `${name} aún no se ha leído en el servidor.`,
  },
  typeNotWritable: {
    en: ({ type }) => `A ${type} cannot be written from Gladys.`,
    fr: ({ type }) => `Un ${type} ne peut pas être écrit depuis Gladys.`,
    de: ({ type }) => `Ein ${type} kann nicht aus Gladys geschrieben werden.`,
    es: ({ type }) => `Un ${type} no puede escribirse desde Gladys.`,
  },
  notANumber: {
    en: ({ value }) => `"${value}" is not a number.`,
    fr: ({ value }) => `« ${value} » n'est pas un nombre.`,
    de: ({ value }) => `„${value}“ ist keine Zahl.`,
    es: ({ value }) => `«${value}» no es un número.`,
  },
  notBoolean: {
    en: ({ value }) => `"${value}": expected 0 or 1 (or true / false).`,
    fr: ({ value }) => `« ${value} » : 0 ou 1 attendu (ou true / false).`,
    de: ({ value }) => `„${value}“: 0 oder 1 erwartet (oder true / false).`,
    es: ({ value }) => `«${value}»: se espera 0 o 1 (o true / false).`,
  },
  outOfRange: {
    en: ({ type, min, max }) => `Out of range for a ${type} (${min} to ${max}).`,
    fr: ({ type, min, max }) => `Hors limites pour un ${type} (${min} à ${max}).`,
    de: ({ type, min, max }) => `Außerhalb des Bereichs eines ${type} (${min} bis ${max}).`,
    es: ({ type, min, max }) => `Fuera de rango para un ${type} (${min} a ${max}).`,
  },
  refused: {
    en: ({ status }) => `The server refused the write (${status}).`,
    fr: ({ status }) => `Le serveur a refusé l'écriture (${status}).`,
    de: ({ status }) => `Der Server hat das Schreiben abgelehnt (${status}).`,
    es: ({ status }) => `El servidor rechazó la escritura (${status}).`,
  },
  failed: {
    en: ({ detail }) => `The write failed: ${detail}`,
    fr: ({ detail }) => `L'écriture a échoué : ${detail}`,
    de: ({ detail }) => `Das Schreiben ist fehlgeschlagen: ${detail}`,
    es: ({ detail }) => `La escritura falló: ${detail}`,
  },
};

/** "Entry 3 (Boiler): ..." */
export const ENTRY_LABEL = {
  en: (entry, name) => `Entry ${entry}${name ? ` (${name})` : ''}`,
  fr: (entry, name) => `Entrée ${entry}${name ? ` (${name})` : ''}`,
  de: (entry, name) => `Eintrag ${entry}${name ? ` (${name})` : ''}`,
  es: (entry, name) => `Entrada ${entry}${name ? ` (${name})` : ''}`,
};

/** The multi-language text of a variable error. */
export function variableError({ entry, name, code, params = {} }) {
  const label = localize(ENTRY_LABEL, entry, name);
  const text = localize(VARIABLE_ERRORS[code], params);
  return Object.fromEntries(
    Object.keys(text).map((lang) => [lang, `${label[lang]}: ${text[lang]}`]),
  );
}

/** The multi-language text of a write error. */
export function writeError(code, params = {}) {
  return localize(WRITE_ERRORS[code] ?? WRITE_ERRORS.failed, params);
}
