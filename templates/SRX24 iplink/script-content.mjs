/********************************************************************************
 * INTENT-TYPE BLUEPRINT
 *   use-case: inter-router IP link w/ protocols enabled
 * 
 * (c) 2024 by Nokia
 ********************************************************************************/

import { IntentLogic }   from 'common/IntentLogic.mjs';
import { IntentHandler } from 'common/IntentHandler.mjs';
import { ResourceAdmin } from 'common/ResourceAdmin.mjs';

class IPLink extends (IntentLogic) {
  static INTENT_TYPE = '{{ intent_type }}';
  static INTENT_ROOT = '{{ intent_type }}:{{ intent_type }}';
  
  static getSites(target, config) {
    // Create list of sites from endpoints
    const sites = [];
    sites.push(config['endpoint-a']['ne-id']);
    sites.push(config['endpoint-b']['ne-id']);
    return sites;
  }
  
  static validate(target, config, contextualErrorJsonObj) {
    if (config['endpoint-a']['ne-id'] === config['endpoint-b']['ne-id'])
      contextualErrorJsonObj['Value inconsistency'] = 'endpoint-a and endpoint-b must resite on different devices!';
  }

  static getSiteParameters(target, config, siteNames) {
    const sites = [];
    sites.push(config['endpoint-a']);
    sites.push(config['endpoint-b']);

    // Obtain ne-name from NSP inventory
    sites[0]['ne-name'] = siteNames[sites[0]['ne-id']];
    sites[1]['ne-name'] = siteNames[sites[1]['ne-id']];

    // Obtain an /31 subnet
    const subnet = ResourceAdmin.getSubnet('ip-pool', 'global', target);
    const helper = subnet.split('/')[0].split('.');
    helper[3] = (parseInt(helper[3])+1).toString(); 
    sites[0]['addr'] = subnet.split('/')[0];  // Assign first address of /31 subnet to endpoint-a
    sites[1]['addr'] = helper.join('.');      // Assign second address of /31 subnet to endpoint-b

    sites[0]['peer'] = sites[1]; // remote info is required to construct 7x50 interface-name and op.state audits
    sites[1]['peer'] = sites[0]; // remote info is required to construct 7x50 interface-name and op.state audits

    return sites;
  }

  static getGlobalParameters(target, config) {  
    // add testId; Required for SROS to do OAM-PM tests
    const global = config;
    global['testId'] = parseInt(target.match(/\d+/));
    return global;
  }

  static getState(target, config, topology) {
    return {'subnet': ResourceAdmin.getSubnet('ip-pool', 'global', target)};
  }

  static obtainResources(target, config) {
    ResourceAdmin.obtainSubnet('ip-pool', 'global', 'network-link', 31, this.INTENT_TYPE, target);
  }

  static freeResources(target, config) {
    ResourceAdmin.releaseSubnet('ip-pool', 'global', target);
  }
}

new IntentHandler(IPLink);