# Change Log

All notable changes to the "nokia-intent-manager" extension are documented in this file.

## [0.0.1]

Initial release:
* Connect to a remote Intent Manager.
* Download the full intent type and intent list.
* Create new intent types, clone, create new versions and delete.
* Modify and automatically upload changes in scripts, resources, etc.
* Access to few example snippets.
* Create (copying) intents. Update, save, audit, change network status.
* Retrieve logs from OpenSearch for a particular intent instance (applicable only for log class).
* Access IM with the right pointers to intents and intent types.
* Do all abovementioned actions on a local repository (local folder, git).

## [0.0.2]

Bug fixes:
* Copy and paste view: viewConfig paste to intents views folder.
* Delete and recreate resource with the same name is now allowed (big fixed).

## [0.0.3]

Bug fixes:
* Fixing dependencies in package.json.
* On installation, the Intent Manager folder appears at the bottom of your workspace.
* When closing and reopening the editor, it now tries to reload the content (should not fail).

## [1.0.0]

First shared release.
Bug fixes:
* Look and feel changes for logs.
* Support for view-less intents (old intents prior 23.X, imported in a 23.X system). See DevPortal.

## [1.0.1]

Bug fixes:
* Working with files (resources, modules, intents, views) that contain spaces.

## [1.0.2]

Bug fixes:
* Handling disconnects from NSP.
* Logs to work with 23.11 (OSDversion 2.10.0).

## [1.0.3]

Bug fixes:
* Fixing issue with empty resources folder.
* Remove and re-create views with the same now is now fixed.
* Copy "resources" with content.

## [1.0.4]

Bug fixes:
* Minor fixes for local intent upload and auditing view.

## [1.1.1]

Updates:
* For unsaved files, we add the compare functionality so the user can see all modifications before saving.
* In settings, the user can define a list of labels to be ignored by the plugin, to reduce the amount of intent-types shown in the intent-types and intents list. When modified, the user will have to reload the vsCode window.

## [1.1.2]

Updates:
* Hide clear text password in settings.

## [1.2.0]

Updates:
* Logging for intent operations using output channels of vscode. Logs are cleaned up and use the correct severity.
* Moved plugin logging to log output channel of vscode (not console.log/warn/error anymore).
  * Setup loglevel as desired from UI.
  * Logging is available in normal production environment (no need to debug the plugin)
* Main script can be called either script-content.js or script-content.mjs when uploading from local system
* Support for subfolders under intent-type resources when uploading from local system
* Error handling improvements for malformed RESTCONF error messages

## [1.2.1]

Updates:
* Ignore hidden resource files folders
* Launch upload from local file-system from meta-info or script-content
* Logging, Audit and Sync support from workspace, including multi-select

## [2.0.0]

Updates:
* Code refactored to support next-gen JS engine
* More short-cuts added to explorer (including multi-select)
* Creation of new intent-types using templates
* Deletion of intent-types with intents (confirmation prompt)
* Audit reports using colors from vsCode theme (dark vs light)

## [2.1.0]

Fixes:
* Consistent usage of intent-type naming pattern (small caps, numbers, minus, underscore)
* Raise exception to let vsCode know, that deletion of intent-types with existing intents was cancelled
* Increased default timeout for REST calls from 20sec to 90sec for better robbustness

Updates:
* Filename for intents are now URI-encoded to support special-characters like `/`, like if target contains xpath
* Extension `.json` has been added for intents to improve support for local editing
* Update of extension settings without the need to reload vsCode
* Upload intent-types including intents
* Error messages improved

Experimental:
* Async execution allowing parallel intent operations (sync/audit)

Known limitations:
* Intent decoration is automatically updated by audit/sync methods to reduce server.
  In some error scenarios the displayed alignment state does not reflect the server state.

## [2.1.1]

Fixes:
* Upload intents and views from local machine (drag'n drop, copy/paste)
* Sanitized code for lint conformance
* Optimized build script

Updates:
* Allow updating `meta-info.json` for signed intent-types. Change was requested to remove label `ArtifactAdmin`
  after an intent-type was cloned or a new version have been created.
* New command to upload intents from local system.

## [2.2.0]

Updates:
* Server logs now include stacktrace for JavaScript errors
* Server logs timespan and limit are not configurable
* Limit for intent-type/intent retrieval is now configurable
* New template for next-gen javascript engine has been added

## [2.2.1]

Fixes:
* Parallel execution for desired state updates
* Alignement state updates for sync/audit errors

## [2.3.0]

Updates:
* Update intent-type templates avoiding scope global variables
* Update intent-type templates to pass eslint validation
* Retrieval of operational state from intents

## [2.3.1]

Fixes:
* Get logviewer osd-version from api/status to be future-proof
* Updated all templates with supports-health=never
* Update helloWorld template to be created as released (was draft before)

## [2.3.2]

Fixes:
* Retrieval of NSP version and OSD version together when connecting to the server
* Corrected NSP release check
* Audit report now contains the timestamp of the last audit
* Audit report now contains the neName and neId

## [2.4.0]

Fixes:
* In case of authentication errors reset `authToken`. Next time an auth-token is requested, vscode
  extension will try to authenticate again.

Updates:
* Audit report format: Align table layout for missing/undesired objects with IM WebUI (2 columns)
* Audit report format: For misaligned object entries with isConfigured equals false use different color
* Command `setPassword` can now be triggered from other extensions while passing the new password.
* Updated badges/tooltips/colors in FileSystemProvider (Explorer View)
* Explorer view now shows if vsCode is connected to Intent Manager. Tooltips provide extra information.

## [2.5.0]

Updates:
* Workspace entry Intent Manager tooltip include details when not connected / connection errors
  to replace error dialogue. Results in better user experience, especially when multiple NSP
  extensions are installed.
* Show NSP version as {major}.{minor}. With this "24.4.0" is displayed now as "24.4".
* New IPL!nk template for next-gen JavaScript engine (GraalJS)
* Hide empty tabs in audit report

## [3.0.0]

Updates:
* IPL!nk for GraalJS to support assurance/state (experimental)
* IPL!nk for GraalJS to cache device-names (experimental)
* IPL!nk for GraalJS to provide better logging / error-messages
* NSP connection settings per workspace (enable multi-server support)
* Validation for *.viewConfig files (partial coverage)
* NSP release and OSD version improvements (performance/robbustness)
* Retrieve list of intents including config (fix)
* Implemented a command function nokia-intent-manager.connect (Provides support for NSP-Connect extension):

## [3.1.0]

Updates:
* Set log-level for intent-engine to debug intent scripts
* Renamed log/output channels to `NSP Server (remote logs)` and `NSP Client (plugin logs)`
* Format of timestamps (date/time) aligned for server and client logs
* Added support to create resource folders
* Added support to rename/move intent-type resources and folders
* Added support to remove resource folders

## [3.2.0]

Fixes:
* Improved error-handling in case of connectivity issues
* Fixed nunjucks issues for Windows (create new intent-type from template)

Extension Updates:
* Improved logs, avoiding confusion with other NSP vsCode plugins
* Support for intent migrations has been added
* New command exportIntentTypes has been added (used for Artifact Manager extension)

Template Updates:
* Alignment of HelloWorld examples
* SRX24 templates migrated to GraalJS: DeviceSecurity, GoldenConfig, IPL!nk, OAM TWL
* Method #nspFindAC() for GraalJS applies access-control for pickers/suggest. Used for getNodes(), getAccessPorts(), getPorts(), suggestTargetDevices()

## [3.3.0]

Fixes:
* Handle case, when intent-type name contains "_v"

Improvements:
* Create new intent-type (from template) in local file-system (git-centric)
* Disable meta in restconf queries for better performance/footage
* Enjoy the new `NSP connect` vsCode extension to switch between multiple NSP systems

Template Updates:
* Disable meta-info in inventory queries for better performance/footage
* Associate accounting policy for OAM TWL
* Improved exceptions and logging for FTL-related errors
* nspFind method now supports both user-token and system-token
* Avoid constants for intent-type name and container
* Skip resolveSynchronize and resolveAudit based on intent-type meta labels
* Advanced extraction of ne-id from target/input for picker/suggest
* New method suggestDeviceModelObjects() to simplify device-model callouts
* suggestTargetDevices renamed to suggestDevicesFromInventory
* suggestAllTargetDevices renamed to suggestDevicesFromAllMediators
* Two new ICM templates for abstract intenface config w/ brownfield discovery
* CalloutHandler has been discontinued; Functionality moved to IntentHandler
* New methods in ResourceAdmin to create IPv4 and numeric resource-pools
* New hooks are available in IntentLogic: initialize, preAuditHook, preSyncExecute, postSyncExecute
* Method freeResources has been removed. Please use postSyncExecute instead!

## [3.3.1]

Fixes:
* OAM template to support changing terminating nodes
* Readme corrected
* Update template mappings to support Juniper, Cisco and Ciena
* Fix for upload intent-type from local system on Windows

## [4.0.0]

Fixes:
* Compatibility with older releases using non-standard ports (8547/8545)

Template Updates:
* Fix multi-key for IntentHandler::suggestDeviceModelObjects
* Use neId picker for device target components
* Replace `classResolver.resolveClass()` by `Java.type()` for NSP24.11 compatibility
* New auto-complete callouts: suggestPorts, suggestLinkAggGroups
* New picker callouts: getLinkAggGroups, getDeviceModelObjects
* Remove approved misalignments when intent is deleted from network
* Brownfield discovery improvements for ICM examples
* Add release version check
* Added IPLink flavor that is ICM-compliant
* Added LinkAgg example

Improvements:
* Added concept-study to auto-generate ICM intent-types from model
* Support for `includeLabels` in addition to `ignoreLabels` (combined blacklist/whitelist)

## [4.0.1]

Fixes:
* ICM auto-generated intent-types now supports leafref targetting intent-model itself.
  Backend-based implementation. Option `intentrefs` has been removed.
  
## [4.0.2]

Fixes:
* Take exclusions into account to decide, if the leafref is targetting the intent-model
* itself. If leafref-target is excluded, use device suggest (not form suggest).