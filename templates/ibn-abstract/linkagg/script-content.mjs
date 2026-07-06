/********************************************************************************
 * INTENT-TYPE BLUEPRINT
 *   use-case: access-facing LinkAgg w/ physical interfaces
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
    return [target.split('#')[0]];
  }

  getSiteParameters(intentType, intentTypeVersion, target, config, siteNames) {
    const sites = Object.values(config); // top-level container has the details
    sites[0]['ne-id'] = target.split('#')[0];
    sites[0]['lagId'] = target.split('#')[1];
    return sites;
  }
}

new CustomIntentHandler();