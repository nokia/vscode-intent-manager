/******************************************************************************
 * Backend functions for WebUI forms to create/update intents
 * 
 * (c) 2025 by Nokia
 ******************************************************************************/

import { NSP } from "common/NSP.mjs";

const HashMap = Java.type("java.util.HashMap");
const Arrays = Java.type("java.util.Arrays");

/**
 * This class implements common callouts for WebUI SchemaForm components
 * and corresponding helpers. To be used for pickers (leafref) and suggest
 * (auto-complete) including intent target components.
 */

export class WebUI
{
  constructor() {
  }

  /**
   * Extracts the target component from context provided by WebUI callout
   * Implementation supposed to work with _target (new) and target (deprecated).
   * In case of nest views, method will extrat target from __root container.
   * 
   * @param {ValueProviderContext} context
   * @returns object or string
   * 
   */

  getTarget(context) {
    logger.info("WebUI::getTarget({})", context.getInputValues().toJSONString());

    if (context.getInputValues().arguments.containsKey("__root")) {
      const root = context.getInputValues().arguments.__root;
      const target = Object.fromEntries(root.keySet().toArray().filter(entry => entry.startsWith('target_')).map(entry => [entry.slice(7), root[entry]]));
      if (Object.keys(target).length > 0) return target;
    }

    if (context.getInputValues().arguments.containsKey("__parent")) {
      let root = context.getInputValues().arguments;
      while (root.containsKey('__parent')) { root = root.__parent; }
      const target = Object.fromEntries(root.keySet().toArray().filter(entry => entry.startsWith('target_')).map(entry => [entry.slice(7), root[entry]]));
      if (Object.keys(target).length > 0) return target;
    }
    
    let target;
    if (context.getInputValues().containsKey("_target"))
      target = context.getInputValues()._target;
    else
      target = context.getInputValues().target;

    if (typeof target === "object")
      return Object.fromEntries(target.keySet().toArray().map(key => [key, target[key]]));
    
    return target;
  }

  /**
   * Helper function to extract ne-id from target or intent-model instance
   *
   * Search order:
   *  - Check if target contains `objectidentifier` (common for ICM intents)
   *  - Check if target contains `ne-id` (or known aliases)
   *  - Check for top-level root attributes name `ne-id` (or known aliases)
   *  - Hierarchical bottom>root lookup for `ne-id` (or aliases), starting attribute to be entered
   *
   * @param {ValueProviderContext} context
   * @returns neId (or undefined)
   */

  getNeId(context) {
    logger.info("WebUI::getNeId({})", context.getInputValues().toJSONString());
    const target = this.getTarget(context);
    const args = context.getInputValues().arguments;

    const aliases = ["ne-id", "neId", "site-id", "siteId", "node-id", "nodeId", "device-id", "deviceId", "site", "node", "device", "endpoint"];

    if (typeof target === "object") {
      if ("objectidentifier" in target) {
        const found = target.objectidentifier.match(/ne-id='([^']+)'/);
        if (found)
          return found[1];
        else
          return target.objectidentifier;
      }

      if ("ne-id" in target)
        return target['ne-id'];  

      for (const key of aliases)
        if (key in target) return target[key];
    }

    // Check schema-form (intent-model) for root elements

    for (const key of aliases)
      if (args.containsKey(key)) return args[key];

    // Check schema-form (intent-model) hierarchy

    let path = context.getInputValues().arguments.__attribute;
    while (path.lastIndexOf(".") > -1) {
      path = path.substr(0, path.lastIndexOf("."));
      let parent = args;
      path.split(".").forEach( elem => parent = parent[elem] );
      for (const key of aliases)
        if (parent.containsKey(key)) return parent[key];
    }

    if (typeof target === "string" && target.length > 0)
      return target; // assumption that target is ne-id

    logger.error("ne-id not found in target/args");
    return undefined;
  }

  /**
   * WebUI callout to get the list of objects from NSP inventory.
   *
   * Notes:
   *  - Access-control applies!
   *  - Action `nsp-inventory:find` enforces pagination (max: 1000 entries)
   *  - ComponentType is used to decide about return format (picker vs suggest)
   *
   * @param {ValueProviderContext} context
   * @param {Object} options
   * @param {string} key
   *
   * @returns Response using HashMap
   */

  inventoryCallout(context, options, key) {
    const startTS = Date.now();
    logger.info("WebUI::inventoryCallout()");

    const token = context.getInputValues().arguments.__token;
    const result = NSP.inventoryFind(options, true, token);

    const rvalue = new HashMap();
    if (result.success)
      if (context.getInputValues().arguments.__componentType === "leafRef")
        // output format is leafRef
        result.response.forEach(entry => rvalue.put(entry[key], entry));
      else
        // output format for autoComplete
        result.response.forEach(entry => rvalue.put(entry[key], entry[key]));

    const duration = Date.now()-startTS;
    logger.info("WebUI::inventoryCallout() finished within {} ms", duration|0);

    return rvalue;
  }

  /**
   * WebUI callout to get the list of nodes.
   *
   * to be used for component/type: leafref (picker)
   *
   * @param {ValueProviderContext} context
   * @returns Suggestion data in Map format
   */

  getNodes(context) {
    const options = {
      "xpath-filter": "/nsp-equipment:network/network-element",
      "fields": "ne-id;ne-name;type;version;ip-address"
    };

    return this.inventoryCallout(context, options, "ne-id");
  }

  /**
   * WebUI callout to get the list of ethernet ports of a device.
   *
   * to be used for component/type: leafref (picker)
   *
   * @param {ValueProviderContext} context
   * @returns Suggestion data in Map format
   */

  getPorts(context) {
    const neId = this.getNeId(context);
    if (typeof neId === "string" && neId.length > 0) {
      const filter = "[boolean(port-details[port-type='ethernet-port'])]";
      const options = {
        "xpath-filter": `/nsp-equipment:network/network-element[ne-id='${neId}']/hardware-component/port${filter}`,
        "fields": "name;description;port-details",
        "limit": 1000,
        "depth": 3
      };
      return this.inventoryCallout(context, options, "name");
    }

    logger.error("WebUI::getPorts() skipped! Select ne-id first!");
    return new HashMap();
  }

  /**
   * WebUI callout to get list of access ports of a device
   *
   * to be used for component/type: leafref (picker)
   *
   * @param {ValueProviderContext} context
   * @returns Suggestion data in Map format
   */

  getAccessPorts(context) {
    const neId = this.getNeId(context);
    if (typeof neId === "string" && neId.length > 0) {
      const filter = "[boolean(port-details[port-type='ethernet-port'][port-mode='access'])]";
      const options = {
        "xpath-filter": `/nsp-equipment:network/network-element[ne-id='${neId}']/hardware-component/port${filter}`,
        "fields": "name;description;port-details",
        "limit": 1000,
        "depth": 3
      };
      return this.inventoryCallout(context, options, "name");
    }

    logger.error("WebUI::getAccessPorts() skipped! Select ne-id first!");
    return new HashMap();
  }

  /**
   * WebUI callout to get the list of LAGs of a device
   *
   * to be used for component/type: leafref (picker)
   *
   * @param {ValueProviderContext} context
   * @returns Suggestion data in Map format
   */

  getLinkAggGroups(context) {
    const neId = this.getNeId(context);
    if (typeof neId === "string" && neId.length > 0) {
      const options = {
        "xpath-filter": `/nsp-equipment:network/network-element[ne-id='${neId}']/lag`,
        "fields": "name;description;lag-mode;encap-type;oper-state",
        "limit": 1000
      };
      return this.inventoryCallout(context, options, "name");
    }

    logger.error("WebUI::getLinkAggGroups() skipped! Select ne-id first!");
    return new HashMap();
  }

  /**
   * WebUI callout for device-model objects using MDC
   *
   * to be used for component/type: leafref (picker)
   *
   * @param {ValueProviderContext} context
   * @param {string} listPath example: "nokia-conf:/configure/router=Base/interface"
   * @param {list} fields example: ["description","admin-state","port"]
   *
   * @returns Suggestion data in Map format
   */

  getDeviceModelObjects(context, listPath, fields=undefined) {
    const startTS = Date.now();

    const neId = this.getNeId(context);
    const rvalue = new HashMap();

    if (neId) {
      logger.info("WebUI::getDeviceModelObjects({} {})", neId, listPath);

      const keys  = NSP.mdcListKeys(neId, listPath);
      
      if (typeof fields === "string") fields = [fields];
      const query = listPath + (fields ? "?fields=" + fields.join(";") : "?depth=2");

      const result = NSP.mdcGET(neId, query);

      if (result.success)
        Object.values(result.response)[0].forEach(entry => {
          let key = keys.map(key => entry[key]).join(",");
          if (fields?.length === 1) key = entry[fields[0]];

          if (context.getInputValues().arguments.__componentType === "leafRef")
            // output format is leafRef
            rvalue.put(key, entry);
          else
            // output format for autoComplete
            rvalue.put(key, key);
        });

      const duration = Date.now()-startTS;
      logger.info("WebUI::getDeviceModelObjects() finished within {} ms", duration|0);
    } else {
      logger.info("WebUI::getDeviceModelObjects() skipped! Select ne-id first!");
    }

    return rvalue;
  }

  /**
   * WebUI callout to get the list of all managed devices (neId) from all REST
   * mediators registered with the intent engine.
   * 
   * Notes:
   *  - Method will retun all nodes (no access-control, pagination)
   *  - To be used for autoComplete component
   *
   * @param {ValueProviderContext} context
   * @returns Suggestion data in Map format
   */

  suggestDevicesFromAllMediators(context) {
    const startTS = Date.now();
    logger.info("WebUI::suggestDevicesFromAllMediators()");

    // get connected mediators
    const mediators = [];
    mds.getAllManagersOfType("REST").forEach(mediator => {
      if (mds.getManagerByName(mediator).getConnectivityState().toString() === "CONNECTED")
        mediators.push(mediator);
    });

    // get managed devices from mediator(s)
    const devices = mds.getAllManagedDevicesFrom(Arrays.asList(mediators));

    const rvalue = new HashMap();
    devices.forEach(device => rvalue.put(device.getName(), device.getName()));

    const duration = Date.now()-startTS;
    logger.info("WebUI::suggestDevicesFromAllMediators() finished within {} ms", duration|0);

    return rvalue;
  }

  /**
   * WebUI callout to extract entries from nested config form data.
   *
   * @param {ValueProviderContext} context
   * @param {string} listPath - Path to the target (dot-separated)
   * @returns {HashMap} A HashMap containing extracted keys of the list entries found
   * 
   */

  getFormObjects(context, listPath) {
    const startTS = Date.now();
    logger.info("WebUI::getFormObjects(formdata: {}, path: {})", context.getInputValues().toJSONString(), listPath);

    let root = context.getInputValues().arguments;
    while (root.containsKey('__parent')) 
      root = root.__parent;

    const pathelements = listPath.split('.');
    const key = pathelements.pop();

    const entries = pathelements.reduce((subtree, pathelement) =>
        subtree.flatMap(obj => (obj && obj.containsKey(pathelement) ? obj[pathelement] : [])), [root]);

    const rvalue = new HashMap;
    entries.forEach(entry => rvalue.put(entry[key], entry));

    const duration = Date.now()-startTS;
    logger.info("WebUI::getFormObjects() finished within {} ms", duration|0);

    return rvalue;
  }
}