# NOKIA Intent Manager vsCode extension 
![vsCode extension settings](https://raw.githubusercontent.com/nokia/vscode-intent-manager/main/media/NSP_Logo.png)

This vsCode extension connects to Nokia NSP Intent Manager to facilitate Intent development and delivery.

> [!WARNING]
> **Known Issues and Limitations:**
> * Intent decorations are automatically updated by audit/sync methods to reduce server load. In some error scenarios the displayed alignment state does not reflect the server state. Consider to trigger a manual resync to reload alignment states from the backend server.
> * `process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"` disables SSL verification (not recommended).
> * Log access (opensearch) is on-demand. Limits apply (check settings).
> * No local validation of intent-types. NSP will validate changes during upload/save.
> * If running NSP releases 23.11 and prior, some of the functionality may not be supported due to API restrictions

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

### Fixed Templates (Experimental)

The extension provides an experimental fixed-template generator intended for model-driven devices such as Nokia SR OS and SR Linux. This capability mimics NFMP PolicyManager-like operations while using the native NSP Intent Manager (IBN engine).

Unlike product intent-types that expose control over all device-level attributes, fixed templates are generated for specific deployment patterns. The design favors quick onboarding and operational efficiency, with intentionally limited post-generation flexibility.

High-level workflow:
* Capture selected configuration subtrees from a reference device to generate a fixed intent-type.
* Use a JSON generator definition file named `intenttypename.ifxgen`.
* Deploy the generated configuration to other devices and use audit/sync for drift management.
* Update captured subtrees as needed and regenerate to create a new intent-type version.
* Control rollout of new versions via standard Intent Manager operations and IBN policies.

Generator definition example (`intenttypename.ifxgen`):

```json
{
    "description": "Golden Configuration for Nokia SR OS devices (MD MODE)",
    "device": "1034::cafe:1",
    "contexts": {
        "sap-ingress 100": {
            "path": "/nokia-conf:/configure/qos/sap-ingress=100",
            "exclude": ["description"]
        },
        "sap-ingress 200": {
            "path": "/nokia-conf:/configure/qos/sap-ingress=200"
        },
        "sap-ingress 300": {
            "path": "/nokia-conf:/configure/qos/sap-ingress=300"
        },
        "services": {
            "path": "/nokia-conf:/configure/service"
        }
    }
}
```

Advanced use-cases:
* Add parameters to the intent-model and templatize captured configuration (FTL/JSON).
* Reuse or combine FTL/JSON templates across different NOS variants for multi-vendor use-cases.

> [!IMPORTANT]
> Fixed-template generation is experimental. The generator and generated intent-types are not officially supported by Nokia.
>
> Generated intent-types work with the native Intent Engine (Intent Manager API/UI), but they are not compatible with intent-based applications such as IBSF and ICM. As a result, value-add application features are not available for those generated intent-types.

## Community Support and Contributions

This project is community-driven, and support is best-effort. Please raise GitHub issues for bugs, feature ideas, documentation gaps, and usability feedback so improvements can be tracked transparently.

Contributions are highly encouraged. Pull requests that fix bugs, improve stability, add features, enhance templates, or refine documentation are welcome.

The extension has not been scale tested for large production deployments and is primarily intended to support the developer journey with a limited number of intent-types and instances.

Extensive logging is available for communication between this vsCode plugin and NSP IM. Check "OUTPUT" for troubleshooting details when reporting issues.

## Build VSIX

Please make sure, you've got the following installed in your environment:

```
# npm install -g typescript
# npm install -g @vscode/vsce
```

Installation can be validated like this:

```
% npm list -g             
/usr/local/lib/node_modules/node/lib
├── @vscode/vsce@2.27.0
└── typescript@5.4.5
```

Before you compile and build the distribution, make sure all depended modules
are installed:

```
% npm install .
% npm list
nokia-intent-manager@2.1.1 ~/dev/vscode-intent-manager
├── @types/node@18.19.34
├── @types/vscode@1.90.0
├── @typescript-eslint/eslint-plugin@6.21.0
├── @typescript-eslint/parser@6.21.0
├── @vscode/codicons@0.0.36
├── base-64@1.0.0
├── esbuild@0.21.5
├── eslint@8.57.0
├── lodash@4.17.21
├── node-fetch@2.7.0
├── nunjucks@3.2.4
├── typescript@5.4.5
├── vscode-uri@3.0.8
├── vse@0.5.1
└── yaml@2.4.5
```

To see all dependencies, you can run `npm list --all`.
In cases of any issues, visit the `npm doctor`.

To compile and generate the VSIX for installation, run:

    vsce package

## Extension Settings and Usage

### General Settings 

To configure the extension, you need to configure the following attributes in VsCode Extension Settings.

```
ctrl+shift+p > Preferences: Open Settings > Extensions > Intent Manager
```

* `Intent Manager > Parallel Operations: Enable`: Improve performance by running things in-parallel (EXPERIMENTAL)
* `Timeout`: Client-side timeout for NSP API calls
* `Ignore Labels`: Hide intent-types from the user based on labels (helps to focus)

### Connect to NSP IM

To connect to an NSP IM, you need to configure the following attributes in VsCode **workspace** settings:

```
ctrl+shift+p > Preferences: Open Workspace Settings > Extensions > Intent Manager
```

* `NSPIP`: IP-address or hostname of the NSP server
* `User`: NSP username to be used
* `Password`: NSP password to be used (password is hidden, using vsCode secrets)
* `Port`: Usage of port 443 is recommended

## Release Notes

See release changes in Changelog.

## Contributors

* [Alejandro Aguado](mailto:alejandro.aguado_martin@nokia.com)
* [Sven Wisotzky](mailto:sven.wisotzky@nokia.com)

## Important links

### NOKIA | Network Developer Portal
* [NSP Programmable Automation](https://network.developer.nokia.com/learn/24_8/programming)

**Enjoy!**