/********************************************************************************
 * INTENT-TYPE BLUEPRINT
 *   use-case: TWAMP light session between two 7x50 routers (system-ip)
 * 
 * (c) 2024 by Nokia
 ********************************************************************************/

import { IntentLogic }   from 'common/IntentLogic.mjs';
import { IntentHandler } from 'common/IntentHandler.mjs';

class OAMConfig extends (IntentLogic) {
  static getSites(target, config) {
    return [Object.values(config)[0]['endpoint-a'], Object.values(config)[0]['endpoint-b']];
  }

  static validate(intentType, intentTypeVersion, target, config, contextualErrorJsonObj) {
    if (Object.values(config)[0]['endpoint-a'] === Object.values(config)[0]['endpoint-b'])
      contextualErrorJsonObj['Value inconsistency'] = 'endpoints must be different devices!';
  }

  static getSiteParameters(intentType, intentTypeVersion, target, config, siteNames) {
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
}

new IntentHandler(OAMConfig);