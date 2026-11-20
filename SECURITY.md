# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

What the integration keeps and sends:

- `/data/pki`: the private key and certificate of the OPC UA client, created on
  the first connection, and the server certificates accepted on first use
  (trust on first use: Gladys has no screen to approve one by hand).
- `/data/opcua-variables.json`: the type and access of each declared variable,
  no secret.
- The OPC UA password is stored by Gladys with the configuration (a `secret`
  field), never logged nor written under `/data`. With the security mode None
  it may cross the network in clear text.
- Network: only the TCP connection to the server address typed by the user. No
  cloud service, no inbound port.
- Writes reach the server only when the user turned on "Allow writing", and only
  for the variables declared `write`.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
the OPC UA servers and PLCs the integration talks to, and the node-opcua library
(report to [its project](https://github.com/node-opcua/node-opcua)).
