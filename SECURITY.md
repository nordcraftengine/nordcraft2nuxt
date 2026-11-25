# Security policy

## Supported versions

Security fixes are applied to the latest released version on the `main` branch.
Older versions may not receive fixes.

## Reporting a vulnerability

Please do **not** open a public issue for a security problem.

Use GitHub's private vulnerability reporting:
https://github.com/nordcraftengine/nordcraft2nuxt/security/advisories/new

Include:

- a description of the issue and affected version
- a minimal reproduction or proof of concept
- the expected impact
- any suggested mitigation

You will receive an acknowledgement as soon as possible. Please allow time
for a fix and coordinated disclosure before publishing details.

## Scope notes

`nordcraft2nuxt` compiles project JSON that can contain arbitrary custom JavaScript,
URLs, and API definitions. Treat project exports from untrusted sources as
untrusted code. The generated API proxy only forwards requests to
compile-time-allowlisted literal origins; dynamic base URLs are not proxied.
