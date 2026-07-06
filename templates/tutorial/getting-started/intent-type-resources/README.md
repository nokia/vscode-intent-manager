    NSP Intent Design Tutorial
# 01 | Getting Started

|     |     |
| --- | --- |
| Description | Creating your first own intent-type |
| Skill Level | Beginner |
| Time to complete | 90min |
| Environment | NSP24.11 |

## Abstract
In this activity, you will create your first own intent-type. You will learn about the common structure of an intent-type, and how the intent engine will interface with the intent-type. You will create, update and delete intents for your intent-type and you will learn about the state-engine and life-cycle states.

## Objectives
 * Create your first own intent-type
 * Access logs from intent-script executions
 * Understand intent basic life-cycle stats and operations
 * Use NSP WebUI, vsCode and RESTCONF API (via WFM)

## Tutorial

### Create your first own intent-type
To simplify the creation, we use
 Visual Studio Code with the [Intent Manager Extension](https://marketplace.visualstudio.com/items?itemName=Nokia.nokia-intent-manager) installed.

After installing the vsCode extension open the extension settings to provide your NSP connection details (hostname or IP, port, username, and password). If you are planning to switch between multiple NSP systems, you may consider installing the [NSP Connect Extension](https://marketplace.visualstudio.com/items?itemName=Nokia.nsp-connect). Once this is done, you should see an entry `Intent Manager` in your workspace (sidebar: EXPLORER). If there are intent-types installed in your system, those are shown as directories under `Intent Manager`.

Right-click on `Intent Manager` to open the explorer/context menu and click on `Create Intent-Type`. Provide an unique name (for example: "learn2code") for your new intent-type, the author-name (that's you or your organization) and pick `basic` as template. Be aware, that intent-type names must consist of small caps, digits, dashes, and underscores only, while the first character must be a letter! At this point, we have not created anything in the network. We've just created our first intent-type in the intent-type catalogue. The intent-type is defined by its abstract model (YANG). It uses scripts and other resources to implement lifecycle operations, which are specific to the intent-type.

Intents are instances of intent-types and associated with an intent-type version. The intent configuration must match the intent-type data model. Conceptional it needs to be understood that intents are always created against a target, which is used as unique identifier. If intents need to be updated, audited, synchronized, or deleted the target that was used during creation must be provided.  Please note, that the target is not part of the abstract data-model! In the RESTCONF API it is used to define the schema-mountpoint, under which the intent-type data-model is accessible.

In this activity we are using identifiers as target, while the identifier must be unique. Using identifiers as target could be useful for service intents, while makeing the service-name the unique identifer. Depending on the usecase, the target could be a physical resource like a device or interface, which is meaningful for golden infrastructure configuration (day 1).

### Exploring Intent Manager

Open the NSP WebUI and navigate to the Intent Manager by selecting `Network Intents` from the hamburger menu. Double-click on the intent-type you've created. The list of `Intents` will open empty, as we did not create intents for our intent-type yet. By selecting `EDIT INTENT TYPE` you can see the components of the intent-type (GENERAL, TARGET, YANG, SCRIPT, RESOURCES). We are not using FORM and VIEWS in this activity. After checking the intent-type details, close the edit-form without providing updates.

####

### Understand intent basic life-cycle using the NSP WebUI

Follow the following steps using the __NSP WebUI__:
* Create an intent by providing a valid target
* Execute an audit
* Execute synchronize
* Update the desired network state and run audit/synchronize again
* Try to create another intent with the same identifier as target
* Try to create another intent with a different identifier as target

Check the logs as discussed under [Intent Manager Logs](#intent-manager-logs).

__Learnings__

When creating an intent one must select the desired `Network State`. Every intent-type should at least support the states `Activate` and `Not Present`. The implementation of `Suspended` is optional. In addition the WebUI offers custom states `Saved`, `Planned`, and `Deployed`. Under `Target Component(s)` the target identifier (mandatory) is entered. Finally, there is a checkbox to automatically `Synchronize` the intent after creation. This is because the system differentiates between intent edit operations (create/update/delete) and the deployment to the network. If the synchronize option is NOT selected, the intent will only be created/updated in the database. Typically this results in a misalignment between the actual and desired network configuration. The `Audit` function can be executed at any time to understand, if there are misalignments.

The synchronize method for your intent-type is just generating some logs, while nothing will be pushed to the network. Similar the audit method will statically return some misalignments. In consequence this intent-type is meant to help understanding the code structure and APIs being used.

Note, that the intent-type YANG model is empty and does not contain any leafs to provide intent specific configuration.

If you delete an intent, you've got the option to delete the intent from `Network+Controller`, `Controller` or `Network`. The default option is to delete from network and controller, which effectively (1) updates the desired state to `Not Present`, (2) executes a synchronize, and (3) deletes the intent from the NSP database.

### Intent Manager Logs

To access the logs, select `System Health` from the hamburger menu. From here you can navigate to `LOG VIEWER`. Select `Discover` and pick `nsp-mdc-logs-*`. By default, the WebUI filters for logs from the last 15min. OpenSearch has a query language called DQL to refine searches to your needs.

Alternatively you login into the `nsp-mdt-ac-0` pod using `k9s` or the `kubectl exec -it -n=nsp-psa-restricted nsp-mdt-ac-0 -- bash` command from a kubernetes control node. Open the karaf client by issuing the `bin/client` command. From here you can check the logs using the `log:tail` command. Check the log settings using the `log:get` command. You can increase the log-level of intent scripts  using the `log:set TRACE com.nokia.fnms.controller.ibn.impl.graal.GraalJSScriptedEngine` command.

You've may spotted the option to access the `Server Logs` from the explorer/context menu, while the logs are filted based on the intent(s) or intent-type(s) being selected (multi-select is supported). The output format contains less details than open-search webview and is opimized for developers. By default only logs from the last 10 minutes are displayed, however this can be changed in the extension settings. The log access uses open-search APIs, so independently how you trigger intent operations (via WebUI, vsCode or API) all activities are properly captured.

The `Intent Manager` context menu also has the option `Set log-level`. If you increase the log-level to `DEBUG` additional logs are generated on method execution and return.

### Understand intent basic life-cycle using vsCode

Using the Intent Manager extension, Visual Studio Code provides a virtual remote file-system that allows direct access to intent-types, views and intents of the connected NSP system. If you open an intent in an editor window one can see the desired network state in the status bar. The state can be changed from here, but also from the explorer/context menu.

All relevant operations like synchronize, and audits are directly accessible from the explorer/context menu, while multi-selection is widely possible. When running audits from vsCode, the output is rendered as webview providing similar functionality like the NSP WebUI.

Try different intent operations and retrieve the logs to see, how the intent-methods are invoked.

### Working with git

To create new intent-types using vsCode in your local file-system. Right-click on a folder in your workspace and select `Create intent-type`. You can also copy (or move) the intent-type to your file-system.

In the file-system an intent-type is stored in the same structure as in the virtual file-system. From the  the explorer/context menu you can upload intent-types (incuding existing view and intents) into Intent Manager. If the intent-type already exists, it will be updated otherwise created.

As vsCode natively integrates with git (gitlab or github), you should consider doing your development under git, while using the upload option whenever you want to test your changes.

### Understand intent basic life-cycle using RESTCONF API

For the sake of simplicity we are using the NSP Workflow Manager (WFM) to learn about the Intent Manager RESTCONF API. Alternatively you may consider using POSTMAN or curl. For NBI integration it is rather straight forward to build POSTMAN examples from the sample workflows we are using here.

Using WFM comes with the following advantages:
1) The WFM `nsp.https` action hides the auth-token handling from the developer.
2) The WFM can utilize k8s service-names to resolve RESTCONF API endpoints, while avoid providing IP address and port.
3) The WFM execution form supports suggests, which are supposed to be more user friendly.

To create a new intent, you can use the following workflow:

```yaml
version: '2.0'

intent_create:
  type: direct

  input:
    - intentType
    - identifier
   
  vars:
    data: '{"<% $.intentType %>:<% $.intentType %>": {}}'
   
  tasks:
    create:
      action: nsp.https
      input:
        url: https://restconf-gateway/restconf/data/ibn:ibn
        method: POST
        body:
          ibn:intent:
            target: "<% $.identifier %>"
            intent-type: "<% $.intentType %>"
            intent-type-version: 1
            required-network-state: active
            ibn:intent-specific-data: <% json_parse($.data) %>
      publish:
        result: <% task().result %>
```

To improve usability you can use the `AUTO GENERATE UI` feature to add an `Input Form` that enables you to pick your intent-type from a list. If you call the creation API using the same identifier twice, you will recognize that the request runs into an error. The `error-message` indicates, that an intent against the same target already exists.

To query an existing intent, the following workflow can be used:
```yaml
version: '2.0'

intent_details:
  type: direct

  input:
    - intentType
    - intent
    

  tasks:
    details:
      action: nsp.https
      input:
        url: https://restconf-gateway/restconf/data/ibn:ibn/intent=<% $.intent %>,<% $.intentType %>
      publish:
        result: <% task().result %>
```

The RESTCONF response is an object of type `ibn:intent` in JSON format. The most important attributes of `ibn:intent` are:
  * target
  * intentType
  * intentVersion
  * aligned
  * sync-timestamp
  * required-network-state

As the solution uses schema-mount, you will observe that under `intent-specific-data` a list of mounted YANG modules is contained (check: `ietf-yang-library`).

To delete an existing intent, the following workflow can be used:
```yaml
version: '2.0'

intent_delete:
  type: direct

  input:
    - intentType
    - intent

  tasks:
    delete:
      action: nsp.https
      input:
        url: https://restconf-gateway/restconf/data/ibn:ibn/intent=<% $.intent %>,<% $.intentType %>
        method: DELETE
      publish:
        result: <% task().result %>
```

### Try out some modifications using vsCode

Whenever you save changes to an intent-type script or resource in vsCode, files are automatically updated within Intent Manager. Therefore it is not recommended to connect the vsCode to a production system to apply live changes. Instead use your development environment for any intent-type design and test activities.

To update your intent-type code, following changes are recommended:
* Add additional log statements to your code
* Extend your intent-model by adding some optional leafs

## Complete
You have completed this tutorial.

## License

    Copyright 2025 Nokia
    Licensed under the BSD 3-Clause License.
    SPDX-License-Identifier: BSD-3-Clause
    Nokia logo is trademark of Nokia