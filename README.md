# NOKIA Intent Manager vsCode extension 

This vsCode extension connects to Nokia NSP IM to facilitate Intent development and delivery.

## License

Copyright 2024 Nokia
Licensed under the BSD 3-Clause License.
SPDX-License-Identifier: BSD-3-Clause
Nokia logo is trademark of Nokia

## Features

The vsCode extension for NSP Intent Manager allows the user to:
* Virtual remote file system to access intent-types and intents.
* Create, Update, Delete operations for intent-types and intents.
* Download intent-types (including resources).
* Upload intent-types from local file-system (git)
* Code snippets to accelerate coding.
* Retrieve logs from OpenSearch (filtered by intent-types and intents)
* Cross navigate to NSP WebUI in context of intent-types and intents
* Multi-target operations (sync, audit, set-state, logging)
* Deletion of intent-types including intents (confirmation dialogue)

This project is community-driven. This means that support is best-effort coming from the community
(i.e. anyone with access to the code extension) and contributions from the community are welcome at any time.

As such, this tool has not been scale tested and it is meant to help in the developer journey with a
limited number of intent-types and instances, but it is not designed to work in a production network setup.

Extensive logging is available for all communication between this vsCode plugin and NSP IM.
Check "OUTPUT" for more details.

## Extension Settings

To make the extension work, make sure you configure the following attributed in the extension configuration:

* `NSP IP address`: Ip address of the remote NSP server.
* `NSP user`: User name.
* `NSP password`: User's Password (stored as vsCode secret)

> [!WARNING]
> * Intent decorations are automatically updated by audit/sync methods to reduce server load. In some error scenarios the displayed alignment state does not reflect the server state. Consider to trigger a manual resync to reload alignment states from the backend server.
> * `process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"` disables SSL verification (not recommended).
> * By changing the extension config, the data does not get updated. User needs to reload vsCode to get config updated.
> * OpenSearch logs retrieved filtering by target and limited to 1000 logs and 10min.
> * No local validation. NSP will validate changes during upload/save.
> * If running NSP releases 23.11 and prior, some of the functionality may not be supported due to API restrictions

## Release Notes

See release changes in Changelog.

## Contributors

* [Alejandro Aguado](mailto:alejandro.aguado_martin@nokia.com)
* [Sven Wisotzky](mailto:sven.wisotzky@nokia.com)

## Important links

* [Developer portal](https://network.developer.nokia.com/learn/23_4/network-programmability-automation-frameworks)

**Enjoy!**