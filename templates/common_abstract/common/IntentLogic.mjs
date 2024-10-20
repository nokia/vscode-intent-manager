/********************************************************************************
 * INTENT LOGIC MASTER
 * 
 * (c) 2024 by Nokia
 ********************************************************************************/

export class IntentLogic {
    /**
     * Method, that is called when the intent-type is loaded/initalized.
     * It can be used to setup resource pools in Resource Admin at startup.
     */

    static initialize() {
    }

    /**
     * Intent-type specific validation. It will be executed in addition to YANG validation
     * and common validation rules.
     * Default implementation does not have any extra validation rules.
     * 
     * @param {string} intentType Inten-type name
     * @param {string} intentTypeVersion Inten-type version
     * @param {string} target Intent target
     * @param {object} config Intent configuration
     * @param {object} contextualErrorJsonObj used to return list of validation errors (key/value pairs)
     */

    static validate(intentType, intentTypeVersion, target, config, contextualErrorJsonObj) {
    }    

    /**
     * Produces a list of sites `[neId: string]` to be configured by this intent.
     * Default implementation returns `[target]` (single-entry list), used for
     * site-level templates (golden configuration).
     * 
     * @param {string} target Intent target
     * @param {object} config Intent config
     * @returns {string[]} List of sites (ne-id) to be configured
     */

    static getSites(target, config) {
        return [target];
    }
    
    /**
     * Produces a list of site objects `[object]`, while each site entry defines the
     * site-level parameters to render the corresponding desired site configuration
     * (using Apache® FreeMarker™ templates). Every site object must have the `ne-id`
     * property, which is used as unique key to drive deployments and audits.
     * 
     * Within the template all properties can be accessed using the expression
     * `${site.parametername}`. For example one can access the `ne-id` by using
     * the FTL expression `${site.ne\-id}`.
     * 
     * If site-level attributes are calculated or retrieved from other sources,
     * for example inventory lookups or resource administrator, here is the place
     * to put the corresponding logic. For resource allocation (obtain/release)
     * there are dedicated methods available.
     * 
     * Default implementation returns a single entry list, assuming intents
     * for configuring a single site, used for golden site-level configuration.
     * This single entry is the intent config itself while `ne-id` is added
     * (from target).
     * 
     * The `IntentHandler` automatically adds the `ne-name`, that it can be
     * used in the FTL mapper.
     * 
     * @param {string} intentType Inten-type name
     * @param {string} intentTypeVersion Inten-type version
     * @param {string} target Intent target
     * @param {object} config Intent configuration
     * @param {object} siteNames Used to translate `ne-id` to `ne-name` (w/o API calls)
     * @returns {object} site-level settings
     */

    static getSiteParameters(intentType, intentTypeVersion, target, config, siteNames) {
        const sites = Object.values(config); // top-level container has the details
        sites[0]['ne-id'] = target;
        return sites;
    }

    /**
     * Produces an object of intent-level parameters (valid for all sites).
     * 
     * Within the FTL mapper all properties can be accessed using
     * the expression `${global.parameter}`.
     * 
     * If intent-level attributes are calculated or retrieved from other sources,
     * for example inventory lookups or resource administrator, here is the place
     * to put the corresponding logic. For resource allocation (obtain/release)
     * there is dedicated methods available.
     * 
     * Default implementation returns the entire config, assuming intents
     * for configuring a single site, typically used for any sort of golden
     * site-level configuration.
     *
     * @param {string} intentType Inten-type name
     * @param {string} intentTypeVersion Inten-type version
     * @param {string} target Intent target
     * @param {object} config Intent configuration
     * @returns {object} intent-global settings
     */

    static getGlobalParameters(intentType, intentTypeVersion, target, config) {
        return Object.values(config)[0]; // top-level container has the details
    }

    /**
     * Add custom logic to update desired and actual device configuration before
     * comparing both (as part of audit).
     * 
     * @param {string} neId site identifier
     * @param {string} path device-level model path
     * @param {object} iConfig intented configuration (desired)
     * @param {object} aConfig actual device configuration
     */

    static preAuditHook(neId, path, iConfig, aConfig) {
    }

    /**
     * Add custom logic to be executed before the intent is synchronized
     * to the network.
     * 
     * @param {string} intentType Inten-type name
     * @param {string} intentTypeVersion Inten-type version
     * @param {string} target Intent target
     * @param {object} config Intent configuration
     * @param {string} state Intent state (choice: active, suspend, delete)
     */

    static preSyncExecute(intentType, intentTypeVersion, target, config, state) {
    }

    /**
     * Add custom logic to be executed after the intent was successfully
     * synchronized to the network.
     * 
     * @param {string} intentType Inten-type name
     * @param {string} intentTypeVersion Inten-type version
     * @param {string} target Intent target
     * @param {object} config Intent configuration
     * @param {string} state Intent state (choice: active, suspend, delete)
     */

    static postSyncExecute(intentType, intentTypeVersion, target, config, state) {
    }

    /**
     * Produces an object with all state attributes to render `state.ftl`
     * Default implementation returns an object without entries.
     *
     * @param {string} intentType Inten-type name
     * @param {string} intentTypeVersion Inten-type version
     * @param {string} target Intent target
     * @param {object} config Intent configuration
     * @param {object} topology Intent topology
     * @returns {object} state attributes
     */

    static getState(intentType, intentTypeVersion, target, config, topology) {    
        return {};
    }

    /**
     * Obtain resources from resource administrator (or external).
     * Called if intent moves into planned/deployed state to ensure resources are available.
     *
     * @param {string} intentType Inten-type name
     * @param {string} intentTypeVersion Inten-type version
     * @param {string} target Intent target
     * @param {object} config Intent configuration
     */

    static obtainResources(intentType, intentTypeVersion, target, config) {
    }
  
    /**
     * Returns the name of Apache® FreeMarker™ template to be used (specific per site).
     * Generic recommendation is to use a common pattern like '{neType}.ftl'.
     * 
     * It's recommended to put FTL templates in an intent-type resource sub-directory
     * named `mappers`.
     *
     * @param {string} neId
     * @param {string} familyTypeRelease
     * @returns {string} name of the FTL file
     */

    static getTemplateName(neId, familyTypeRelease) {
        const neType = familyTypeRelease.split(':')[0];
    
        switch (neType) {
            case '7220 IXR SRLinux':
            case '7250 IXR SRLinux':
            case '7730 SXR SRLinux':
                return 'mappers/SRLinux.ftl';
            case '7750 SR':
            case '7450 ESS':
            case '7950 XRS':
            case '7250 IXR':
                return 'mappers/SR OS.ftl';
            default:
                return 'mappers/OpenConfig.ftl';
        }
    }
}