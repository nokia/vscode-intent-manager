/********************************************************************************
 * BROWNFIELD DISCOVERY LOGIC
 *   use-case: physical/logical interface with IS-IS enabled
 * 
 * (c) 2025 by Nokia
 ********************************************************************************/

import { NSP } from 'common/NSP.mjs';

export class DiscoveryLogic {
    static discoverFromSROS(neId, ifName, config) {
        logger.info("DiscoveryLogic::discoverFromSROS({}, {})", neId, ifName);

        const result = NSP.restconfGetDevice(neId, `nokia-conf:/configure/router=Base/interface=${ifName}`);
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
        const familyTypeRelease = neInfo.get(0).getFamilyTypeRelease();
        const neType = familyTypeRelease.split(':')[0];

        if (["7250 IXR", "7450 ESS", "7750 SR", "7950 XRS"].includes(neType)) {
            this.discoverFromSROS(neId, ifName, config);
        } else {
            logger.warn("NO DISCOVERY HELPER FOR NE-ID {} NE-TYPE {}", neId, neType);
        }
    
        logger.info("discovered config: {}", JSON.stringify(config));

        return '<target-data xmlns="http://www.nokia.com/management-solutions/reference-action-intent">'+JSON.stringify(config)+'</target-data>';
    }
}