/********************************************************************************
 * INTENT-TYPE BLUEPRINT
 *   use-case: physical/logical interface with IS-IS enabled
 * 
 * (c) 2024 by Nokia
 ********************************************************************************/

import { IntentLogic }    from 'common/IntentLogic.mjs';
import { IntentHandler }  from 'common/IntentHandler.mjs';
import { DiscoveryLogic } from 'mappers/BrownfieldDiscovery.mjs';

class IPInterface extends (IntentLogic) {
  static getSites(target, config) {
    const neId = target.match(/ne-id='([^']+)'/);
    if (!neId)
      throw new Error('Invalid target (ObjectIdentifier must contain ne-id)!');

    return [neId[1]];
  }
  
  static getSiteParameters(intentType, intentTypeVersion, target, config, siteNames) {
    // top-level container has the details:
    const sites = Object.values(config);

    // add remaining data from intent target:
    sites[0]['ne-id'] = target.match(/ne-id='([^']+)'/)[1];
    sites[0]['if-name'] = target.split("#")[2];

    return sites;
  }
}

class IntentHandlerICM extends (IntentHandler) {
  getTargetData(input) {
    return DiscoveryLogic.discover(input);
  }

  suggestInterfaceName(context) {
    return this.suggestDeviceModelObjects(context, 'nokia-conf:/configure/router=Base/interface', 'content=config');
    // Note: For SR OS, we could actually skip the query-option
  }
}

new IntentHandlerICM(IPInterface);