# {{ intent_type }}
*created by {{author}}*

This is an **abstract intent-type** applying IPL!nk principles.
It uses the next-generation JavaScript engine (GraalJS) added in NSP24.8.

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

To adjust the intent-type to the specific needs of your use-case, consider adding/changing the following:
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
* Limited error-handling (FTL)
* Nodes with NETCONF/gRPC support only (requires MDC mediation)

## EXPERIMENTAL FEATURES
* ignore-children (pre-approved misalignments)
* operation merge and delete
* intend-based assurance