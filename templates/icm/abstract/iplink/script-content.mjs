/****************************************************************************
 * INTENT-TYPE BLUEPRINT
 *   use-case: inter-router IP link w/ protocols enabled
 * 
 * (c) 2025 by Nokia
 ****************************************************************************/

import { IntentHandler } from 'common/IntentHandler.mjs';
import { ResourceAdmin } from 'common/ResourceAdmin.mjs';
import { NSP } from 'common/NSP.mjs';

class CustomIntentHandler extends IntentHandler {
  /**************************************************************************
   * Custom Intent Logic
   **************************************************************************/

  constructor() {
    super();
    NSP.checkRelease(24, 11);
    ResourceAdmin.createIpPool("ip-pool", "global", "used for iplink", "192.168.192.0/18", "network-link");
  }

  getSites(target, config) {
    const sites = [];
    sites.push(config['{{ intent_type }}:{{ intent_type }}']['endpoint-a']['ne-id']);
    sites.push(config['{{ intent_type }}:{{ intent_type }}']['endpoint-b']['ne-id']);
    return sites;
  }
  
  getSiteParameters(intentType, intentTypeVersion, target, config, siteNames) {
    const sites = [];
    sites.push(config['{{ intent_type }}:{{ intent_type }}']['endpoint-a']);
    sites.push(config['{{ intent_type }}:{{ intent_type }}']['endpoint-b']);

    // Add ne-name from NSP inventory
    sites[0]['ne-name'] = siteNames[sites[0]['ne-id']];
    sites[1]['ne-name'] = siteNames[sites[1]['ne-id']];

    // Assign addresses from obtained subnet to endpoints
    const subnet = ResourceAdmin.getSubnet('ip-pool', 'global', target.split('#')[2]);
    const helper = subnet.split('/')[0].split('.');
    helper[3] = (parseInt(helper[3])+1).toString(); 
    sites[0]['ip-address'] = subnet.split('/')[0];  // Assign first address to endpoint-a
    sites[1]['ip-address'] = helper.join('.');      // Assign second address to endpoint-b

    sites[0].peer = sites[1]; // Remote info: required to construct 7x50 interface-name and op.state audits
    sites[1].peer = sites[0]; // Remote info: required to construct 7x50 interface-name and op.state audits

    return sites;
  }

  getGlobalParameters(intentType, intentTypeVersion, target, config) {  
    // add testId; Required for SROS to do OAM-PM tests
    const global = config['{{ intent_type }}:{{ intent_type }}'];

    global.template = target.split('#')[0];
    global.cid = target.split('#')[2];
    global.testId = parseInt(global.cid.match(/\d+/));

    if (global.description)
      global.description = `{{ intent_type }}: ${global.description}`;

    return global;
  }

  getState(intentType, intentTypeVersion, target, config, topology) {
    return {'subnet': ResourceAdmin.getSubnet('ip-pool', 'global', target.split('#')[2])};
  }

  obtainResources(intentType, intentTypeVersion, target, config) {
    ResourceAdmin.obtainSubnet('ip-pool', 'global', 'network-link', 31, intentType, target.split('#')[2]);
  }

  /**************************************************************************
   * Intent Hooks
   **************************************************************************/

  validateHook(intentType, intentTypeVersion, target, config, contextualErrorJsonObj) {
    const siteA = config['{{ intent_type }}:{{ intent_type }}']['endpoint-a']['ne-id'];
    const siteB = config['{{ intent_type }}:{{ intent_type }}']['endpoint-b']['ne-id'];

    if (siteA === siteB)
      contextualErrorJsonObj['Value inconsistency'] = 'endpoint-a and endpoint-b must resite on different devices!';
  }

  postSyncHook(intentType, intentTypeVersion, target, config, state) {
    if (state === 'delete')
      ResourceAdmin.releaseSubnet('ip-pool', 'global', target.split('#')[2]);
  }
}

new CustomIntentHandler();