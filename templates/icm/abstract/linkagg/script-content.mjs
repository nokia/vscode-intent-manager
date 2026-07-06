/********************************************************************************
 * INTENT-TYPE BLUEPRINT
 *   use-case: access-facing LinkAgg w/ physical interfaces
 * 
 * (c) 2025 by Nokia
 ********************************************************************************/

import { IntentHandler } from 'common/IntentHandler.mjs';
import { NSP } from 'common/NSP.mjs';

const HashMap = Java.type("java.util.HashMap");

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
    sites[0]['lagId'] = target.split("#")[2];

    return sites;
  }

  /**************************************************************************
   * ICM RPC Callout (brownfield discovery)
   **************************************************************************/

  getTargetData(input) {
    // not implemented
  }

  /**************************************************************************
   * Intent WebUI Callouts
   **************************************************************************/
  
  suggestLagId(context) {
    const rvalue = new HashMap();

    const neId = this.getNeId(context);
    if (typeof neId === "string" && neId.length > 0) {
      const options = {
        "xpath-filter": `/nsp-equipment:network/network-element[ne-id='${neId}']/lag`,
        "fields": "name",
        "limit": 1000,
        "include-meta": false
      };
  
      const token = context.getInputValues().arguments.__token;
      const result = NSP.inventoryFind(options, false, token);
  
      if (result.success)
        result.response.forEach(entry => rvalue.put(entry.name, parseInt(entry.name.match(/\d+/))));
    }
    return rvalue;
  }
}

new CustomIntentHandler();