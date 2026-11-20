# OPC UA

Lire et écrire les variables d'un serveur OPC UA depuis Gladys : automates
(Siemens S7-1200/1500, Beckhoff TwinCAT, WAGO, B&R, Schneider), passerelles
(Kepware, Softing, Unified Automation) ou tout serveur OPC UA de votre réseau.

> Développée sans le matériel : vos retours sont les bienvenus. L'intégration a
> été testée contre le simulateur OPC PLC de Microsoft, pas contre un vrai
> automate.

## Ce que vous obtenez

- Un appareil Gladys pour le serveur, une fonctionnalité par variable déclarée :
  nombres (avec leur unité), valeurs tout-ou-rien et textes.
- Des valeurs mises à jour par **abonnement** : le serveur signale chaque
  changement, rien n'est interrogé en boucle.
- L'écriture, désactivée par défaut : un interrupteur ou une consigne du
  tableau de bord, un bouton de configuration et une action de scène écrivent
  les variables que vous avez autorisées.
- Trois déclencheurs de scène (serveur perdu, serveur revenu, variable en
  mauvais état) et un widget **Serveur OPC UA** pour le tableau de bord.

## Prérequis

- Gladys 5.1 ou plus récent.
- Un serveur OPC UA joignable depuis Gladys en TCP (`opc.tcp://`), avec une
  adresse IP fixe. Sur un Siemens S7-1500, activez le serveur OPC UA de la CPU
  dans TIA Portal et autorisez l'accès aux blocs de données à lire.

## Configuration

### Serveur

1. Saisissez l'**adresse du serveur** : `opc.tcp://`, l'adresse IP et le port,
   par exemple `opc.tcp://192.168.1.50:4840` (4840 par défaut, 4852 sur
   Beckhoff, 49320 sur Kepware).
2. Choisissez le **mode de sécurité**, et un **nom d'utilisateur** et un **mot
   de passe** si le serveur n'accepte pas l'accès anonyme.
3. Enregistrez, puis cliquez sur **Parcourir le serveur** pour lister ses
   variables.

Gladys identifie le serveur par l'adresse et le port saisis ici : les changer
crée un nouvel appareil.

### Sécurité et certificat

- **Aucune** : ni signature, ni chiffrement. Acceptable sur un réseau machine
  isolé.
- **Signer** ou **Signer et chiffrer**, avec la **politique de sécurité**
  acceptée par le serveur (Basic256Sha256 est la plus courante). Gladys crée
  son propre certificat (`Gladys Assistant OPC UA`, rangé dans les données de
  l'intégration) à la première connexion. La plupart des serveurs rejettent un
  certificat inconnu : approuvez-le dans le serveur (TIA Portal : gestionnaire
  de certificats, Kepware : OPC UA Configuration Manager, TwinCAT : dossier
  `rejected` déplacé dans `trusted`), puis attendez une minute, Gladys
  réessaie toute seule.
- Le certificat du serveur est accepté à la première connexion, puis conservé.
- Avec le mode Aucune, un mot de passe peut traverser le réseau en clair :
  préférez Signer et chiffrer quand le serveur en demande un.

### Variables

Le champ **Variables** contient des entrées séparées par des points-virgules :

```
Nom: NodeId [nature] [write] [options]
```

```
Départ: ns=3;s="Boiler"."FlowTemp" temperature; Pompe: ns=3;s="Boiler"."Pump" switch; Mode: ns=2;s=Plant.Mode write
```

- **NodeId** : copié depuis **Parcourir le serveur** : `ns=3;s=Texte` (chaîne),
  `ns=2;i=1002` (nombre), `g=` (GUID), `b=` (opaque). Le point-virgule interne
  d'un NodeId est compris. Un NodeId s'arrête au premier espace, sauf entre
  guillemets (les noms Siemens comme `ns=3;s="DB1"."Temp"` fonctionnent tels
  quels). Les NodeId en `nsu=` ne sont pas pris en charge.
- **Nom** : facultatif ; sans lui, la variable prend son nom sur le serveur.
- **Nature** (facultative) : `temperature`, `humidity`, `pressure`, `power`,
  `energy`, `production`, `solar_power`, `grid_power`, `voltage`, `current`,
  `battery`, `volume`, `duration`, `value`, `binary`, `switch`, `setpoint`,
  `text`. Sans nature : un booléen est une valeur tout-ou-rien, un nombre une
  valeur simple, une chaîne ou une date un texte. `energy` et `production` sont
  publiées en kWh, pour que Gladys calcule la consommation et son coût.
- **write** : la variable peut être écrite depuis Gladys (voir plus bas).
  `switch` et `setpoint` l'impliquent.
- **Options** : `scale=0.1` et `offset=-40` (valeur = brut × scale + offset),
  `unit=kWh`, `min=` et `max=` (bornes d'affichage), `precision=1` (décimales).

Jusqu'à 100 variables. Les tableaux et les structures ne sont pas pris en
charge. **Vérifier la configuration** liste les entrées erronées ou absentes du
serveur.

### Écriture

L'écriture reste désactivée tant que **Autoriser l'écriture** n'est pas activé.
Ensuite :

- une variable déclarée `switch` (booléen) ou `setpoint` (température) reçoit
  une commande sur le tableau de bord. Pour Gladys, ce sont des entrées
  tout-ou-rien et des consignes de chauffe-eau, jamais des interrupteurs ni des
  thermostats : les assistants vocaux ne les pilotent pas ;
- toute variable déclarée `write` peut être écrite par le bouton **Écrire une
  valeur** et l'action de scène **Écrire une variable OPC UA**, par son nom ou
  son NodeId : nombres (scale et offset inversés, plage du type entier
  vérifiée), 0/1 ou true/false, textes pour une variable String.

Le serveur doit aussi autoriser l'écriture. Écrire une mauvaise variable peut
arrêter ou abîmer une installation : ne déclarez `write` que ce que Gladys doit
modifier.

## Actions

- **Parcourir le serveur** : liste jusqu'à 60 variables (NodeId, type, accès)
  depuis le dossier Objects, ou depuis le NodeId d'un dossier donné comme nœud
  de départ.
- **Vérifier la configuration** : si le serveur est connecté, avec quelle
  sécurité, et les erreurs entrée par entrée.
- **Écrire une valeur** : écrit une valeur dans une variable déclarée.

## Scènes

- **Le serveur OPC UA est perdu** (déclencheur), avec l'erreur en variable.
- **Le serveur OPC UA est revenu** (déclencheur).
- **Une variable OPC UA passe en mauvais état** (déclencheur) : le serveur
  signale un mauvais état (capteur en défaut, entrée perdue), avec le nom de
  la variable et l'état.
- **Écrire une variable OPC UA** (action).

Les valeurs elles-mêmes sont des fonctionnalités : utilisez les déclencheurs
et conditions habituels de Gladys sur la valeur d'un appareil pour les seuils.

## Tableau de bord

Le widget **Serveur OPC UA** affiche les six premières valeurs et l'état de la
liaison : connecté ou non, sécurité, variables en bon état, heure de la
dernière valeur.

## Limites

- Un seul serveur par intégration.
- Gladys accepte 300 valeurs par minute : les valeurs partent à chaque
  intervalle d'échantillonnage, ou moins souvent avec beaucoup de variables
  (100 variables : toutes les 25 s). Seuls les changements partent, et une
  valeur inchangée toutes les 6 heures.
- Le conteneur n'a pas de diffusion réseau : pas de découverte automatique des
  serveurs, saisissez l'adresse.

## Dépannage

- **Le serveur ne répond pas** : vérifiez l'adresse et le port, et que
  l'automate accepte les connexions depuis la machine Gladys (pare-feu).
- **Le serveur refuse le certificat de Gladys** : approuvez-le dans le
  serveur, voir plus haut.
- **Le serveur refuse l'utilisateur ou le mot de passe** : vérifiez-les, ou le
  réglage d'accès anonyme du serveur.
- **Pas de point d'accès avec ce mode de sécurité** : choisissez le mode et la
  politique proposés par le serveur.
- Journaux détaillés : réglez `LOG_LEVEL=debug` sur l'intégration.

## Crédits

Construite sur [node-opcua](https://github.com/node-opcua/node-opcua) (MIT)
d'Etienne Rossignon et ses contributeurs. OPC UA est un standard de l'OPC
Foundation. Cette intégration n'est affiliée ni à l'OPC Foundation, ni à aucun
fabricant d'automates.
