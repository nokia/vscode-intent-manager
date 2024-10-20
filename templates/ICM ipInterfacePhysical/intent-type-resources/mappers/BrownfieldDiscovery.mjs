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
    static discoverFromSROS(neId, portId, config) {
        logger.info("DiscoveryLogic::discoverFromSROS({}, {})", neId, portId);

        const result = IntentHandler.restconfGetDevice(neId, "nokia-conf:/configure/router=Base?content=config");
        if (result.success) {
          const interfaces = result.response["nokia-conf:router"][0].interface.filter(entry => entry.port == portId );
          if (interfaces.length > 0) {
            config['if-name']     = interfaces[0]["interface-name"];
            config.description    = interfaces[0].description;
            config['admin-state'] = interfaces[0]["admin-state"];
            config['ip-address']  = interfaces[0].ipv4.primary.address;
          }
        }
    }

    static discoverFromSRL(neId, portId, config) {
        logger.info("DiscoveryLogic::discoverFromSRL({}, {})", neId, portId);

        const result = IntentHandler.restconfGetDevice(neId, `srl_nokia-interfaces:/interface=${encodeURIComponent(portId)}?content=config`);
        if (result.success) {
            const ifentry = result.response["srl_nokia-interfaces:interface"][0];
            config['if-name']     = undefined;
            config.description    = ifentry.description;
            config['admin-state'] = ifentry["admin-state"];
            if ('subinterface' in ifentry)
              config['ip-address'] = ifentry.subinterface[0].ipv4.address[0]['ip-prefix'].split('/')[0];
        }
    }

    static discover(input) {
        logger.info("DiscoveryLogic::discover()");
    
        const target = input.getTarget();
        const config = Object.values(JSON.parse(input.getJsonIntentConfiguration())[0])[0];
    
        const neId = target.match(/ne-id='([^']+)'/)[1];
        const portId = target.split("#")[2];
    
        const neInfo = mds.getAllInfoFromDevices(neId);
        const neType = neInfo.get(0).getFamilyTypeRelease().split(':')[0];
    
        switch (neType) {
            case '7220 IXR SRLinux':
            case '7250 IXR SRLinux':
            case '7730 SXR SRLinux':
                this.discoverFromSRL(neId, portId, config);
                break;
            case '7750 SR':
            case '7450 ESS':
            case '7950 XRS':
            case '7250 IXR':
                this.discoverFromSROS(neId, portId, config);
                break;

            default:
                logger.warn("NO DISCOVERY HELPER FOR NE-ID {} NE-TYPE {}", neId, neType);
        }
    
        logger.info("discovered config: {}", JSON.stringify(config));

        return '<target-data xmlns="http://www.nokia.com/management-solutions/reference-action-intent">'+JSON.stringify(config)+'</target-data>';
    }
}