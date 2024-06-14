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
