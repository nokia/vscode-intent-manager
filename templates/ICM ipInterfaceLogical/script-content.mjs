/********************************************************************************
 * INTENT-TYPE BLUEPRINT
 *   use-case: physical/logical interface with IS-IS enabled
 * 
 * (c) 2025 by Nokia
 ********************************************************************************/

import { DiscoveryLogic } from 'mappers/BrownfieldDiscovery.mjs';
import { IntentHandler }  from 'common/IntentHandler.mjs';
import { NSP } from 'common/NSP.mjs';

class CustomIntentHandler extends IntentHandler {
  /**************************************************************************
   * Custom Intent Logic
   **************************************************************************/

  constructor() {
    super();
    NSP.checkRelease(24, 11);
  }

  getSites(target, config) {
    const neId = target.match(/ne-id='([^']+)'/);
    if (!neId)
      throw new Error('Invalid target (ObjectIdentifier must contain ne-id)!');

    return [neId[1]];
  }
  
  getSiteParameters(intentType, intentTypeVersion, target, config, siteNames) {
    // top-level container has the details:
    const sites = Object.values(config);

    // add remaining data from intent target:
    sites[0]['ne-id'] = target.match(/ne-id='([^']+)'/)[1];
    sites[0]['if-name'] = target.split("#")[2];

    return sites;
  }

  /**************************************************************************
   * ICM RPC Callout (brownfield discovery)
   **************************************************************************/

  getTargetData(input) {
    return DiscoveryLogic.discover(input);
  }

  /**************************************************************************
   * Intent WebUI Callouts
   **************************************************************************/

  suggestInterfaceName(context) {
    return this.suggestDeviceModelObjects(context, 'nokia-conf:/configure/router=Base/interface', 'content=config');
    // Note: For SR OS, we could actually skip the query-option
  }
}

new CustomIntentHandler();