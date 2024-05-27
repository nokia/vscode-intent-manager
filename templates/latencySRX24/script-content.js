load({script: resourceProvider.getResource('utils_entrypoints.js'), name: 'entrypoints'});
load({script: resourceProvider.getResource('utils_callouts.js'),    name: 'callouts'});

fwkUtils = load({script: resourceProvider.getResource('utils.js'),  name: 'fwkUtils'});
utils = new fwkUtils();

fwkResources = load({script: resourceProvider.getResource('utils_resources.js'),  name: 'fwkResources'});
var resourceAdmin = new fwkResources();

var StringUtils = Java.type('org.apache.commons.lang3.StringUtils');

var intentTypeName  = "{{ intent_type }}";
var intentContainer = "{{ intent_type }}:{{ intent_type }}";

function getSites(target, config) {
  /**
    * Consumes intent target and intent config as input
    *
    * Produced a list of sites, while each site entry is an object (dict)
    * Sites must have the property called "ne-id" to drive deployments and audits
    * 
    * Enhances the intent input model by computed values and RA resources
    *
    **/
  
  var sites = [
    {
      'ne-id':   config["endpoint-a"],
      'ne-name': utils.getDeviceDetails(config["endpoint-a"])['ne-name']
    },
    {
      'ne-id':   config["endpoint-b"],
      'ne-name': utils.getDeviceDetails(config["endpoint-b"])['ne-name']
    }
  ];

  sites[0]["peer"] = sites[1];
  sites[1]["peer"] = sites[0];

  return sites;
}

function getGlobal(target, config) {
  /**
    * Consumes intent target and intent config as input
    *
    * Produced an object (dict) of intent-level settings (valid for all sites)
    * For basic cases this just returns the intent config itself.
    *
    * If intent-level attributes are calculated or retrieved from other source,
    * for example inventory lookups or resource administrator, here is the place
    * to put this.
    *
    **/
    
  return config;
}

function getState(target, config, topology) {
  /**
    * Callback to get state attributes
    * Output Map is used as input for 'state.ftl'
    *
    **/
  
  return {};
}

function freeResources(target, config) {
  /**
    * Cleanup resources
    *
    * Function is called, after the intent is deleted from the network as part of synchronize().
    * This callback should be used to free-up resources from ResourceAdmin.
    *
    **/
}

function getTemplateName(neId, familyTypeRelease) {
  /**
    * Name of FTL to be used for neId
    * Generic recommendation is to use "{neType}.ftl"
    *
    */

  var neType = familyTypeRelease.split(':')[0];
  
  if      (neType=="7220 IXR SRLinux")
    return "SRLinux.ftl"
  else if (neType=="7250 IXR SRLinux")
    return "SRLinux.ftl"
  else if (neType=="7750 SR")
    return "SR OS.ftl"    
  else if (neType=="7450 ESS")
    return "SR OS.ftl"    
  else
    return 'OpenConfig.ftl'
}
