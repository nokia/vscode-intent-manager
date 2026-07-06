/********************************************************************************
 * INTENT-TYPE BLUEPRINT
 *   use-case: TWAMP light session between two 7x50 routers (system-ip)
 * 
 * (c) 2025 by Nokia
 ********************************************************************************/

import { IntentHandler } from 'common/IntentHandler.mjs';
import { NSP } from 'common/NSP.mjs';

class CustomIntentHandler extends (IntentHandler) {
  /**************************************************************************
   * Custom Intent Logic
   **************************************************************************/

  constructor() {
    super();
    NSP.checkRelease(24, 11);
  }

  getSites(target, config) {
    return [Object.values(config)[0]['endpoint-a'], Object.values(config)[0]['endpoint-b']];
  }

  getSiteParameters(intentType, intentTypeVersion, target, config, siteNames) {
    const cfg = Object.values(config)[0];

    const sites = [
      {
        'ne-id': cfg['endpoint-a'],
        'ne-name': siteNames[cfg['endpoint-a']]
      },
      {
        'ne-id': cfg['endpoint-b'],
        'ne-name': siteNames[cfg['endpoint-b']]
      }
    ];

    sites[0]['peer'] = sites[1]; // remote info is required for OAM far-end
    sites[1]['peer'] = sites[0]; // remote info is required for OAM far-end

    return sites;
  }

  /**************************************************************************
   * Intent Hooks
   **************************************************************************/

  validateHook(intentType, intentTypeVersion, target, config, contextualErrorJsonObj) {
    if (Object.values(config)[0]['endpoint-a'] === Object.values(config)[0]['endpoint-b'])
      contextualErrorJsonObj['Value inconsistency'] = 'endpoints must be different devices!';
  }
}

new CustomIntentHandler();