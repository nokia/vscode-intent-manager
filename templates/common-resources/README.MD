# {{ intent_type }}
*created by {{author}}*

This is an **abstract intent-type** applying IPL!nk principles.

## DISCLAIMER
**THIS INTENT-TYPE IS FOR RESEARCH/STUDY ONLY!**

## APPLY YOUR CHANGES
Following files are considered common framework files:<br/>
**DON'T MODIFY THOSE FILES!!!**
```
  intent-type-resources
  ├── patch.ftl
  ├── utils.js
  ├── utils_entrypoints.js
  └── utils_resources.js
```

To adjust the intent-type to the specific needs of your use-case, consider changing the following:

```
  meta-info.json
  script-content.js
  intent-type-resources
  ├── README.MD
  ├── OpenConfig.ftl
  ├── SR OS.ftl
  ├── SRLinux.ftl
  ├── default.viewConfig
  ├── state.ftl
  ├── utils_callouts.js
  yang-modules
  └── *.yang
```

The intent-target definition is contained in the `meta-info.json`. The `script-content` contains the
business logic to drive audit and sync operations. The input-form can be customized using the
`default.viewConfig` and `utils_callouts.js`.

## RESTRICTIONS
* Performance constraints apply for audits
* Limited error-handling (FTL, ...)
* Implementation is not thread-safe (parallel sync/audits)
* Requires MDC mediation (devices with NETCONF or gRPC support)

## EXPERIMENTAL FEATURES
* operation merge and delete
* ignore-children
* intend-based assurance
