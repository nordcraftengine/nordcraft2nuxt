# Third-party notice

`nordcraft2nuxt` is maintained in the Nordcraft GitHub organization. It does
**not** import, bundle, or depend on any Nordcraft package at build time or
runtime.

The Nordcraft engine is open source under the Apache License 2.0:
https://github.com/nordcraftengine/nordcraft

Some standard-library formula behavior and CSS/theme rules were implemented
with reference to that open-source implementation to preserve compatibility
(for example Nordcraft truthiness, path traversal, numeric size scaling, node
reset behavior, and theme property rendering). Where behavior is subtle, this
project aims to match it.

Generated apps may reference external resources from the source project,
including images, fonts, videos, and third-party Nordcraft custom-element
scripts hosted on CDNs. Those resources are not included in this repository or
in the generated app; they remain subject to their own licenses and terms.

Nordcraft is a trademark of its respective owners.
