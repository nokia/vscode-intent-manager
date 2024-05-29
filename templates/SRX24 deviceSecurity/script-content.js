load({script: resourceProvider.getResource('utils_entrypoints.js'), name: 'entrypoints'});
load({script: resourceProvider.getResource('utils_callouts.js'),    name: 'callouts'});

fwkUtils = load({script: resourceProvider.getResource('utils.js'),  name: 'fwkUtils'});
fwkResources = load({script: resourceProvider.getResource('utils_resources.js'),  name: 'fwkResources'});

var utils = new fwkUtils();
var resourceAdmin = new fwkResources();
var StringUtils = Java.type('org.apache.commons.lang3.StringUtils');

const intentTypeName  = "{{ intent_type }}";
const intentContainer = "{{ intent_type }}:{{ intent_type }}";

/**
  * Produced a list of sites, while each site entry is an object (dict).
  * Site objects must have the `ne-id` property, which is used as unique key to drive deployments and audits.
  * Site objects are used as input for deployment templates to render the configuration per site.
  * 
  * Function may contain some business logic to enhance the intent input-model
  * by computed values, look-up values, transformed values and RA resources.
  * 
  * @param {string} target Intent target
  * @param {Object} config Intent configuration
  * @returns {Object[]} List of sites
  **/

function getSites(target, config)
{
  config['ne-id'] = target;
  config['ne-name'] = utils.getDeviceDetails(target)['ne-name'];
  return [config];
}

/**
  * Produced an object (dict) of intent-level settings (valid for all sites)
  * For basic cases this just returns the intent config itself.
  *
  * If intent-level attributes are calculated or retrieved from other source,
  * for example inventory lookups or resource administrator, here is the place
  * to put this.
  *
  * @param {string} target Intent target
  * @param {Object} config Intent configuration
  * @returns {Object} Global settings
  **/

function getGlobal(target, config)
{
  // not needed/implemented for this intent-type
  return config;
}

/**
  * Gets the state attributes
  * 
  * @param {string} target Intent target
  * @param {Object} config Intent configuration
  * @param {Object} topology Intent topology
  * @returns {Object} dictionary to render the 'state.ftl' template
  **/

function getState(target, config, topology)
{  
  // not needed/implemented for this intent-type
  return {};
}

/**
  * Function is called, after the intent is deleted from the network as part of synchronize().
  * It's used to free-up resources from ResourceAdmin.
  *
  * @param {string} target Intent target
  * @param {Object} config Intent configuration
  **/

function freeResources(target, config)
{
  // not needed/implemented for this intent-type
}

/**
  * Used to lookup the name of the deployment template (FTL) to be used for
  * a specific site of this intent. Using `{neType}.ftl` is genrically a
  * good starting point! Consult the DEVICE view of the MDC mediator to
  * understand the format/values of `Family Type Release`.
  * 
  * Examples for Family/Type/Release:
  *  - 7750 SR:23.10.R2:7750 SR-1
  *  - 7250 IXR SRLinux:23.10.3:7250 IXR-6e
  *  - 7730 SXR SRLinux:0.0.0:7730 SXR-1d-32D
  *
  * @param {string} neId Device Identifier
  * @param {string} familyTypeRelease Family/Type/Release
  * @returns {Object} name of the deployment template (FTL) to be used for the neId
  **/

function getTemplateName(neId, familyTypeRelease)
{
  var neType = familyTypeRelease.split(':')[0];
 
  if (neType=="7220 IXR SRLinux")
    return "SRLinux.ftl"
  else if (neType=="7250 IXR SRLinux")
    return "SRLinux.ftl"
  else if (neType=="7730 SXR SRLinux")
    return "SRLinux.ftl"
  else if (neType=="7750 SR")
    return "SR OS.ftl"
  else if (neType=="7450 ESS")
    return "SR OS.ftl"
  else
    return 'OpenConfig.ftl'
}