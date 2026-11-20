// -----------------------------------------------------------------------------
// The "OPC UA server" dashboard widget: the first values of the server as
// live tiles, and the health of the link — connected or not, security, how
// many variables are in a good state, the last value received. What a plain
// device box cannot say.
//
// Budget of the core: 8 components at most; here up to 6 tiles + 1 status.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { pick } from './i18n.js';

export const WIDGET_KEY = 'server_overview';
const MAX_TILES = 6;

export const TEXT = {
  pick: {
    en: 'Choose the OPC UA server in the widget settings.',
    fr: 'Choisissez le serveur OPC UA dans les réglages du widget.',
    de: 'Wähle den OPC-UA-Server in den Einstellungen des Widgets.',
    es: 'Elija el servidor OPC UA en los ajustes del widget.',
  },
  unknown: {
    en: 'This server is no longer in the integration configuration.',
    fr: "Ce serveur n'est plus dans la configuration de l'intégration.",
    de: 'Dieser Server ist nicht mehr in der Konfiguration der Integration.',
    es: 'Este servidor ya no está en la configuración de la integración.',
  },
  link: { en: 'Link', fr: 'Liaison', de: 'Verbindung', es: 'Enlace' },
  connected: { en: 'Connected', fr: 'Connecté', de: 'Verbunden', es: 'Conectado' },
  disconnected: { en: 'Disconnected', fr: 'Déconnecté', de: 'Getrennt', es: 'Desconectado' },
  waiting: { en: 'Connecting', fr: 'Connexion', de: 'Verbindet', es: 'Conectando' },
  security: { en: 'Security', fr: 'Sécurité', de: 'Sicherheit', es: 'Seguridad' },
  none: { en: 'None', fr: 'Aucune', de: 'Keine', es: 'Ninguna' },
  sign: { en: 'Signed', fr: 'Signé', de: 'Signiert', es: 'Firmado' },
  sign_and_encrypt: {
    en: 'Signed, encrypted',
    fr: 'Signé, chiffré',
    de: 'Signiert, verschlüsselt',
    es: 'Firmado, cifrado',
  },
  variables: {
    en: 'Good variables',
    fr: 'Variables bonnes',
    de: 'Gute Variablen',
    es: 'Variables buenas',
  },
  lastValue: { en: 'Last value', fr: 'Dernière valeur', de: 'Letzter Wert', es: 'Último valor' },
  never: { en: 'Never', fr: 'Jamais', de: 'Nie', es: 'Nunca' },
};

/**
 * The content of the widget.
 * @param {import('./hub.js').OpcuaHub} hub
 * @param {{ settings?: object, language?: string }} request
 */
export function overviewContent(hub, { settings = {}, language = 'en' } = {}) {
  const lang = ['en', 'fr', 'de', 'es'].includes(language) ? language : 'en';
  if (!settings.device) {
    return { ttl_seconds: 300, components: [{ type: 'text', variant: 'body', text: TEXT.pick }] };
  }
  if (!hub.ids || settings.device !== hub.ids.device) {
    return {
      ttl_seconds: 300,
      components: [{ type: 'text', variant: 'body', text: TEXT.unknown }],
    };
  }
  const created = (hub.gladys.devices ?? []).find(
    (device) => device.external_id === settings.device,
  );
  const known = new Set((created?.features ?? []).map((feature) => feature.external_id));
  const components = hub
    .features()
    .map(({ feature }) => feature)
    .filter((feature) => feature.category !== 'text')
    .filter((feature) => known.size === 0 || known.has(feature.external_id))
    .slice(0, MAX_TILES)
    .map((feature) => ({ type: 'value', device_feature: feature.external_id }));

  const { connected, lastValueAt } = hub.status;
  const { good, total } = hub.counts();
  const items = [
    {
      label: TEXT.link,
      value: pick(
        connected === true
          ? TEXT.connected
          : connected === false
            ? TEXT.disconnected
            : TEXT.waiting,
        lang,
      ),
      color:
        connected === true
          ? WIDGET_COLORS.SUCCESS
          : connected === false
            ? WIDGET_COLORS.DANGER
            : WIDGET_COLORS.NEUTRAL,
    },
    { label: TEXT.security, value: pick(TEXT[hub.config.security_mode] ?? TEXT.none, lang) },
    {
      label: TEXT.variables,
      value: `${good}/${total}`,
      color: total > 0 && good < total ? WIDGET_COLORS.WARNING : WIDGET_COLORS.NEUTRAL,
    },
    {
      label: TEXT.lastValue,
      value: lastValueAt ? clock(lastValueAt, lang) : pick(TEXT.never, lang),
    },
  ];
  components.push({ type: 'status', items });
  return { ttl_seconds: 30, components };
}

/** "14:32:05" in the time zone of Gladys (the supervisor sets TZ). */
function clock(timestamp, lang) {
  return new Intl.DateTimeFormat(lang, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(timestamp));
}
