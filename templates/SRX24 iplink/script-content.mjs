/****************************************************************************
 * INTENT-TYPE BLUEPRINT
 *   use-case: inter-router IP link w/ protocols enabled
 * 
 * (c) 2024 by Nokia
 ****************************************************************************/

import { IntentLogic }   from 'common/IntentLogic.mjs';
import { IntentHandler } from 'common/IntentHandler.mjs';
import { ResourceAdmin } from 'common/ResourceAdmin.mjs';

class IPLink extends (IntentLogic) {
  static initialize() {
    ResourceAdmin.createIpPool("ip-pool", "global", "used for iplink", "192.168.192.0/18", "network-link");
  }

  static getSites(target, config) {
    const sites = [];
    sites.push(config['{{ intent_type }}:{{ intent_type }}']['endpoint-a']['ne-id']);
    sites.push(config['{{ intent_type }}:{{ intent_type }}']['endpoint-b']['ne-id']);
    return sites;
  }
  
  static validate(intentType, intentTypeVersion, target, config, contextualErrorJsonObj) {
    const siteA = config['{{ intent_type }}:{{ intent_type }}']['endpoint-a']['ne-id'];
    const siteB = config['{{ intent_type }}:{{ intent_type }}']['endpoint-b']['ne-id'];

    if (siteA === siteB)
      contextualErrorJsonObj['Value inconsistency'] = 'endpoint-a and endpoint-b must resite on different devices!';
  }

  static getSiteParameters(intentType, intentTypeVersion, target, config, siteNames) {
    const sites = [];
    sites.push(config['{{ intent_type }}:{{ intent_type }}']['endpoint-a']);
    sites.push(config['{{ intent_type }}:{{ intent_type }}']['endpoint-b']);

    // Add ne-name from NSP inventory
    sites[0]['ne-name'] = siteNames[sites[0]['ne-id']];
    sites[1]['ne-name'] = siteNames[sites[1]['ne-id']];

    // Assign addresses from obtained subnet to endpoints
    const subnet = ResourceAdmin.getSubnet('ip-pool', 'global', target);
    const helper = subnet.split('/')[0].split('.');
    helper[3] = (parseInt(helper[3])+1).toString(); 
    sites[0]['ip-address'] = subnet.split('/')[0];  // Assign first address to endpoint-a
    sites[1]['ip-address'] = helper.join('.');      // Assign second address to endpoint-b

    sites[0].peer = sites[1]; // Remote info: required to construct 7x50 interface-name and op.state audits
    sites[1].peer = sites[0]; // Remote info: required to construct 7x50 interface-name and op.state audits

    return sites;
  }

  static getGlobalParameters(intentType, intentTypeVersion, target, config) {  
    // add testId; Required for SROS to do OAM-PM tests
    const global = config['{{ intent_type }}:{{ intent_type }}'];
    global['testId'] = parseInt(target.match(/\d+/));
    return global;
  }

  static getState(intentType, intentTypeVersion, target, config, topology) {
    return {'subnet': ResourceAdmin.getSubnet('ip-pool', 'global', target)};
  }

  static obtainResources(intentType, intentTypeVersion, target, config) {
    ResourceAdmin.obtainSubnet('ip-pool', 'global', 'network-link', 31, this.INTENT_TYPE, target);
  }

  static postSyncExecute(intentType, intentTypeVersion, target, config, state) {
    if (state === 'delete')
      ResourceAdmin.releaseSubnet('ip-pool', 'global', target);
  }
}

new IntentHandler(IPLink);