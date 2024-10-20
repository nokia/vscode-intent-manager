/********************************************************************************
 * BROWNFIELD DISCOVERY LOGIC
 *   use-case: physical/logical interface with IS-IS enabled
 * 
 * (c) 2024 by Nokia
 ********************************************************************************/

/* global mds, logger */
/* eslint no-undef: "error" */

import { IntentHandler } from 'common/IntentHandler.mjs';

export class DiscoveryLogic {
    static discoverFromSROS(neId, ifName, config) {
        logger.info("DiscoveryLogic::discoverFromSROS({}, {})", neId, ifName);

        const result = IntentHandler.restconfGetDevice(neId, `nokia-conf:/configure/router=Base/interface=${ifName}`);
        if (result.success) {
            const ifentry = result.response["nokia-conf:interface"][0];
            config['port-id']     = ifentry.port;
            config.description    = ifentry.description;
            config['admin-state'] = ifentry["admin-state"];
            config['ip-address']  = ifentry.ipv4.primary.address;
        }
    }

    static discover(input) {
        logger.info("DiscoveryLogic::discover()");
    
        const target = input.getTarget();
        const config = Object.values(JSON.parse(input.getJsonIntentConfiguration())[0])[0];
    
        const neId = target.match(/ne-id='([^']+)'/)[1];
        const ifName = target.split("#")[2];
    
        const neInfo = mds.getAllInfoFromDevices(neId);
        const neType = neInfo.get(0).getFamilyTypeRelease().split(':')[0];
    
        switch (neType) {
            case '7750 SR':
            case '7450 ESS':
            case '7950 XRS':
            case '7250 IXR':
                this.discoverFromSROS(neId, ifName, config);
                break;

            default:
                logger.warn("NO DISCOVERY HELPER FOR NE-ID {} NE-TYPE {}", neId, neType);
        }
    
        logger.info("discovered config: {}", JSON.stringify(config));

        return '<target-data xmlns="http://www.nokia.com/management-solutions/reference-action-intent">'+JSON.stringify(config)+'</target-data>';
    }
}