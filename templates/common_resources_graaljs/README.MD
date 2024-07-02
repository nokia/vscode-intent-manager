# {{ intent_type }}
*created by {{author}}*

This is an **abstract intent-type** applying IPL!nk principles.
It uses the next-generation JavaScript engine (GraalJS) planned to be added in NSP24.8.

## DISCLAIMER
**THIS INTENT-TYPE IS FOR RESEARCH/STUDY ONLY!**

## APPLY YOUR CHANGES
Following files are considered common framework files:<br/>
**DON'T MODIFY THOSE FILES!!!**
```
  intent-type-resources
  └── common
      ├── CalloutHandler.mjs
      ├── IntentHandler.mjs
      ├── IntentLogic.mjs
      ├── ResourceAdmin.mjs
      └── patch.ftl
```

To adjust the intent-type to the specific needs of your use-case, consider changing the following:
```
  meta-info.json
  script-content.mjs
  intent-type-resources
  ├── README.MD
  ├── OpenConfig.ftl
  ├── SR OS.ftl
  ├── SRLinux.ftl
  ├── default.viewConfig
  └── state.ftl
  yang-modules
  └── *.yang
```

The intent-target definition is contained in the `meta-info.json`. The `script-content` contains the
business logic to drive audit and sync operations. The input-form can be customized using the
`default.viewConfig`.

## RESTRICTIONS
* Performance constraints apply for audits
* Limited error-handling (FTL, ...)
* Requires MDC mediation (devices with NETCONF or gRPC support)

## EXPERIMENTAL FEATURES
* operation merge and delete
* ignore-children
* intend-based assurance
