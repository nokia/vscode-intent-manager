# Intent-type: {{ intent_type }}
_Note: created with vsCode extension for NSP Intent Manager_

|     |     |
| --- | --- |
| Description | Creating your first own intent-type! |
| Skill Level | Beginner |
| Time to complete | 90min |
| Environment | NSP24.8 |

## Abstract
In this activity, you will create your first own intent-type.
You will learn about the common structure of an intent-type, and how the intent engine will interface with the intent-type.
You will create, update and delete intents for your intent-type and you will learn about different desired states.

## Objectives
 * Creating your first own intent-type
 * Understand intent basic life-cycle stats and operations using WebUI, vsCode and RESTCONF API

## Tutorial

### Create your first own intent-type
To simplify the creation, we will use the Visual Studio Code with the [Intent Manager Extension](https://marketplace.visualstudio.com/items?itemName=Nokia.nokia-intent-manager) installed.

After installing the vsCode extension open the extension settings to provide your NSP connection details (host, port, user, password). Once this is done, you should see an entry `Intent Manager` in your workspace (sidebar: EXPLORER). If there are intent-types installed in your system, those are shown as directories under `Intent Manager`.

Right-click on `Intent Manager` to open the explorer/context menu and click on `Create Intent-Type`. Provide a unique name (for example: "hellograal") for your new intent-type, the author name (that's you or your organization) and pick `helloGraal` as template. Be aware, that intent-type names must consist of small caps, digits, dashes and underscores only, while the first character must be a letter! At this point, we have not created anything in the network. We've just created our first intent-type in the intent-type catalogue. The intent-type is defined by its abstract model (YANG). It uses scripts and other resources to implement intent lifecycle operations, which needs to be done by the intent-type developer/integrator and which is specific to the intent-type.

Intents are instances of intent-types and associated with an intent-type version. The intent configuration must match the intent-type data model. Conceptional it needs to be understood that intents are always created against a target, which is used as unique identifier. If intents need to be updated, audited, synchronized, or deleted the target that was used during creation must be provided. As a matter of consequence, there can only be one intent for a specific intent-type and target. Please note, that the target is not part of the abstract data-model! In the RESTCONF API it is used to define the schema-mountpoint, under which the intent-type data-model is dynamically linked.

In this activity we are using devices as targets. As target are the key for intents in this activity, you can only create one intent against each node. If an intent for a device already exists, the creation will fail. The script implements the method `suggestTargetDevices()` providing the operator with suggestions when creating new intents. This improves the usability, as operators could start typing and then select a device from the list.

Using devices (from network inventory) as target is typically used for infrastructure intents like Golden Configuration. Depending on the usecase, the target could be identifiers (numeric or string) which is typically used for service-intents (examples: service-id, service-name or RD/RT values). Finally, Intent Manager allows for targets that consist out of multiple attributes, while an example for this could be a combination of device and physical interface.

### Exploring Intent Manager

Open the NSP WebUI and navigate to the Intent Manager by selecting `Network Intents` from the hamburger menu. Double-click on the intent-type you've created. The list of `Intents` will open empty, as we did not create intents for our intent-type yet. By selecting `EDIT INTENT TYPE` you can see the components of the intent-type (GENERAL, TARGET, YANG, SCRIPT, RESOURCES). We are not using FORM and VIEWS in this activity. After checking the intent-type details, close edit form without providing updates.

Navigate back to the list of intent-types. From here, you can navigate to `Mediators`, while you will see the `MDC`, `NFM-P` and `NSP` mediator. Check the mediator details. To continue this exercise you must have some DEVICES listed.

From the hamburger menu now select `System Health`. From here you can navigate to LOG VIEWER (open-search). Select `Discover` and pick `nsp-mdc-logs-*`. The Intent Manager logs will be accessible from here. By default, the WebUI filters for logs from the last 15min. OpenSearch has a query language called DQL to refine searches to your needs.

Alternatively you login into the `nsp-mdt-ac-0` pod using `k9s` or the `kubectl exec -it -n=nsp-psa-restricted nsp-mdt-ac-0 -- bash` command from the kubernetes node. Open the karaf client by issuing the `bin/client` command. From here you can check the logs using the `log:tail` command. Check the log settings using the `log:get` command. You can increase the log-level of intent scripts  using the `log:set TRACE com.nokia.fnms.controller.ibn.impl.graal.GraalJSScriptedEngine` command.

### Understand intent basic life-cycle using the NSP WebUI

Follow the following steps using the __NSP WebUI__:
* Create an hellograal intent against one of your nodes
* Execute an audit
* Execute synchronize
* Update the desired network state and run audit/synchronize again
* Try to create another hellograal intent against another node
* Try to create another hellograal intent against the same node

Check the logs as discussed under [Exploring Intent Manager](#exploring-intent-manager).

__Learnings__

When creating an intent one must select the desired `Network State`. Every intent-type should at least support the states `Activate` and `Not Present`. The implementation of `Suspended` is optional. In addition the WebUI offers the custom states `Saved`, `Planned`, and `Deployed`. Under `Target Component(s)` the target device is entered. The suggest helper improves the usability by providing suggestions once you start typing. Finally, there is a checkbox to automatically `Synchronize` the intent after creation. This is because the system differentiates between intent edit operations (create/update/delete) and the deployment to the network. If the synchronize option is NOT selected, the intent will only be created/updated in the database. Typically this results in a misalignment between the actual and desired network configuration. The `Audit` function can be executed at any time to understand, if there are misalignments.

The synchronize method for your intent-type is just generating some logs, while nothing will be pushed to the network. Similar the audit method will statically return some misalignments. In consequence this intent-type is meant to help understanding the code structure and APIs being used.

Note, that the intent-type YANG model is empty and does not contain any leafs to provide intent specific configuration.

If you delete an intent, you've got the option to delete the intent from `Network+Controller`, `Controller` or `Network`. The default option is to delete from network and controller, which effectively (1) updates the desired state to `Not Present`, (2) executes a synchronize, and (3) deletes the intent from the NSP database.

### Understand intent basic life-cycle using vsCode

Using the Intent Manager extension, Visual Studio Code provides a virtual remote file-system that allows direct access to intent-types, views and intents of the connected NSP system. If you open an intent in an editor window one can see the desired network state in the status bar. The state can be changed from here, but also from the explorer/context menu.

All relevant operations like synchronize, and audits are directly accessible from the explorer/context menu, while multi-selection is widely possible. If you prefer editing files on your local system, you can copy (or move) the intent-type to a local folder. From here, the explorer/context menu allows to upload intent-types and intents. As vsCode natively integrates with git (gitlab or github), you should consider doing your development under git, while using the upload option whenever you want to validate your changes.

When running audits from vsCode, the output is rendered as webview providing similar functionality like the NSP WebUI

You may spot the option to access the `Server Logs` from the explorer/context menu, while the logs are filted based on the intent(s) or intent-type(s) being selected. Again, multi-select is supported. The output format contains less details than open-search webview and is opimized for developers. By default only logs from the last 10 minutes are displayed, however this can be changed in the extension settings. The log access uses open-search APIs, so independently how you trigger intent operations (via WebUI, vsCode or API) all activities are properly captured.

Try different intent operations and retrieve the logs to see, how the intent-methods are invoked.

### Understand intent basic life-cycle using RESTCONF API

For the sake of simplicity we are using the NSP Workflow Manager (WFM) to learn about the Intent Manager RESTCONF API.
Alternatively you may consider using POSTMAN or curl.
For NBI integration it is rather straight forward to build POSTMAN examples from the sample workflows we are using here.

Using WFM comes with the following advantages:
1) The WFM `nsp.https` action hides the auth-token handling from the developer.
2) The WFM can utilize k8s service names to resolve RESTCONF API endpoints, while avoid providing IP address and port.
3) The WFM execution form supports suggests, which are supposed to be more user friendly.

To create a new intent, you can use the following workflow:

```yaml
version: '2.0'

intent_create:
  type: direct

  input:
    - neId
    - intentType
   
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
            target: "<% $.neId %>"
            intent-type: "<% $.intentType %>"
            intent-type-version: 1
            required-network-state: active
            ibn:intent-specific-data: <% json_parse($.data) %>
      publish:
        result: <% task().result %>
```

To improve usability you can use the `AUTO GENERATE UI` feature to add an `Input Form` that enables you to pick the device from a list. If you call the creation API against the same target twice, you will recognize that the request runs into an error. The `error-message` indicates, that an intent against the same target already exists.

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

Copyright 2024 Nokia
Licensed under the BSD 3-Clause License.
SPDX-License-Identifier: BSD-3-Clause
Nokia logo is trademark of Nokia