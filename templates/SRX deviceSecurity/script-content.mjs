/********************************************************************************
 * INTENT-TYPE BLUEPRINT
 *   use-case: baseline security (device-level: 7x50)
 * 
 * (c) 2025 by Nokia
 ********************************************************************************/

import { IntentHandler } from 'common/IntentHandler.mjs';
import { NSP } from 'common/NSP.mjs';

class CustomIntentHandler extends IntentHandler {
  constructor() {
    super();
    NSP.checkRelease(24, 11);
  }

  getSiteParameters(intentType, intentTypeVersion, target, config, siteNames) {
    const sites = Object.values(config); // top-level container has the details

    sites[0]['ne-id'] = Object.keys(siteNames).find(key => siteNames[key] === target);
    sites[0]['ne-name'] = target;

    return sites;
  }

  getSites(target, config) {
    this.updateDeviceCache();
    const neId = Object.keys(this.deviceCache).find(key => this.deviceCache[key] === target);
    return [neId];
  }
}

new CustomIntentHandler();