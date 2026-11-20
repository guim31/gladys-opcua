// -----------------------------------------------------------------------------
// The buttons of the Configuration screen and the scene action.
//
// - "Browse the server" lists the variables under a node (the Objects folder
//   by default) with their NodeId, type and access, ready to copy.
// - "Check the configuration" says whether the server answers and lists the
//   mistakes entry by entry.
// - "Write a value" (button and scene action) writes to a declared variable.
//
// Gladys shows in green what a handler returns and in red what it throws:
// every failure throws an ActionFailure carrying the four languages.
// -----------------------------------------------------------------------------

import { byLanguage, joinLines, localize } from './i18n.js';
import { STATUS, writeError } from './messages.js';
import { WriteError } from './values.js';
import { canonicalNodeId } from './variables.js';

export const ACTION_KEYS = {
  BROWSE: 'browse',
  CHECK_CONFIG: 'check_config',
  WRITE_VALUE: 'write_value',
};
export const SCENE_ACTION_KEYS = { WRITE_VALUE: 'write_value' };

const OBJECTS_FOLDER = 'ns=0;i=85';
const MAX_LINES = 60;

export class ActionFailure extends Error {
  constructor(text) {
    super(text.en);
    this.message = text;
  }
}

export const ACTION_TEXT = {
  notConnected: {
    en: 'The OPC UA server is not connected:',
    fr: "Le serveur OPC UA n'est pas connecté :",
    de: 'Der OPC-UA-Server ist nicht verbunden:',
    es: 'El servidor OPC UA no está conectado:',
  },
  badStart: {
    en: ({ nodeId }) => `"${nodeId}" is not a NodeId (e.g. ns=3;s=Plant).`,
    fr: ({ nodeId }) => `« ${nodeId} » n'est pas un NodeId (ex. ns=3;s=Plant).`,
    de: ({ nodeId }) => `„${nodeId}“ ist keine NodeId (z. B. ns=3;s=Plant).`,
    es: ({ nodeId }) => `«${nodeId}» no es un NodeId (p. ej. ns=3;s=Plant).`,
  },
  nothingFound: {
    en: 'No variable found under this node.',
    fr: 'Aucune variable trouvée sous ce nœud.',
    de: 'Keine Variable unter diesem Knoten gefunden.',
    es: 'No se encontró ninguna variable bajo este nodo.',
  },
  browseFailed: {
    en: ({ detail }) => `Browsing failed: ${detail}`,
    fr: ({ detail }) => `Le parcours a échoué : ${detail}`,
    de: ({ detail }) => `Das Durchsuchen ist fehlgeschlagen: ${detail}`,
    es: ({ detail }) => `La exploración falló: ${detail}`,
  },
  found: {
    en: ({ count }) => `${count} variable(s), as Name: NodeId (type, access):`,
    fr: ({ count }) => `${count} variable(s), sous la forme Nom: NodeId (type, accès) :`,
    de: ({ count }) => `${count} Variable(n), als Name: NodeId (Typ, Zugriff):`,
    es: ({ count }) => `${count} variable(s), como Nombre: NodeId (tipo, acceso):`,
  },
  truncated: {
    en: 'List cut: browse from a deeper node (its NodeId in the field).',
    fr: 'Liste coupée : parcourez à partir d’un nœud plus profond (son NodeId dans le champ).',
    de: 'Liste gekürzt: Durchsuche ab einem tieferen Knoten (seine NodeId im Feld).',
    es: 'Lista cortada: explore a partir de un nodo más profundo (su NodeId en el campo).',
  },
  readWrite: {
    en: 'read/write',
    fr: 'lecture/écriture',
    de: 'Lesen/Schreiben',
    es: 'lectura/escritura',
  },
  readOnly: { en: 'read-only', fr: 'lecture seule', de: 'nur Lesen', es: 'solo lectura' },
  array: { en: 'array', fr: 'tableau', de: 'Array', es: 'matriz' },
  connected: {
    en: ({ count, total, security }) =>
      `Connected (${security}): ${count} of ${total} variable(s) watched.`,
    fr: ({ count, total, security }) =>
      `Connecté (${security}) : ${count} variable(s) suivie(s) sur ${total}.`,
    de: ({ count, total, security }) =>
      `Verbunden (${security}): ${count} von ${total} Variable(n) überwacht.`,
    es: ({ count, total, security }) =>
      `Conectado (${security}): ${count} de ${total} variable(s) supervisada(s).`,
  },
  noVariable: {
    en: 'No variable declared yet: use "Browse the server", then fill the Variables field.',
    fr: 'Aucune variable déclarée : utilisez « Parcourir le serveur », puis remplissez le champ Variables.',
    de: 'Noch keine Variable deklariert: Nutze „Server durchsuchen“ und fülle dann das Feld Variablen.',
    es: 'Ninguna variable declarada: utilice «Explorar el servidor» y luego rellene el campo Variables.',
  },
  allGood: {
    en: 'No mistake in the variables.',
    fr: 'Aucune erreur dans les variables.',
    de: 'Kein Fehler in den Variablen.',
    es: 'Ningún error en las variables.',
  },
  mistakes: {
    en: 'Mistakes:',
    fr: 'Erreurs :',
    de: 'Fehler:',
    es: 'Errores:',
  },
  written: {
    en: ({ name, value }) => `${name}: ${value} written.`,
    fr: ({ name, value }) => `${name} : ${value} écrit.`,
    de: ({ name, value }) => `${name}: ${value} geschrieben.`,
    es: ({ name, value }) => `${name}: ${value} escrito.`,
  },
  noVariableName: {
    en: 'Give the name or the NodeId of a declared variable.',
    fr: "Indiquez le nom ou le NodeId d'une variable déclarée.",
    de: 'Gib den Namen oder die NodeId einer deklarierten Variable an.',
    es: 'Indique el nombre o el NodeId de una variable declarada.',
  },
  noValue: {
    en: 'Give the value to write.',
    fr: 'Indiquez la valeur à écrire.',
    de: 'Gib den zu schreibenden Wert an.',
    es: 'Indique el valor que se va a escribir.',
  },
  security: {
    en: ({ mode }) =>
      mode === 'none' ? 'no security' : mode === 'sign' ? 'signed' : 'signed and encrypted',
    fr: ({ mode }) =>
      mode === 'none' ? 'sans sécurité' : mode === 'sign' ? 'signé' : 'signé et chiffré',
    de: ({ mode }) =>
      mode === 'none'
        ? 'ohne Sicherheit'
        : mode === 'sign'
          ? 'signiert'
          : 'signiert und verschlüsselt',
    es: ({ mode }) =>
      mode === 'none' ? 'sin seguridad' : mode === 'sign' ? 'firmado' : 'firmado y cifrado',
  },
};

/** The status message of a server that is not connected, as an ActionFailure. */
function notConnected(hub) {
  const reason = hub.statusMessage() ?? localize(STATUS.unreachable);
  return new ActionFailure(joinLines([ACTION_TEXT.notConnected, reason]));
}

/** "Browse the server". */
export async function browse(hub, fields = {}) {
  const startText = String(fields.node ?? '').trim();
  const start = startText === '' ? OBJECTS_FOLDER : canonicalNodeId(startText);
  if (!start) {
    throw new ActionFailure(localize(ACTION_TEXT.badStart, { nodeId: startText }));
  }
  if (!hub.connection || hub.status.connected !== true) {
    throw notConnected(hub);
  }
  let result;
  try {
    result = await hub.connection.browse(start, { maxVariables: MAX_LINES });
  } catch (err) {
    throw new ActionFailure(
      localize(ACTION_TEXT.browseFailed, { detail: String(err.message).slice(0, 120) }),
    );
  }
  if (result.variables.length === 0) {
    throw new ActionFailure(localize(ACTION_TEXT.nothingFound));
  }
  const lines = [localize(ACTION_TEXT.found, { count: result.variables.length })];
  for (const variable of result.variables) {
    const name = variable.path.split('/').pop();
    lines.push(byLanguage((lang) => `${name}: ${variable.nodeId} (${describe(variable, lang)})`));
  }
  if (result.truncated) {
    lines.push(localize(ACTION_TEXT.truncated));
  }
  return joinLines(lines);
}

function describe(variable, lang) {
  const access = variable.writable ? ACTION_TEXT.readWrite[lang] : ACTION_TEXT.readOnly[lang];
  const type = variable.isArray
    ? `${variable.type ?? '?'} ${ACTION_TEXT.array[lang]}`
    : (variable.type ?? '?');
  return `${type}, ${access}`;
}

/** "Check the configuration". */
export async function checkConfig(hub) {
  if (!hub.endpoint) {
    throw new ActionFailure(hub.statusMessage() ?? localize(STATUS.noEndpoint));
  }
  const problems = hub.problems();
  if (hub.status.connected !== true) {
    throw new ActionFailure(
      joinLines([
        ACTION_TEXT.notConnected,
        hub.statusMessage() ?? localize(STATUS.unreachable),
        ...(problems.length > 0 ? [ACTION_TEXT.mistakes, ...problems] : []),
      ]),
    );
  }
  if (hub.variables.length === 0 && problems.length === 0) {
    throw new ActionFailure(localize(ACTION_TEXT.noVariable));
  }
  const { total } = hub.counts();
  const declared = hub.variables.length + hub.configErrors.length;
  const security = localize(ACTION_TEXT.security, { mode: hub.config.security_mode });
  const header = byLanguage((lang) =>
    ACTION_TEXT.connected[lang]({ count: total, total: declared, security: security[lang] }),
  );
  if (problems.length > 0) {
    // Connected, but some entries are wrong: the user has something to fix.
    throw new ActionFailure(joinLines([header, ACTION_TEXT.mistakes, ...problems]));
  }
  return joinLines([header, ACTION_TEXT.allGood]);
}

/** "Write a value", from the button or a scene. */
export async function writeValue(hub, fields = {}) {
  const target = String(fields.variable ?? '').trim();
  if (target === '') {
    throw new ActionFailure(localize(ACTION_TEXT.noVariableName));
  }
  const value =
    fields.value === undefined || fields.value === null ? '' : String(fields.value).trim();
  if (value === '') {
    throw new ActionFailure(localize(ACTION_TEXT.noValue));
  }
  const variable = hub.findVariable(target);
  if (!variable) {
    throw new ActionFailure(writeError('unknownVariable', { name: target }));
  }
  try {
    const result = await hub.write(variable, value);
    return localize(ACTION_TEXT.written, {
      name: result.name,
      value: JSON.stringify(result.value),
    });
  } catch (err) {
    if (err instanceof WriteError) {
      throw new ActionFailure(writeError(err.code, err.params));
    }
    throw err;
  }
}
