/******************************************************************************
 * ABSTRACT INTENT-HANDLER IMPLEMENTATION
 *
 * (c) 2025 by Nokia
 ******************************************************************************/

import { NSP } from "common/NSP.mjs";
import { WebUI } from "common/WebUI.mjs";

const ValidateResult = Java.type("com.nokia.fnms.controller.ibn.intenttype.spi.ValidateResult");
const SynchronizeResult = Java.type("com.nokia.fnms.controller.ibn.intenttype.spi.SynchronizeResult");
const AuditReport = Java.type("com.nokia.fnms.controller.ibn.intenttype.spi.AuditReport");
const MisAlignedObject = Java.type("com.nokia.fnms.controller.ibn.intenttype.spi.MisAlignedObject");
const MisAlignedAttribute = Java.type("com.nokia.fnms.controller.ibn.intenttype.spi.MisAlignedAttribute");

const ArrayList = Java.type("java.util.ArrayList");

/**
 * IntentHandlers implements the formal contract with the intent-engine (JAVA IBN).
 * Implementation is common for abstract intent-types and must not be changed!
 *
 * Designers must consider to extend class definition following object-oriented
 * programming principles in the following cases:
 *   Adding callouts for WebUI picker/suggest (view-config/target)
 *   Adding callouts to execute custom RPCs
 *   Adding migration handlers
 *
 * All members and methods of IntentHandler are public to allowing to override
 * behavior as needed. This can be useful to customize the implementation to
 * become compatible with NSP front-end apps. Like in the case of IBSF it must
 * be considered to override the sync behavior to enable async deployments
 * using job-manager.
 */

export class IntentHandler extends WebUI
{
  /**
   * Constructor is called during IntentHandler object creation
   *
   * Only one IntentHandler object is created. This object is shared between
   * all intent instances of this intent-type/version. Constructor is called
   * when the intent-type is created/updated in the intent-engine.
   */

  constructor() {
    super();

    this.mdcKeys = {};
    this.deviceCache = {};
    this.dcLastUpdated = -1;
    this.enableApprovedMisalignments = undefined;

    this.unitTests();
  }

  /**************************************************************************
   * Intent Logic
   * 
   * Design your own intent-handler class to customize the default behavior.
   * Extend IntentHandler and augment/adjust as needed.
   **************************************************************************/

  /**
   * Produces a list of sites `[neId: string]` to be configured by this intent.
   * Default implementation returns `[target]` (single-entry list), used for
   * site-level templates (golden configuration).
   * 
   * @param {string} target Intent target
   * @param {object} config Intent config
   * @returns {string[]} List of sites (ne-id) to be configured
   */

  getSites(target, config) {
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

  getSiteParameters(intentType, intentTypeVersion, target, config, siteNames) {
    const sites = Object.values(config); // top-level container has the details
    sites[0]["ne-id"] = target;
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

  getGlobalParameters(intentType, intentTypeVersion, target, config) {
    return Object.values(config)[0]; // top-level container has the details
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

  getState(intentType, intentTypeVersion, target, config, topology) {    
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

  obtainResources(intentType, intentTypeVersion, target, config) {
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

  getTemplateName(neId, familyTypeRelease) {
      const neType = familyTypeRelease.split(":")[0];

      if (["7250 IXR", "7450 ESS", "7750 SR", "7950 XRS"].includes(neType))
          return "mappers/SR OS.ftl";

      if (familyTypeRelease.includes("SRLinux"))
          return "mappers/SRLinux.ftl";

      if (familyTypeRelease.includes("Ciena"))
          return "mappers/SAOS.ftl";

      if (familyTypeRelease.includes("IOS-XR"))
          return "mappers/IOS-XR.ftl";

      if (familyTypeRelease.includes("Juniper"))
          return "mappers/JunOS MX.ftl";

      // default: OpenConfig
      return "mappers/OpenConfig.ftl";
  }

  /**************************************************************************
   * Intent Hooks
   * 
   * Design your own intent-handler class to customize the default behavior.
   * Extend IntentHandler and augment/adjust as needed.
   **************************************************************************/

  /**
   * Hook to add custom intent-type specific validation logic.
   * It will be executed in addition to YANG validation and common validation rules.
   * Default implementation does not have any extra validation rules.
   * 
   * @param {string} intentType Inten-type name
   * @param {string} intentTypeVersion Inten-type version
   * @param {string} target Intent target
   * @param {object} config Intent configuration
   * @param {object} contextualErrorJsonObj used to return list of validation errors (key/value pairs)
   */

  validateHook(intentType, intentTypeVersion, target, config, contextualErrorJsonObj) {
  }

  /**
   * Hook to add custom intent-type specific logic to update desired and/or actual
   * device configuration before comparing both as part of an audit.
   * 
   * @param {string} neId site identifier
   * @param {string} path device-level model path
   * @param {object} aConfig actual device configuration
   * @param {object} iConfig intented configuration (desired)
   */

  preAuditHook(neId, path, aConfig, iConfig) {
  }

  /**
   * Hook to add custom intent-type specific logic to be executed before
   * the intent configuration is pushed to the network as part of synchronize.
   * 
   * @param {string} intentType Inten-type name
   * @param {string} intentTypeVersion Inten-type version
   * @param {string} target Intent target
   * @param {object} config Intent configuration
   * @param {string} state Intent state (choice: active, suspend, delete)
   */

  preSyncHook(intentType, intentTypeVersion, target, config, state) {
  }

  /**
   * Hook to add custom intent-type specific logic to be executed after
   * the intent configuration was successfully pushed to the network as
   * part of synchronize.
   * 
   * @param {string} intentType Inten-type name
   * @param {string} intentTypeVersion Inten-type version
   * @param {string} target Intent target
   * @param {object} config Intent configuration
   * @param {string} state Intent state (choice: active, suspend, delete)
   */

  postSyncHook(intentType, intentTypeVersion, target, config, state) {
  }

  /**************************************************************************
   * Internal helper methods of IntentHandler
   **************************************************************************/

  /**
   * Safe method to convert and object into a JSON string for logging purposes,
   * while avoiding exceptions because of circular references.
   */

  static inspect(obj) {
    const loggedAlready = new Set();

    return JSON.stringify(obj, (key, value) => {
      if (typeof value === "object" && value !== null) {
        if (loggedAlready.has(value))
          return "### skipped, logged already ###";
        loggedAlready.add(value);
      }
      return value;
    });
  }

  /**
   * Updates the device-cache to translate `ne-id` to `ne-name`. Method is called
   * by methods `synchronize()` and `onAudit()`. A single instance of this cache is
   * persisted for all intents for this intent-type/version. If the cache is considered
   * up-to-date (last update within the last 5min), the update request is skipped.
   */

  updateDeviceCache() {
    const startTS = Date.now();

    if (startTS - this.dcLastUpdated < 300000)
      // Keep cache! Content was updated within the last 5min
      return;

    this.dcLastUpdated = startTS;
    logger.debug("IntentHandler::updateDeviceCache()");

    const managerInfo = mds.getManagerByName("NSP");
    if (managerInfo.getConnectivityState().toString() === "CONNECTED") {
      restClient.setIp(managerInfo.getIp());
      restClient.setPort(managerInfo.getPort());
      restClient.setProtocol(managerInfo.getProtocol().toString());

      const url = "https://restconf-gateway/restconf/operations/nsp-inventory:find";
      const options = {
        "xpath-filter": "/nsp-equipment:network/network-element",
        "fields": "ne-id;ne-name",
        "include-meta": false,
        "offset": 0
      };

      let total=1;
      let offset=0;
      let newCache = {};

      while (offset<total) {
        options.offset = offset;
        restClient.post(url, "application/json", JSON.stringify({"input": options}), "application/json", (exception, httpStatus, response) => {
          if (exception) {
            logger.error("Exception {} occured.", exception);
            this.dcLastUpdated = -1;
            total = offset;
          }
          else if (httpStatus >= 400) {
            // Either client error (4xx) or server error (5xx)
            logger.warn("NSP response: {} {}", httpStatus, response);
            this.dcLastUpdated = -1;
            total = offset;
          }
          else {
            const output = JSON.parse(response)["nsp-inventory:output"];
            total = output["total-count"];
            offset = output["end-index"]+1;
            output.data.forEach(entry => newCache[entry["ne-id"]] = entry["ne-name"]);
          }
        });
      }

      this.deviceCache = newCache;
      this.dcLastUpdated = Date.now();
      logger.info("device cache updated: {} entries", total);
    }

    const duration = Date.now()-startTS;
    logger.debug("IntentHandler::updateDeviceCache() finished within {} ms", duration|0);
  }

  /**
   * JSONPath 0.8.4 - XPath for JSON
   * available from https://code.google.com/archive/p/jsonpath/
   *
   * Copyright (c) 2007 Stefan Goessner (goessner.net)
   * Licensed under the MIT (MIT-LICENSE.txt) licence.
   *
   * @param {} obj
   * @param {} expr
   * @param {} arg
   * @returns result
   *
   * @throws SyntaxError
   */

  jsonPath(obj, expr, arg) {
    var P = {
      resultType: arg && arg.resultType || "VALUE",
      result: [],
      normalize: function(expr) {
         var subx = [];
         return expr.replace(/[['](\??\(.*?\))[\]']|\['(.*?)'\]/g, function($0,$1,$2){return "[#"+(subx.push($1||$2)-1)+"]";})
                    .replace(/'?\.'?|\['?/g, ";")
                    .replace(/;;;|;;/g, ";..;")
                    .replace(/;$|'?\]|'$/g, "")
                    .replace(/#([0-9]+)/g, function($0,$1){return subx[$1];});
      },
      asPath: function(path) {
         var x = path.split(";"), p = "$";
         for (var i=1,n=x.length; i<n; i++)
            p += /^[0-9*]+$/.test(x[i]) ? ("["+x[i]+"]") : ("['"+x[i]+"']");
         return p;
      },
      store: function(p, v) {
         if (p) P.result[P.result.length] = P.resultType == "PATH" ? P.asPath(p) : v;
         return !!p;
      },
      trace: function(expr, val, path) {
         if (expr !== "") {
            var x = expr.split(";"), loc = x.shift();
            x = x.join(";");
            if (val && Object.prototype.hasOwnProperty.call(val, loc))
               P.trace(x, val[loc], path + ";" + loc);
            else if (loc === "*")
               P.walk(loc, x, val, path, function(m,l,x,v,p) { P.trace(m+";"+x,v,p); });
            else if (loc === "..") {
               P.trace(x, val, path);
               P.walk(loc, x, val, path, function(m,l,x,v,p) { typeof v[m] === "object" && P.trace("..;"+x,v[m],p+";"+m); });
            }
            else if (/^\(.*?\)$/.test(loc)) // [(expr)]
               P.trace(P.eval(loc, val, path.substr(path.lastIndexOf(";")+1))+";"+x, val, path);
            else if (/^\?\(.*?\)$/.test(loc)) // [?(expr)]
               P.walk(loc, x, val, path, function(m,l,x,v,p) { if (P.eval(l.replace(/^\?\((.*?)\)$/,"$1"), v instanceof Array ? v[m] : v, m)) P.trace(m+";"+x,v,p); });
            else if (/^(-?[0-9]*):(-?[0-9]*):?([0-9]*)$/.test(loc)) // [start:end:step]  phyton slice syntax
               P.slice(loc, x, val, path);
            else if (/,/.test(loc)) { // [name1,name2,...]
               for (var s=loc.split(/'?,'?/),i=0,n=s.length; i<n; i++)
                  P.trace(s[i]+";"+x, val, path);
            }
         }
         else
            P.store(path, val);
      },
      walk: function(loc, expr, val, path, f) {
         if (val instanceof Array) {
            for (var i=0,n=val.length; i<n; i++)
               if (i in val)
                  f(i,loc,expr,val,path);
         }
         else if (typeof val === "object") {
            for (var m in val)
              if (Object.prototype.hasOwnProperty.call(val, m))
                  f(m,loc,expr,val,path);
         }
      },
      slice: function(loc, expr, val, path) {
         if (val instanceof Array) {
            var len=val.length, start=0, end=len, step=1;
            loc.replace(/^(-?[0-9]*):(-?[0-9]*):?(-?[0-9]*)$/g, function($0,$1,$2,$3){start=parseInt($1||start);end=parseInt($2||end);step=parseInt($3||step);});
            start = (start < 0) ? Math.max(0,start+len) : Math.min(len,start);
            end   = (end < 0)   ? Math.max(0,end+len)   : Math.min(len,end);
            for (var i=start; i<end; i+=step)
               P.trace(i+";"+expr, val, path);
         }
      },
      eval: function(x, _v, _vname) {
         try { return $ && _v && eval(x.replace(/@/g, "_v")); }
         catch(e) { throw new SyntaxError("jsonPath: " + e.message + ": " + x.replace(/@/g, "_v").replace(/\^/g, "_a")); }
      }
    };

    var $ = obj;
    if (expr && obj && (P.resultType == "VALUE" || P.resultType == "PATH")) {
       P.trace(P.normalize(expr).replace(/^\$;?/,""), obj, "$");
       return P.result.length ? P.result : false;
    }
  }

  /**
   * Load labels from `meta-info.json`. Checks, if intent-type supports `ApprovedMisalgnments`.
   * In case of `InfrastructureConfiguration`, approved misalignments are not supported.
   */

  loadMetainfo(intentType, intentTypeVersion) {
    if (this.enableApprovedMisalignments === undefined) {
      const startTS = Date.now();
      logger.debug("IntentHandler::loadMetainfo({}, {})", intentType, intentTypeVersion);

      const managerInfo = mds.getManagerByName("NSP");
      if (managerInfo.getConnectivityState().toString() === "CONNECTED") {
        restClient.setIp(managerInfo.getIp());
        restClient.setPort(managerInfo.getPort());
        restClient.setProtocol(managerInfo.getProtocol().toString());

        const url = "https://restconf-gateway/restconf/operations/ibn-administration:search-intent-types";
        const body = JSON.stringify({"ibn-administration:input": {"filter": {"name": intentType, "version": intentTypeVersion}}});

        restClient.post(url, "application/json", body, "application/json", (exception, httpStatus, response) => {
          const duration = Date.now()-startTS;
          logger.info("POST {} {} finished within {} ms", url, body, duration|0);

          if (exception) {
            logger.error("Exception {} occured.", exception);
          }
          else if (httpStatus >= 400) {
            // Either client error (4xx) or server error (5xx)
            logger.warn("NSP response: {} {}", httpStatus, response);
          } else {
            // 2xx - Success
            logger.info("NSP response: {} {}", httpStatus, response);
            const labels = JSON.parse(response)["ibn-administration:output"]["intent-type"][0].label;

            this.enableApprovedMisalignments = labels.includes("ApprovedMisalignments");
            if (this.enableApprovedMisalignments)
              logger.info("enableApprovedMisalignments is ENABLED");
          }
        });
      } else {
        logger.error("NSP mediator is disconnected.");
      }

      const duration = Date.now()-startTS;
      logger.debug("IntentHandler::loadMetainfo() finished within {} ms", duration|0);
    }
  }

  /**
   * Checks if the string provided is an IPv6 address or prefix
   * 
   * @param {string} value
   * @returns true if text is a valid IPv6 address, netmask or prefix
   */

  isIPv6(value) {
    // check for correct data-type
    if (typeof value !== "string")
      return false;

    // split addr from prefix-len and validate prefix-len, if present
    const [addr, prefix] = value.split('/');
    if (prefix && (!/^\d{1,3}$/.test(prefix) || parseInt(prefix, 10) > 128))
      return false;

    if (addr.split(":").length > 7)
      return false;

    // strict ipv6 validation with optional embedded ipv4
    const ipv6Regex = new RegExp(
      "^(" +
        "([a-f0-9]{1,4}:){7}[a-f0-9]{1,4}|" +  // Full form
        "(([a-f0-9]{1,4}:)+|:)(:|(:[a-f0-9]{1,4})+)|" +  // Compressed form
        "([a-f0-9]{1,4}:){1,4}:((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)|" +  // IPv4 embedded
        "::(ffff(:0{1,4}){0,1}:)?((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)" +  // IPv4-mapped "::ffff:x.x.x.x"
      ")$"
    );

    return ipv6Regex.test(addr.toLowerCase());
  }

  /**
   * Convert IPv6 address to normalized format
   * Supports IPv4-mapped and embedded addresses
   * 
   * @param {string} addr - IPv6 address
   * @returns RFC5932 compliant IPv6 address
   */
  
  normalizeIPv6(addr) {
    logger.debug(`IntentHandler::normalizeIPv6(${addr})`);
    const startTS = Date.now();

    let prefix = ""; 
    if (addr.includes("/"))
        [addr, prefix] = addr.split("/");

    // Handle embedded IPv4 addresses
    if (addr.includes("."))
      addr = addr.replace(/(\d+)\.(\d+)\.(\d+)\.(\d+)/g, (_, a, b, c, d) => ((+a << 8) | +b).toString(16) + ":" + ((+c << 8) | +d).toString(16));

    // Adjust ::ffff:<IPv4> notation
    if (addr.startsWith("::ffff:"))
      addr = `::ffff:${addr.substring(7).split(":").flatMap(h => [parseInt(h, 16) >> 8, parseInt(h, 16) & 0xFF]).join(".")}`;

    // Expand "::"
    if (addr.includes("::")) {
      const provided = addr.split(":").filter(Boolean).length;
      addr = addr.replace(/::/, `:${"0:".repeat(8-provided)}`).trim(":");
    }

    // Remove leading zeros from all parts
    addr = addr.toLowerCase().split(":").map(part => part.replace(/^0+/, '') || '0').join(":");

    // Identify the longest zero sequence for "::" compression
    const zeroSequences = addr.match(/(^|:)(0:)+(0$)?/g);
    if (zeroSequences) {
        const longestMatch = zeroSequences.reduce((longest, current) => current.length > longest.length ? current : longest);
        addr = addr.replace(longestMatch, "::");
    }

    // Reattach prefix if present
    if (prefix) addr += `/${prefix}`;

    const duration = Date.now() - startTS;
    logger.debug(`IntentHandler::normalizeIPv6() returns ${addr}, duration ${duration} ms`);

    return addr;
  }

  assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(`❌ Unit Testing Failed: ${message} | Expected: '${expected}', Got: '${actual}'`);
    } else {
        logger.info(`✅ Passed: ${message}`);
    }
  }

  unitTests() {
    [
      { input: "2001:db8::1", expected: "2001:db8::1", msg: "Basic IPv6 format" },
      { input: "1234:0:1231:2131::123.2.2.2/120", expected: "1234:0:1231:2131::7b02:202/120", msg: "IPv4-embedded address" },
      { input: "::192.0.2.128", expected: "::c000:280", msg: "Shortened IPv4-mapped format" },
      { input: "::ffff:c000:280", expected: "::ffff:192.0.2.128", msg: "Expanded IPv4 in ::ffff notation" },
      { input: "2001:0db8:0000:0000:0000:ff00:0042:8329", expected: "2001:db8::ff00:42:8329", msg: "Long form to RFC 5952" },
      { input: "0000:0000:0000:0000:0000:0000:0000:0001", expected: "::1", msg: "Loopback address compression" },
      { input: "ffff:ffff:ffff:ffff:0000:0000:0000:0000", expected: "ffff:ffff:ffff:ffff::", msg: "Trailing zero suppression" },
    ].forEach(({ input, expected, msg }) => this.assertEqual(this.normalizeIPv6(input), expected, msg));

    [
      { input: "::1", expected: true, msg: "Valid Loopback address (short form)" },
      { input: "2001:db8::1", expected: true, msg: "Valid IPv6 address" },
      { input: "2001:db8::/32", expected: true, msg: "Valid IPv6 prefix" },
      { input: "::ffff:192.168.1.1", expected: true, msg: "Valid IPv4-mapped IPv6 address" },
      { input: "::192.168.1.1", expected: true, msg: "Valid IPv4-compatible IPv6 address" },
      { input: "2001:db8::/129", expected: false, msg: "Invalid IPv6 prefix (out of range)" },
      { input: "12345::aaaa", expected: false, msg: "Invalid IPv6 address (hextet too long)" },
      { input: "abcd::/ 64", expected: false, msg: "Invalid prefix with extra space" },
      { input: "abcd::/999", expected: false, msg: "Invalid prefix (out of range)" },
      { input: "2001:db8:::1", expected: false, msg: "Invalid IPv6 address (triple colons)" },
      { input: "192.168.1.1", expected: false, msg: "Invalid IPv6 address (IPv4 address)" },
      { input: "::gggg", expected: false, msg: "Invalid IPv6 address (none-hex characters)" },
    ].forEach(({ input, expected, msg }) => this.assertEqual(this.isIPv6(input), expected, msg));

    logger.info(`🎉 All tests passed!`);
  }

  /**
   * Get list-key for path from cache, or query from MDC if not cached yet.
   * 
   * @param {string} neId Device identifier
   * @param {string} listPath Device path
   * @returns listKeys[]
   */
  
  getListKeys(neId, listPath) {
     // remove instance identifiers from path:
    const path = listPath.replace(/=[^/]+/g, '');

    if (!(path in this.mdcKeys)) {
      this.mdcKeys[path] = NSP.mdcListKeys(neId, path);
      logger.info('list-key cache updated: {}', JSON.stringify(this.mdcKeys));
    }

    return this.mdcKeys[path];
  }

  /**
   * Audit helper to compare intented vs actual config
   *
   * @param {string} neId required for fetching model info
   * @param {string} basePath target root path of the object under audit
   * @param {Object} aCfg actual config (observed from device)
   * @param {Object} iCfg intended config (desired)
   * @param {string} mode operation: create, replace, merge, delete
   * @param {string[]} ignore list of children subtree to ignore
   * @param {AuditReport} auditReport used to report differences
   * @param {string} obj object reference used for report
   * @param {string} path used to build up relative path (recursive)
   */

  compareConfig(neId, basePath, aCfg, iCfg, mode, ignore, auditReport, obj, path) {
    const startTS = Date.now();
    logger.debug("IntentHandler::compareConfig(neId={}, basePath={}, path={})", neId, basePath, path);

    for (const key in iCfg) {
      if (key in aCfg) {
        // handle differences in encoding numeric values between MDC and IM (especially union type) 
        if (typeof iCfg[key] === "string" && typeof aCfg[key] === "number") aCfg[key] = String(aCfg[key]);
        if (typeof iCfg[key] === "number" && typeof aCfg[key] === "string") iCfg[key] = String(iCfg[key]);

        if (typeof iCfg[key] !== typeof aCfg[key]) {
          // mismatch: type is different
          auditReport.addMisAlignedAttribute(new MisAlignedAttribute("/"+basePath+"/"+path+key, "type "+typeof iCfg[key], "type "+typeof aCfg[key], obj));
        } else if (!(iCfg[key] instanceof Object)) {
          if (iCfg[key] !== aCfg[key]) {
            if (this.isIPv6(iCfg[key]) && this.normalizeIPv6(iCfg[key]) === aCfg[key])
              // aligned IPv6 addresses (after normalization)
              logger.debug(`Matching IPv6 addresses: ${iCfg[key]} === ${aCfg[key]}`);
            else
              // mismatch: value is different
              auditReport.addMisAlignedAttribute(new MisAlignedAttribute("/"+basePath+"/"+path+key, iCfg[key].toString(), aCfg[key].toString(), obj));
          } else {
            // aligned: type/value are same
          }
        } else if (Array.isArray(iCfg[key])) {
          if ((iCfg[key].length > 0) && (iCfg[key][0] instanceof Object) || (aCfg[key].length > 0) && (aCfg[key][0] instanceof Object)) {
            // children is a yang list
            // group by list-key and look one level deeper
            const keys = this.getListKeys(neId, basePath+"/"+path+key);

            const iCfgConverted = iCfg[key].reduce((rdict, entry) => {
              const value = keys.map( key => encodeURIComponent(entry[key]) ).join(",");
              rdict[value] = entry;
              return rdict;
            }, {});

            const aCfgConverted = aCfg[key].reduce((rdict, entry) => {
              const value = keys.map( key => encodeURIComponent(entry[key]) ).join(",");
              rdict[value] = entry;
              return rdict;
            }, {});

            this.compareConfig(neId, basePath, aCfgConverted, iCfgConverted, mode, ignore, auditReport, obj, path+key+"=");
          } else {
            const iVal = JSON.stringify(iCfg[key]);
            const aVal = JSON.stringify(aCfg[key]);
            if (iVal !== aVal) {
              auditReport.addMisAlignedAttribute(new MisAlignedAttribute("/"+basePath+"/"+path+key, iVal, aVal, obj));
            }
          }
        } else {
          // children is a yang container
          // look one level deeper
          this.compareConfig(neId, basePath, aCfg[key], iCfg[key], mode, ignore, auditReport, obj, path+key+"/");
        }
      } else {
        if (iCfg[key] instanceof Object) {
          // mismatch: list/container is unconfigured

          const iVal = JSON.stringify(iCfg[key]);
          if ((iVal === "{}") || (iVal === "[]") || (iVal === "[null]"))
            auditReport.addMisAlignedAttribute(new MisAlignedAttribute("/"+basePath+"/"+path+key, iVal, null, obj));
          else
            // missing object: is-configured=true, is-undesired=default(false)
            auditReport.addMisAlignedObject(new MisAlignedObject("/"+basePath+"/"+path+key, true, neId));
        } else {
          // mismatch: leaf is unconfigured
          auditReport.addMisAlignedAttribute(new MisAlignedAttribute("/"+basePath+"/"+path+key, iCfg[key].toString(), null, obj));
        }
      }
    }

    // undesired nodal attributes (only in mode create/replace)
    if (mode !== "merge") {
      for (const key in aCfg) {
        if (!(key in iCfg)) {
          // Possibility to exclude children (pre-approved misalignments) that match the list provided.
          // Current Restrictions:
          //  (1) Intent config (icfg) must not contain attributes that match the ignored children 
          //  (2) Intent config (icfg) must contain the direct parents of the ignored children

          let found = "";
          const aKey = path+key;
          for (const idx in ignore) {
            if (aKey.startsWith(ignore[idx])) {
              found = ignore[idx];
              break;
            }
          }

          if (!found) {
            if (aCfg[key] instanceof Object) {
              // mismatch: undesired list/container

              const aVal = JSON.stringify(aCfg[key]);
              if ((aVal === "{}") || (aVal === "[]") || (aVal === "[null]"))
                auditReport.addMisAlignedAttribute(new MisAlignedAttribute("/"+basePath+"/"+aKey, null, aVal, obj));
              else
                // undesired object: is-configured=true, is-undesired=default(true)
                auditReport.addMisAlignedObject(new MisAlignedObject("/"+basePath+"/"+aKey, true, neId, true));
            } else {
              // mismatch: additional leaf
              auditReport.addMisAlignedAttribute(new MisAlignedAttribute("/"+basePath+"/"+aKey, null, aCfg[key].toString(), obj));
            }
          }
        }
      }
    }

    const duration = Date.now()-startTS;
    logger.debug("IntentHandler::compareConfig(neId={}, basePath={}, path={}) finished within {} ms", neId, basePath, path,  duration|0);
  }

  /**
   * Audit helper to compare intented vs actual state
   *
   * @param {string} neId ne-id, required for fetching model info
   * @param {Object} aState actual state (observed from device)
   * @param {Object} iState intended state (desired)
   * @param {AuditReport} auditReport used to report differences
   * @param {string} obj object reference used for report
   *
   * @throws {Error}
   */

  compareState(neId, aState, iState, auditReport, qPath) {
    const startTS = Date.now();
    logger.debug("IntentHandler::compareState(neId={}, qPath={})", neId, qPath);

    const siteName = neId;
    for (const key in iState) {
      if (iState[key] instanceof Object) {
        const path = iState[key].path;
        const aValue = this.jsonPath(aState, path);

        for (const check in iState[key]) {
          if (check !== "path") {
            const iValue = iState[key][check];
            if (aValue && aValue.length > 0) {
              let match = true;
              switch (check) {
                case "equals":
                case "matches":
                  match = (aValue[0] === iValue);
                  break;
                case "contains":
                case "includes":
                  match = (aValue[0].indexOf(iValue) != -1);
                  break;
                case "startsWith":
                  match = (aValue[0].startsWith(iValue));
                  break;
                case "endsWith":
                  match = (aValue[0].endsWith(iValue));
                  break;
                case "regex":
                  match = RegExp(iValue).test(aValue[0]);
                  break;
                default:
                  throw new Error(`Unsupported match-type '${check}' for path '${path}', value '${iValue}'`);
              }
              if (!match)
                auditReport.addMisAlignedAttribute(new MisAlignedAttribute("/"+qPath+"/"+key, iValue.toString(), aValue[0].toString(), siteName));
            } else {
              auditReport.addMisAlignedAttribute(new MisAlignedAttribute("/"+qPath+"/"+key, iValue.toString(), null, siteName));
            }
          }
        }
      } else if (key in aState) {
        if (iState[key] !== aState[key])
          auditReport.addMisAlignedAttribute(new MisAlignedAttribute("/"+qPath+"/"+key, iState[key].toString(), aState[key].toString(), siteName));
      } else {
        auditReport.addMisAlignedAttribute(new MisAlignedAttribute("/"+qPath+"/"+key, iState[key].toString(), null, siteName));
      }
    }

    const duration = Date.now()-startTS;
    logger.debug("IntentHandler::compareState(neId={}, qPath={}) finished within {} ms", neId, qPath,  duration|0);
  }

  /**
   * Renders the FreeMarker template for the intent site and returns the
   * corresponding site-level objects for config, health, and indicators
   *
   * This common method is used for audit, sync, and state to consistently
   * produce the input to render the template.
   *
   * Exceptions will contain user-friendly error messages, while logs
   * will have all the necessary details for troubleshooting.
   *
   * @param {string} intentType Inten-type name
   * @param {string} intentTypeVersion Inten-type version
   * @param {string} target Intent target
   * @param {Object} global Global parameters (same for all sites)
   * @param {Object} site   Site-specific parameters
   * @param {string} mode   "audit" or "sync"
   *
   * @returns {Object} site-specific objects
   *
   * @throws Error
   */

  getSiteObjects(intentType, intentTypeVersion, target, global, site, mode) {
    const neId = site["ne-id"];
    const neInfo = mds.getAllInfoFromDevices(neId);
    const neFamilyTypeRelease = neInfo.get(0).getFamilyTypeRelease();
    const neType = neFamilyTypeRelease.split(":")[0];
    const neVersion = neFamilyTypeRelease.split(":")[1];

    const templateName = this.getTemplateName(neId, neType);

    let template;
    try {
      template = resourceProvider.getResource(templateName);
    } catch (exception) {
      logger.error("Exception reading resource '{}': {}", templateName, exception);
      throw new Error(`Deploy-template '${templateName}' for node ${site["ne-name"]} (ne-id: ${neId}) not found!`);
    }

    const input = {
      "intentType": intentType,
      "intentTypeVersion": intentTypeVersion,
      "target": target,
      "site": site,
      "global": global,
      "neType": neType,
      "neVersion": neVersion,
      "familyTypeRelease": neFamilyTypeRelease,
      "mode": mode
    };

    let siteObjectsJSON;
    try {
      siteObjectsJSON = utilityService.processTemplate(template, input);
    } catch (exception) {
      logger.error("Exception rendering FTL for node {} (ne-id: {}): {}", this.deviceCache[neId], neId, exception);
      logger.error("Template: {}", templateName);
      logger.error("Input:    {}", IntentHandler.inspect(input));

      throw new Error(`Deploy-template '${templateName}' issue for node ${this.deviceCache[neId]} (ne-id: ${neId}): FTL Error`);
    }

    try {
      return JSON.parse(siteObjectsJSON);
    } catch (exception) {
      logger.error("Exception parsing FTL-rendered JSON for node {} (ne-id: {}): {}", this.deviceCache[neId], neId, exception);
      logger.error("Template: {}", templateName);
      logger.error("Input:    {}", IntentHandler.inspect(input));
      logger.error("Output:   {}", siteObjectsJSON);

      throw new Error(`Deploy-template '${templateName}' issue for node ${this.deviceCache[neId]} (ne-id: ${neId}): JSON Error`);
    }
  }

  /**************************************************************************
   * Public methods of IntentHandler
   *
   * Entrypoints defined/called by IBN Engine (JAVA)
   **************************************************************************/

  /**
   * Validation of intent config/target that is automatically called for intent
   * create/edit and state-change operations.
   *
   * If the intent config is identified invalid, the create/edit operation will
   * fail. Execution happens before synchronize() to ensure intent data is valid.
   *
   * In this particular case we are validating if the device is known to the
   * mediator and if the corresponding freemarker template (ftl) could be loaded.
   *
   * @param {SynchronizeInput} input input provided by intent-engine
   * @returns {ValidateResult}
   *
   * @throws ContextErrorException
   */

  validate(input) {
    const startTS = Date.now();
    logger.info("IntentHandler::validate()");

    const target = input.getTarget();
    const intentType = input.getIntentType();
    const intentTypeVersion = input.getIntentTypeVersion();

    const config = JSON.parse(input.getJsonIntentConfiguration())[0];

    const contextualErrorJsonObj = {};
    const validateResult = new ValidateResult();

    this.getSites(target, config).forEach(neId => {
      const neInfo = mds.getAllInfoFromDevices(neId);

      if (neInfo === null || neInfo.size() === 0) {
        contextualErrorJsonObj["Node not found"] = neId;
      } else {
        const neFamilyTypeRelease = neInfo.get(0).getFamilyTypeRelease();
        if (neFamilyTypeRelease === null) {
          contextualErrorJsonObj["Family/Type/Release unkown"] = neId;
        } else {
          const neType = neFamilyTypeRelease.split(":")[0];
          const templateName = this.getTemplateName(neId, neType);
          try {
            resourceProvider.getResource(templateName);
          } catch {
            if (neId in this.deviceCache)
              contextualErrorJsonObj["Device-type unsupported"] = `Template '${templateName}' for node ${this.deviceCache[neId]} (ne-id: ${neId}) not found!`;
            else
              contextualErrorJsonObj["Device-type unsupported"] = `Template '${templateName}' for node ${neId} not found!`;
          }
        }
      }
    });

    this.validateHook(intentType, intentTypeVersion, target, config, contextualErrorJsonObj);

    const duration = Date.now()-startTS;
    logger.info("IntentHandler::validate() finished within {} ms", duration|0);

    if (Object.keys(contextualErrorJsonObj).length !== 0)
      utilityService.throwContextErrorException(contextualErrorJsonObj);

    return validateResult;
  }

  /**
   * Deployment of intents to the network, called for synchronize operations.
   * Used to apply create, update, delete and reconcile to managed devices.
   *
   * All objects created are remembered/restored as part of topology/extra-data
   * to enable update and delete operations removing network objects that are
   * no longer required (house-keeping).
   *
   * In the deployment template (ftl) it's recommended to use operations "replace",
   * "merge", or "remove". The usage of "create" must be avoided, because it fails
   * if the network object already exists (use "replace" instead). The usage of
   * "delete" must be avoided, because it fails if the network object does not
   * exists (use "remove" instead).
   *
   * @param {SynchronizeInput} input information about the intent to be synchronized
   * @returns {SynchronizeResult} provide information about the execution/success back to the engine
   */

  async synchronize(input) {
    const startTS = Date.now();

    const state = input.getNetworkState().name();
    const target = input.getTarget();
    const intentType = input.getIntentType();
    const intentTypeVersion = input.getIntentTypeVersion();

    logger.info("IntentHandler::synchronize() in state {} ", state);

    const syncResult = new SynchronizeResult();

    const config = JSON.parse(input.getJsonIntentConfiguration())[0];
    let topology = input.getCurrentTopology();

    const syncErrors = [];
    let sitesConfigs = {};
    let sitesCleanups = {};

    try {
      // hook to be executed before syncing to the network
      this.preSyncHook(intentType, intentTypeVersion, target, config, state);

      // Update device-cache (as needed)
      this.updateDeviceCache();

      const yangPatchTemplate = resourceProvider.getResource("common/patch.ftl");

      // Recall nodal configuration elements from previous synchronize (for cleanup/housekeeping)
      if (topology && topology.getXtraInfo()!==null && !topology.getXtraInfo().isEmpty()) {
        topology.getXtraInfo().forEach(item => {
          if (item.getKey() === "sitesCleanups") {
            sitesCleanups = JSON.parse(item.getValue());
            sitesConfigs  = JSON.parse(item.getValue()); // deep-clone of sitesCleanups
            logger.info("sitesCleanups restored: {}", item.getValue());
          }
        });
      }

      // Secure resources from Resource Admin
      // Right now, we are assuming that reservation is required in any state but delete

      if (state !== "delete")
        this.obtainResources(intentType, intentTypeVersion, target, config);

      if (state === "active") {
        const global = this.getGlobalParameters(intentType, intentTypeVersion, target, config);

        // Iterate sites to populate/update sitesConfigs per target device
        this.getSiteParameters(intentType, intentTypeVersion, target, config, this.deviceCache).forEach(site => {
          const neId = site["ne-id"];
          site["ne-name"] = this.deviceCache[neId];
          const objects = this.getSiteObjects(intentType, intentTypeVersion, target, global, site, "sync");

          if (!(neId in sitesConfigs))
            sitesConfigs[neId] = {};

          for (const objectName in objects) {
            if ("config" in objects[objectName]) {
              sitesConfigs[neId][objectName] = objects[objectName].config;

              if (objects[objectName].config.value) {
                let desiredConfig = objects[objectName].config.value;

                if (objects[objectName].config.ignoreChildren) {
                  const result = NSP.mdcGET(neId, objects[objectName].config.target+"?content=config");
                  if (result.success) {
                    // Extract content from envelope
                    // example: {"nokia-conf:port": [{"port-id": "1/1/1", ...}]} becomes [{"port-id": "1/1/1", ...}]
                    let aCfg = Object.values(result.response)[0]; // actual config
                    let iCfg = Object.values(desiredConfig)[0]; // intended config
        
                    // YANG list-entries are encoded as single-entry array (rfc8040, rfc8072)
                    // Extract this single entry from the list
                    // example: [{"port-id": "1/1/1", ...}] becomes {"port-id": "1/1/1", ...}
        
                    if (Array.isArray(aCfg)) {
                      if (aCfg.length > 0) aCfg = aCfg[0]; else aCfg = {};
                    }
        
                    if (Array.isArray(iCfg)) {
                      if (iCfg.length > 0) iCfg = iCfg[0]; else iCfg = {};
                    }
        
                    objects[objectName].config.ignoreChildren.forEach(path => {
                      const keys = path.split('/');
                      let source = aCfg;
                      let target = iCfg;
                  
                      for (let i = 0; i < keys.length; i++) {
                        const key = keys[i];
                  
                        if (key in source)
                          if (i < keys.length - 1) {
                            if (!(key in target))
                              target[key] = {};
                            source = source[key];
                            target = target[key];
                          } else {
                            target[key] = source[key];
                          }
                        else break; // Stop processing this path
                      }
                    });
                  }
                  else if (result.errmsg === "Not Found") {
                    logger.info("Merge pre-approved misalignments skipped. Object not configured on device.");
                  } else {
                    throw new Error(`RESTCONF GET ERROR ${result.errmsg}; Cannot merge pre-approved misalignments!`);
                  }
                }

                this.loadMetainfo(intentType, intentTypeVersion);        
                if (this.enableApprovedMisalignments)
                  desiredConfig = NSP.resolveSynchronize(intentType, target, neId, "/"+objects[objectName].config.target, desiredConfig);

              // Convert desiredConfig object to JSON string as required as input for PATCH.ftl
              sitesConfigs[neId][objectName].value = JSON.stringify(desiredConfig);
              }
            }
          }
        });
      }

      // Deploy changes to target devices and update topology objects and xtra-data
      if (state === "active" || state === "suspend" || state === "delete") {
        let topologyObjects = [];
        for (const neId in sitesConfigs) {
          const body = utilityService.processTemplate(yangPatchTemplate, {"patchId": target, "patchItems": sitesConfigs[neId]});

          let result = NSP.mdcPATCH(neId, body);

          if (result.success) {
            // RESTCONF YANG PATCH was successful
            //  - objects that have been added/updated are added to the new topology
            //  - objects that have been added/updated are added to siteCleanups (extraData) to enable housekeeping

            sitesCleanups[neId] = {};
            for (const objectName in sitesConfigs[neId]) {
              if (sitesConfigs[neId][objectName].operation === "replace") {
                // For operation "replace" remember how to clean-up the object created (house-keeping).
                // For cleanup we are using operation "remove", to avoid the operation from failing,
                // if the corresponding device configuration was deleted from the network already.

                sitesCleanups[neId][objectName] = {"target": sitesConfigs[neId][objectName].target, "operation": "remove"};
                topologyObjects.push(topologyFactory.createTopologyObjectFrom(objectName, sitesConfigs[neId][objectName].target, "INFRASTRUCTURE", neId));
              }

              // Site cleanup is only generated for operation "replace". If the mapper FTL is
              // using operation "merge" or "remove", no cleanup object is produced - which implies,
              // if the site or site-level object is removed, the original site-level configuration
              // is not reverted back. Please note, that operation "create" and "delete" must not
              // be used (and are not reverted back either)!!!
            }

            if (Object.keys(sitesCleanups[neId]).length === 0)
              delete sitesCleanups[neId];

          } else {
            if (neId in this.deviceCache) {
              logger.error("Deployment on {} (ne-id: {}) failed with {}", this.deviceCache[neId], neId, result.errmsg);
              syncErrors.push("[site: "+this.deviceCache[neId]+", "+neId+"] "+result.errmsg);
            } else {
              logger.error("Deployment on {} failed with {}", neId, result.errmsg);
              syncErrors.push("[site: "+neId+"] "+result.errmsg);
            }

            // RESTCONF YANG PATCH failed
            //  - Keep siteCleanups (extraData) for this site to enable housekeeping
            //  - Generate topology from siteCleanup (same content as it was before)

            if (neId in sitesCleanups) {
              for (const objectName in sitesCleanups[neId]) {
                topologyObjects.push(topologyFactory.createTopologyObjectFrom(objectName, sitesCleanups[neId][objectName].target, "INFRASTRUCTURE", neId));
              }
            }
          }

          if (topology === null)
            topology = topologyFactory.createServiceTopology();

          let xtrainfo = topologyFactory.createTopologyXtraInfoFrom("sitesCleanups", JSON.stringify(sitesCleanups));

          topology.setXtraInfo([xtrainfo]);
          topology.setTopologyObjects(topologyObjects);
        }
      }

      syncResult.setTopology(topology);
    } catch (err) {
      syncErrors.push(err.message);
    }

    if (syncErrors.length > 0) {
      syncResult.setSuccess(false);
      syncResult.setErrorCode("500");
      syncResult.setErrorDetail(syncErrors.join("; "));
    } else {
      // Remove approved misalignments (if any)
      if (this.enableApprovedMisalignments && state === "delete")
        NSP.restconfRemove(`nsp-intent-approved-changes:approved-change/approved-changes=${encodeURIComponent(intentType)},${encodeURIComponent(target)}`);

      // Execute custom logic after successful deployment to the network
      this.postSyncHook(intentType, intentTypeVersion, target, config, state);
      syncResult.setSuccess(true);
    }

    const duration = Date.now()-startTS;
    logger.info("IntentHandler::synchronize() finished within {} ms", duration|0);

    return syncResult;
  }

  /**
   * Method to audit intents. Renders the desired configuration (same
   * as synchronize) and retrieves the actual configuration from MDC.
   * Compares actual against desired configuration to produce the AuditReport.
   *
   * @param {AuditInput} input input provided by intent-engine
   * @returns {AuditReport} audit report
   */

  async onAudit(input) {
    const startTS = Date.now();

    const state = input.getNetworkState().name();
    const target = input.getTarget();
    const intentType = input.getIntentType();
    const intentTypeVersion = input.getIntentTypeVersion();

    logger.info("IntentHandler::onAudit() in state {} ", state);

    const config = JSON.parse(input.getJsonIntentConfiguration())[0];

    const topology = input.getCurrentTopology();
    let auditReport = new AuditReport();
    auditReport.setIntentType(intentType);
    auditReport.setTarget(target);

    try {
      // Update device-cache (as needed)
      this.updateDeviceCache();
      this.loadMetainfo(intentType, intentTypeVersion);

      // Recall nodal configuration elements from previous synchronize
      let obsoleted = {};
      if (topology && topology.getXtraInfo()!==null && !topology.getXtraInfo().isEmpty()) {
        topology.getXtraInfo().forEach(item => {
          if (item.getKey() === "sitesCleanups") {
            obsoleted = JSON.parse(item.getValue());
          }
        });
      }

      if (state === "active") {
        // Obtain resources from Resource Admin
        // Remind, this is done even if the intent was not synchronized before!
        // Required for getSiteParameters() and getGlobalParameters()
        this.obtainResources(intentType, intentTypeVersion, target, config);
        const global = this.getGlobalParameters(intentType, intentTypeVersion, target, config);

        // Iterate sites to populate/update sitesConfigs per target device
        this.getSiteParameters(intentType, intentTypeVersion, target, config, this.deviceCache).forEach(site => {
          const neId = site["ne-id"];
          site["ne-name"] = this.deviceCache[neId];
          const objects = this.getSiteObjects(intentType, intentTypeVersion, target, global, site, "audit");

          // Audit device configuration
          for (const objectName in objects) {
            if ("config" in objects[objectName]) {
              const result = NSP.mdcGET(neId, objects[objectName].config.target+"?content=config");
              if (result.success) {
                const desiredConfig = objects[objectName].config.value;
                const deviceModelPath = objects[objectName].config.target;

                // Extract content from envelope
                // example: {"nokia-conf:port": [{"port-id": "1/1/1", ...}]} becomes [{"port-id": "1/1/1", ...}]
                let aCfg = Object.values(result.response)[0]; // actual config
                let iCfg = Object.values(desiredConfig)[0]; // intended config

                // YANG list-entries are encoded as single-entry array (rfc8040, rfc8072)
                // Extract this single entry from the list
                // example: [{"port-id": "1/1/1", ...}] becomes {"port-id": "1/1/1", ...}

                if (Array.isArray(aCfg)) {
                  if (aCfg.length > 0) aCfg = aCfg[0]; else aCfg = {};
                }

                if (Array.isArray(iCfg)) {
                  if (iCfg.length > 0) iCfg = iCfg[0]; else iCfg = {};
                }                

                this.preAuditHook(neId, deviceModelPath, aCfg, iCfg);
                this.compareConfig(neId, deviceModelPath, aCfg, iCfg, objects[objectName].config.operation, objects[objectName].config.ignoreChildren, auditReport, neId, '');
              }
              else if (result.errmsg === "Not Found") {
                // get failed, because path is not configured
                // missing object: is-configured=true, is-undesired=default(false)
                auditReport.addMisAlignedObject(new MisAlignedObject("/"+objects[objectName].config.target, true, neId));
              } else {
                logger.error("RESTCONF GET failed with {}", result.errmsg);
                throw new Error("RESTCONF GET failed with " + result.errmsg);
              }

              // Configuration object is still present, remove from obsoleted
              if (neId in obsoleted)
                if (objectName in obsoleted[neId])
                  delete obsoleted[neId][objectName];
            }
          }

          for (const objectName in objects) {
            if ("health" in objects[objectName]) {
              for (const path in objects[objectName].health) {
                const iState = objects[objectName].health[path];
                const result = NSP.mdcGET(neId, path);
                if (result.success) {
                  let aState = result.response;
                  for (const key in aState) {
                    aState = aState[key];
                    break;
                  }
                  if (Array.isArray(aState))
                    aState = aState[0];

                  this.compareState(neId, aState, iState, auditReport, path);
                }
                else if (result.errmsg === "Not Found") {
                  // get failed, because path is not available
                  // missing state object: is-configured=false, is-undesired=default(false)
                  auditReport.addMisAlignedObject(new MisAlignedObject("/"+path, false, neId));
                } else {
                  logger.error("RESTCONF GET failed with {}", result.errmsg);
                  throw new Error("RESTCONF GET failed with " + result.errmsg);
                }
              }
            }
          }
        });
      }

      // Report undesired objects: is-configured=true, is-undesired=true
      for (const neId in obsoleted)
        for (const objectName in obsoleted[neId])
          auditReport.addMisAlignedObject(new MisAlignedObject("/"+obsoleted[neId][objectName].target, true, neId, true));

      if (this.enableApprovedMisalignments)
        auditReport = NSP.resolveAudit(auditReport);
    } catch (err) {
      auditReport.setErrorCode("500");
      auditReport.setErrorDetail(err.message);

      // under review with altiplano-team:
      // auditReport.setSuccess(false);
      throw err;
    }

    const duration = Date.now()-startTS;
    logger.info("IntentHandler::onAudit() finished within {} ms", duration|0);

    return auditReport;
  }

  /**
   * Method to compute/retrieve read-only state-attributes.
   *
   * @param {StateRetrievalInput} input input provided by intent-engine
   * @return {string} State attributes report (XML format)
   */

  getStateAttributes(input) {
    const startTS = Date.now();

    const state = input.getNetworkState().name();
    const target = input.getTarget();
    const intentType = input.getIntentType();
    const intentTypeVersion = input.getIntentTypeVersion();

    if (state === "delete") return null;
    logger.info("IntentHandler::getStateAttributes() in state {}", state);

    const config = JSON.parse(input.getJsonIntentConfiguration())[0];
    const global = this.getGlobalParameters(intentType, intentTypeVersion, target, config);

    // Iterate sites to get indiciators
    let indicators = {};
    this.getSiteParameters(intentType, intentTypeVersion, target, config, this.deviceCache).forEach(site => {
      const neId = site["ne-id"];
      site["ne-name"] = this.deviceCache[neId];
      const objects = this.getSiteObjects(intentType, intentTypeVersion, target, global, site, "state");

      for (const objectName in objects) {
        if ("indicators" in objects[objectName]) {
          for (const uri in objects[objectName].indicators) {
            const result = NSP.mdcGET(neId, uri);

            if (result.success) {
              let response = result.response;
              for (const key in response) {
                response = response[key];
                break;
              }
              if (Array.isArray(response))
                response = response[0];

              for (const indicator in objects[objectName].indicators[uri]) {
                const value = this.jsonPath(response, objects[objectName].indicators[uri][indicator].path);
                if (value && (value.length > 0)) {
                  if (!(indicator in indicators))
                    indicators[indicator] = {};
                  indicators[indicator][neId] = value[0];
                }
              }
            }
          }
        }
      }
    });
    const stateinfo = this.getState(intentType, intentTypeVersion, target, config, input.getCurrentTopology());

    if (!indicators && !stateinfo) {
      logger.info("Neither indicators nor state info collected.");

      const duration = Date.now()-startTS;
      logger.info("IntentHandler::getStateAttributes() finished within {} ms", duration|0);
      return null;
    }

    if (indicators)
      logger.info("collected indicators: {}", JSON.stringify(indicators, null, "  "));
    if (stateinfo)
      logger.info("collected state-info: {}", JSON.stringify(stateinfo, null, "  "));

    const stateFTL = resourceProvider.getResource("mappers/state.ftl");
    const stateXML = utilityService.processTemplate(stateFTL, {"state": stateinfo, "indicators": indicators});

    logger.info("state report: {}", stateXML);

    const duration = Date.now()-startTS;
    logger.info("IntentHandler::getStateAttributes() finished within {} ms", duration|0);

    return stateXML;
  }

  /**
   * Returns list of target devices
   * Method is referenced in meta-info.json
   * 
   * @param {*} input
   * @returns {ArrayList}
   */

  getTargettedDevices(input) {
    const startTS = Date.now();

    logger.info("IntentHandler::getTargettedDevices()");

    const target = input.getTarget();
    const config = JSON.parse(input.getJsonIntentConfiguration())[0];

    const deviceList = new ArrayList();
    this.getSites(target, config).forEach(neId => deviceList.add(neId));

    const duration = Date.now()-startTS;
    logger.info("IntentHandler::getTargettedDevices() finished within {} ms", duration|0);

    return deviceList;
  }
}