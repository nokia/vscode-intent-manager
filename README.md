# NOKIA Intent Manager vsCode extension 

This vsCode extension connects to Nokia NSP IM to facilitate Intent development and delivery.

## License

Copyright 2023 Nokia
Licensed under the BSD 3-Clause License.
SPDX-License-Identifier: BSD-3-Clause
Nokia logo is trademark of Nokia

## Features

The vsCode extension for NSP IM allows a user to:

* Connect to a remote Intent Manager.
* Download the full intent type and intent list.
* Create new intent types, clone, create new versions and delete.
* Modify and automatically upload changes in scripts, resources, etc.
* Access to few example snippets.
* Create (copying) intents. Update, save, audit, change network status.
* Retrieve logs from OpenSearch for a particular intent instance (applicable only for log class).
* Access IM with the right pointers to intents and intent types.
* Do all abovementioned actions on a local repository (local folder, git).

This project is community-driven. This means that support is best-effort coming from the community (i.e. anyone with access to the code extension) and contributions from the community are welcome at any time.

As such, this tool has not been scale tested and it is meant to help in the developer journey with a limited number of intent-types and instances, but it is not designed to work in a production network setup.

## Requirements

This package uses YAML, FETCH, vscode-URI and base-64 packages. For FETCH, it is importan to install 2.6.6 version. See other requirements in package.json.

## Extension Settings

To make the extension work, make sure you configure the following attributed in the extension configuration:

* `NSP IP address`: Ip address of the remote NSP server.
* `NSP user`: User name.
* `NSP password`: User's Password.

## Known Issues and Limitations

* First version. Will require deeper error control.
* `process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"` disbles SSL verification (not recommended).
* By changing the extension config, the data does not get updated. User needs to reload vsCode to get config updated.
* No local validation (as with the WFM extension).
* OpenSearch logs retrieved filtering by target and limited to 20 logs. Additional tests required. Explore other tracing options.
* Local upload only available from meta-info.json for the entire intent-type. If files are missing, they may get removed from NSP.

## Potential improvements

* Allow intent creation (requires investigation): Right now, if an intent exists, a developer could create a local copy, modify and upload one (or many) intents to the specific folder. However, if no intent exists, there is no graphic representation of the intput attributes, so we recommend that the user navigates to IM for this.
* Better logs / traces (even across NSP components).
* Connect to ICM intent generator: potentially create a new functionality that sends the node's json config to the ICM generator tool and automatically uploads the intent-type to IM.
* Provide a wider snippets catalogue: this will require input on the most commonly developed code structures to make them available as snippets.
* Multi-select audit and synchronize

## Release Notes

See release changes in Changelog.

## Contributors

* [Alejandro Aguado](mailto:alejandro.aguado_martin@nokia.com)
* [Sven Wisotzky](mailto:sven.wisotzky@nokia.com)

## Important links

* [Developer portal](https://network.developer.nokia.com/learn/23_4/network-programmability-automation-frameworks)


**Enjoy!**
