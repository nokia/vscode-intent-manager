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
  ├── mappers
  |   ├── *.ftl
  |   └── *.mjs
  ├── default.viewConfig
  └── icm_descriptor.json
  yang-modules
  └── *.yang
```

The intent-target definition is contained in the `meta-info.json`. The `script-content` contains the
business logic to drive audit and sync operations. The input-form can be customized using the
`default.viewConfig`.

## RESTRICTIONS
* Nodes with NETCONF/gRPC support only
* Pickers/suggest for nodes and ports (from inventory) are limited to a maximum of 1000 entries

## EXPERIMENTAL FEATURES
* ignore-children (pre-approved misalignments)
* operation merge and delete
* intend-based assurance