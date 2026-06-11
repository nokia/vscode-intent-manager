/******************************************************************************
 * DEVICE-SPECIFIC INTENT-HANDLER-BASE IMPLEMENTATION
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
 * Implementation is common for device-specific intent-types and must not be changed!
 * 
 * Be aware, that the IntentHandlerBase is an abstract base class. To use it, it must be
 * extended/adjusted to the intent-type specific needs. Hooks are provided to enable
 * flexibility. Designers may choose to overwrite members/methods to customize the
 * behavior as needed.
 */

export class IntentHandlerBase extends WebUI
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
    this.ignoreChildren = [];
    this.deviceModelType = "";
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
   * Construct the device-model path for the configuration owned by the intent.
   * 
   * @param {string} target Intent target
   * @returns {string} path of the subtree owned by the intent
   */

  getDeviceModelPath(target) {
    throw new Error("getDeviceModelPath() must be implemented by IntentHandler");
  }

  getModuleRefs() {
    return {};
  }

  /**
   * YANG module name prefixes used to strip {@code prefix:value} from device (actual) leaf
   * values when comparing to intent during audit. Filled by the ICM generator from identityref
   * QName keys (same keys used to emit typedef enumerations), not from {@link getModuleRefs}.
   * @returns {string[]}
   */
  getAuditModulePrefixes() {
    return [];
  }

  /**
   * Strip the first matching MDC module prefix from a leaf string (longest prefix wins).
   * @param {string} value
   * @returns {string}
   */
  stripMdcModulePrefixFromLeafString(value) {
    if (typeof value !== "string" || !value.includes(":"))
      return value;
    if (this.isIPv6(value))
      return value;
    let prefixes;
    try {
      prefixes = this.getAuditModulePrefixes();
    } catch (e) {
      return value;
    }
    if (!Array.isArray(prefixes) || prefixes.length === 0)
      return value;
    for (const prefix of prefixes) {
      if (typeof prefix !== "string" || prefix.length === 0)
        continue;
      const head = prefix + ":";
      if (value.startsWith(head))
        return value.slice(head.length);
    }
    return value;
  }

  getActionKeys() {
    return [];
  }
  /**
   * Construct the RESTCONF complient body for the desired configuration
   * to be pushed by the intent using MDC RESTCONF.
   * 
   * @param {string} target Intent target
   * @param {string} intentConfigJSON Intent configuration (JSON string)
   * @returns {object} desired configuration
   */

  getDesiredConfig(target, intentConfigJSON) {
    throw new Error("getDesiredConfig() must be implemented by IntentHandler");
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

  /**************************************************************************
   * Intent config deviation stripping (resource: custom/intent-deviations.json)
   **************************************************************************/

  /**
   * Remove attributes from intent config that are not supported for this NE
   * family/type/version per deviation rules.
   *
   * @param {object} intentConfig
   * @param {string} neId
   * @returns {object}
   */
  removeIntentConfig(intentConfig, neId) {
    var deviationData = undefined;
    try {
      deviationData = this.deviationData();
    } catch (err) {
      return intentConfig;
    }
    logger.info("Removing deviations from config: " + intentConfig);
    var neFamily = this.getNeFamilyRelease(neId);
    logger.info("NE family : " + neFamily);
    var neType = this.getNeType(neFamily);
    var chassisType = this.getChassisType(neFamily);
    var neVersion = this.getNeVersion(neFamily);
    logger.info("Intent dev JS: neType: " + neType + ", chassisType: " + chassisType + ", neVersion: " + neVersion);
    var deviationInfoArr = deviationData["deviationInfo"];
    for (var i = 0; i < deviationInfoArr.length; i++) {
      var deviationObj = deviationInfoArr[i];
      var deviationNetype = deviationObj["neType"];
      var deviationNeVersion = deviationObj["neVersion"];
      var deviationChassisTypes = deviationObj["chassisTypes"];
      var chassisFlag = deviationChassisTypes.length == 0;
      if (!chassisFlag) {
        chassisFlag = deviationChassisTypes.indexOf(chassisType) != -1;
      }
      var result = neType.localeCompare(deviationNetype) == 0 && chassisFlag;
      var neversionResult = deviationNeVersion.length == 0;
      if (!neversionResult) {
        neversionResult = deviationNeVersion.indexOf(neVersion) != -1;
      }
      logger.info("neType : " + neType + ", chassisType : " + chassisType + ",result : " + result + ", neVersionResult : " + neversionResult);
      if (result && neversionResult) {
        var notSupportedAttributes = deviationObj["NotSupportedAttributes"];
        for (var j = 0; j < notSupportedAttributes.length; j++) {
          var segments = notSupportedAttributes[j].split(".");
          var attributeToDelete = segments.pop();
          var dataPath = segments.join(".");
          logger.info("Deleting attribute : " + attributeToDelete + ", from Data Path : " + dataPath);
          this.deleteAttribute(intentConfig, dataPath, attributeToDelete);
        }
      }
    }
    logger.info("intent deviation post process config" + JSON.stringify(intentConfig));
    return intentConfig;
  }

  /**
   * @param {object} intentConfig
   * @param {string} path
   * @param {string} attribute
   */
  deleteAttribute(intentConfig, path, attribute) {
    if (path !== "") {
      var segments = path.split(".");
      for (var segment of segments) {
        if (!intentConfig.hasOwnProperty(segment)) {
          return;
        }
        intentConfig = intentConfig[segment];
        //check for Array or Object
        if (Array.isArray(intentConfig)) {
          for (var i = 0; i < intentConfig.length; i++) {
            if (intentConfig[i].hasOwnProperty(attribute)) {
              delete intentConfig[i][attribute];
            } else {
              segments.splice(0, segments.indexOf(segment) + 1);
              var remSegments = segments.join(".");
              this.deleteAttribute(intentConfig[i], remSegments, attribute);
            }
          }
        } else if (intentConfig.hasOwnProperty(attribute)) {
          delete intentConfig[attribute];
        }
      }
    } else {
      if (intentConfig.hasOwnProperty(attribute)) {
        delete intentConfig[attribute];
      }
    }
  }

  getNeFamilyRelease(target) {
    try {
      const neInfo = mds.getAllInfoFromDevices(target);
      if (neInfo === null || neInfo.size() === 0) {
        logger.warn("getNeFamilyRelease: no device info for target={}", target);
        return "";
      }
      const familyRelease = neInfo.get(0).getFamilyTypeRelease();
      if (familyRelease === null) {
        logger.warn("getNeFamilyRelease: family/type/release null for target={}", target);
        return "";
      }
      logger.info("getNeFamilyRelease: target={}, familyTypeRelease={}", target, familyRelease);
      return familyRelease;
    } catch (e) {
      logger.error("getNeFamilyRelease: exception for target={}: {}", target, e);
      return {
        "Device Not Found": "Device Not Found",
      };
    }
  }

  getNeType(neFamily) {
    var neFamilyArr = neFamily.split(":");
    return neFamilyArr[0];
  }

  getChassisType(neFamily) {
    var neFamilyArr = neFamily.split(":");
    return neFamilyArr[2];
  }

  getNeVersion(neFamily) {
    var neFamilyArr = neFamily.split(":");
    return neFamilyArr[1];
  }

  deviationData() {
    var deviationObj = resourceProvider.getResource("custom/intent-deviations.json");
    logger.info("Deviation Info Data : " + deviationObj);
    return JSON.parse(deviationObj);
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
    logger.info("Before Deviation ******************" + JSON.stringify(iConfig));

    this.removeIntentConfig(iConfig, neId);

    logger.info("After Deviation ******************" + JSON.stringify(iConfig));
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

  preSyncHook(intentType, intentTypeVersion, neId, config, state) {
    
    this.removeIntentConfig(
      Array.isArray(config[Object.keys(config)[0]]) 
          ? config[Object.keys(config)[0]][0] 
          : config[Object.keys(config)[0]],
      neId
    );

    logger.info("After Deviation apply ******************" + JSON.stringify(config));
    const moduleRef = this.getModuleRefs();
    logger.info("Before moduleRef apply ******************" + JSON.stringify(config));
    const result = {};
    for (const topKey in config) {
        if (!Object.prototype.hasOwnProperty.call(config, topKey)) continue;
        config[topKey] = this.transformKeysWithModulePrefixes(config[topKey], moduleRef, []);
    }
    logger.info("After moduleRef apply ******************" + JSON.stringify(config));

    
  }

  transformKeysWithModulePrefixes(obj, moduleRef, path) {
    if (Array.isArray(obj)) {
      return obj.map(item => this.transformKeysWithModulePrefixes(item, moduleRef, path));
    }
  
    if (obj !== null && typeof obj === 'object') {
      const newObj = {};
      for (const key in obj) {
        if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
  
        const currentPath = path.concat([key]);
        const keyPath = currentPath.join("/");
  
        const prefix = moduleRef[keyPath] || moduleRef[key] || null;
        const newKey = prefix ? prefix + ":" + key : key;
  
        let value = obj[key];
        // If value is a string and prefix exists, add the prefix
        if (typeof value === 'string' && prefix && !value.startsWith(prefix + ':')) {
          value = `${prefix}:${value}`;
        } else {
          value = this.transformKeysWithModulePrefixes(value, moduleRef, currentPath);
        }
  
        newObj[newKey] = value;
      }
      return newObj;
    }
  
    return obj;
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

  /**
   * Hook to add custom intent-type specific logic to be executed as
   * part of brownfield discovery to modify the discovered data.
   * 
   * @param {string} target Intent target
   * @param {object} config Brownfield configuration
   * 
   * @returns updated brownfield configuration
   */

  getTargetDataHook(target, config) {
    return config;
  }

  /**************************************************************************
   * Internal helper methods of IntentHandler
   **************************************************************************/

  /**
   * Extracts the neId from target (ICM-style intents)
   * 
   * @param {*} target Target Parameters as passed by IBN 
   */

  getNeIdFromTarget(target) {
    const match = target.match(/ne-id='([^']+)'/);
    return match ? match[1] : target.split('#')[1];
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

    if (addr.split(":").length > 8)
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
        throw new Error(`? Unit Testing Failed: ${message} | Expected: '${expected}', Got: '${actual}'`);
    } else {
        logger.info(`? Passed: ${message}`);
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

    logger.info(`? All tests passed!`);
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
   * Unwrap a RESTCONF JSON resource body to the inner config object (module key + list unroll).
   *
   * @param {object} body Single RESTCONF resource object (one module-qualified root key).
   * @returns {*} Unwrapped root value (typically an object; containers skip list unroll when not array).
   */
  unwrapRestconfBody(body) {
    const config = Object.values(body)[0];
    if (Array.isArray(config)) {
      if (config.length > 0)
        return config[0];
      else
        return {};
    }
    return config;
  }

  /**
   * Returns true when `relativePath` is under an ignored subtree (pre-approved misalignments).
   *
   * @param {string} neId              (reserved for future use)
   * @param {string} basePath          (reserved for future use)
   * @param {string} relativePath
   * @returns {boolean}
   */
  isPreApproved(neId, basePath, relativePath) {
    return this.ignoreChildren.some(path => relativePath.startsWith(path));
  }

  /**
   * Audit helper to compare intented vs actual config
   *
   * @param {string} neId required for fetching model info
   * @param {string} basePath target root path of the object under audit
   * @param {Object} aCfg actual config (observed from device)
   * @param {Object} iCfg intended config (desired)
   * @param {AuditReport} auditReport used to report differences
   * @param {string} obj object reference used for report
   * @param {string} path used to build up relative path (recursive)
   */

  compareConfig(neId, basePath, aCfg, iCfg, auditReport, obj, path) {
    const startTS = Date.now();
    logger.debug("IntentHandler::compareConfig(neId={}, basePath={}, path={})", neId, basePath, path);

    for (const key in iCfg) {
      if (key in aCfg) {
        // handle differences in encoding numeric values between MDC and IM (especially union type) 
        if (typeof iCfg[key] === "string" && typeof aCfg[key] === "number") aCfg[key] = String(aCfg[key]);
        if (typeof iCfg[key] === "number" && typeof aCfg[key] === "string") iCfg[key] = String(iCfg[key]);

        if (typeof iCfg[key] !== typeof aCfg[key]) {
          // mismatch: type is different
          auditReport.addMisAlignedAttribute(new MisAlignedAttribute("/"+decodeURIComponent(basePath)+"/"+path+key, "type "+typeof iCfg[key], "type "+typeof aCfg[key], obj));
        } else if (!(iCfg[key] instanceof Object)) {
          let aComp = aCfg[key];
          if (typeof aComp === "string")
            aComp = this.stripMdcModulePrefixFromLeafString(aComp);
          if (iCfg[key] !== aComp) {
            if (this.isIPv6(iCfg[key]) && this.normalizeIPv6(iCfg[key]) === aComp)
              // aligned IPv6 addresses (after normalization)
              logger.debug(`Matching IPv6 addresses: ${iCfg[key]} === ${aComp}`);
            else
              // mismatch: value is different
              auditReport.addMisAlignedAttribute(new MisAlignedAttribute("/"+decodeURIComponent(basePath)+"/"+path+key, iCfg[key].toString(), aComp.toString(), obj));
          } else {
            // aligned: type/value are same
          }
        } else if (Array.isArray(iCfg[key])) {
          if ((iCfg[key].length > 0) && (iCfg[key][0] instanceof Object) || (aCfg[key].length > 0) && (aCfg[key][0] instanceof Object)) {
            // children is a yang list
            // group by list-key and look one level deeper
            const keys = this.getListKeys(neId, basePath+"/"+path+key);

            const iCfgConverted = iCfg[key].reduce((rdict, entry) => {
              const value = keys.map((listKey) => {
                const v = entry[listKey];
                const normalized = typeof v === "string" && this.isIPv6(v) ? this.normalizeIPv6(v) : v;
                return encodeURIComponent(normalized);
              }).join(",");
              rdict[value] = entry;
              return rdict;
            }, {});

            const aCfgConverted = aCfg[key].reduce((rdict, entry) => {
              const value = keys.map( key => encodeURIComponent(entry[key]) ).join(",");
              rdict[value] = entry;
              return rdict;
            }, {});

            this.compareConfig(neId, basePath, aCfgConverted, iCfgConverted, auditReport, obj, path+key+"=");
          } else {
            const iVal = JSON.stringify(iCfg[key]);
            const aVal = JSON.stringify(aCfg[key]);
            if (iVal !== aVal) {
              let aValRaw = aCfg[key];
              if (typeof aValRaw === "string") {
                aValRaw = this.stripMdcModulePrefixFromLeafString(aValRaw);
              } else if (Array.isArray(aValRaw)) {
                aValRaw = aValRaw.map(v =>
                  typeof v === "string" ? this.stripMdcModulePrefixFromLeafString(v) : v
                );
              }
              const aVal = JSON.stringify(aValRaw);
              if(iVal !== aVal)
              {
                auditReport.addMisAlignedAttribute(new MisAlignedAttribute("/"+decodeURIComponent(basePath)+"/"+path+key, iVal, aVal, obj));
              }
              
            }
          }
        } else {
          // children is a yang container
          // look one level deeper
          this.compareConfig(neId, basePath, aCfg[key], iCfg[key], auditReport, obj, path+key+"/");
        }
      } else {
        if (iCfg[key] instanceof Object) {
          // mismatch: list/container is unconfigured

          const iVal = JSON.stringify(iCfg[key]);
          if ((iVal === "{}") || (iVal === "[]") || (iVal === "[null]"))
            auditReport.addMisAlignedAttribute(new MisAlignedAttribute("/"+decodeURIComponent(basePath)+"/"+path+key, iVal, null, obj));
          else
            // missing object: is-configured=true, is-undesired=default(false)
            auditReport.addMisAlignedObject(new MisAlignedObject("/"+decodeURIComponent(basePath)+"/"+path+key, false, neId));
        } else {
          // mismatch: leaf is unconfigured
          auditReport.addMisAlignedAttribute(new MisAlignedAttribute("/"+decodeURIComponent(basePath)+"/"+path+key, iCfg[key].toString(), null, obj));
        }
      }
    }

    for (const key in aCfg) {
      if (!(key in iCfg)) {
        const relativePath = path + key;
        if (!this.isPreApproved(neId, basePath, relativePath)) {

          if (aCfg[key] instanceof Object) {
            // mismatch: undesired list/container

            const aVal = JSON.stringify(aCfg[key]);
            if ((aVal === "{}") || (aVal === "[]") || (aVal === "[null]"))
              auditReport.addMisAlignedAttribute(new MisAlignedAttribute("/"+decodeURIComponent(basePath)+"/"+relativePath, null, aVal, obj));
            else
              // undesired object: is-configured=true, is-undesired=default(true)
              auditReport.addMisAlignedObject(new MisAlignedObject("/"+decodeURIComponent(basePath)+"/"+relativePath, true, neId));
          } else {
            // mismatch: additional leaf
            auditReport.addMisAlignedAttribute(new MisAlignedAttribute("/"+decodeURIComponent(basePath)+"/"+relativePath, null, aCfg[key].toString(), obj));
          }
        }
      }
    }

    const duration = Date.now()-startTS;
    logger.debug("IntentHandler::compareConfig(neId={}, basePath={}, path={}) finished within {} ms", neId, basePath, path,  duration|0);
  }

  /**
   * If value is an object that has any of the subclass's getActionKeys() (e.g. from script-content),
   * return cleaned object with those keys preserved; otherwise return null (caller should use normal cleanup).
   */
  cleanupActionIfPreserved(actionValue) {
    const actionKeys = this.getActionKeys();
    if (!actionKeys.length || !actionValue || typeof actionValue !== 'object' ||
        !actionKeys.some(k => Object.prototype.hasOwnProperty.call(actionValue, k)))
      return null;
    const preserved = {};
    const actionKeySet = new Set(actionKeys);
    for (const [k, v] of Object.entries(actionValue)) {
      if (actionKeySet.has(k)) {
        const cleaned = this.cleanupConfig(v);
        if (v !== null && typeof v === 'object') {
          preserved[k] = (cleaned !== undefined && cleaned !== null && typeof cleaned === 'object') ? cleaned : {};
        } else {
          preserved[k] = cleaned;
        }
      } else {
        if (v === null || typeof v !== 'object') {
          preserved[k] = v;
        } else {
          const cleaned = this.cleanupConfig(v);
          if (cleaned !== undefined && (typeof cleaned !== 'object' || cleaned === null || Object.keys(cleaned).length > 0))
            preserved[k] = cleaned;
        }
      }
    }
    return preserved;
  }

  /**
   * Recursive cleanup of provided configuration:
   * Removes empty lists and containers.
   * 
   * Method will be called with an object (container), but due to
   * its recursive nature it accepts arrays and primitive data types
   * Applies to the entire tree. Any object value that has keys from the getActionKeys() will be ignored.
   *
   * @param {*} cfg configuration to cleanup
   * @returns cleaned up configuration
   */
  cleanupConfig(cfg) {
    // handle YANG lists, leaf-lists (all lists in the tree are processed)
    if (Array.isArray(cfg)) {
      const cleanedArray = cfg.map(v => this.cleanupConfig(v));
      return cleanedArray.every(v => v === null) ? cleanedArray : cleanedArray.filter(v => typeof v !== 'object' || Object.entries(v).length > 0);
    }

    // handle YANG containers: run through entire cfg; preserve any value that has subclass getActionKeys()
    if (cfg && typeof cfg === 'object') {
      return Object.fromEntries(
        Object.entries(cfg)
          .map(([k, v]) => {
            const preserved = this.cleanupActionIfPreserved(v);
            if (preserved !== null)
              return [k, preserved];
            return [k, this.cleanupConfig(v)];
          })
          .filter(([_, v]) => typeof v !== 'object' || Object.entries(v).length > 0)
      );
    }

    // handle YANG leafs (primitive types)
    return cfg;
  }

  /**
   * Delete the corresponding path from configuration data (JSON).
   * 
   * @param {object} data configuration to cleanup
   * @param {string} path subtree/leaf to be deleted
   * @param {string} separator
   */

  deletePath(data, path, separator = '.') {
    const [key, ...remains] = path.split(separator);
    if (data !== null && key in data) {
      if (remains.length > 0) {
        if (Array.isArray(data[key]))
          // list hit => iterate entries
          data[key].forEach(listEntry => this.deletePath(listEntry, remains.join(separator), separator));
        else if (typeof data[key] === 'object')
          // dict hit => follow the path
          this.deletePath(data[key], remains.join(separator), separator);
      } else 
        delete data[key]; // delete property
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

    const neId = this.getNeIdFromTarget(target);
    const neInfo = mds.getAllInfoFromDevices(neId);

    if (neInfo === null || neInfo.size() === 0) {
      contextualErrorJsonObj["Node not found"] = neId;
    } else {
      const neFamilyTypeRelease = neInfo.get(0).getFamilyTypeRelease();
      if (neFamilyTypeRelease === null) {
        contextualErrorJsonObj["Family/Type/Release unkown"] = neId;
      }
    }

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

    const neId = this.getNeIdFromTarget(target);
    const deviceModelPath = this.getDeviceModelPath(target);

    let desiredConfig = this.getDesiredConfig(target, input.getJsonIntentConfiguration());

    const syncResult = new SynchronizeResult();

    try {
      // hook to be executed before syncing to the network
      this.preSyncHook(intentType, intentTypeVersion, neId, desiredConfig, state);

      const body = {
        "ietf-yang-patch:yang-patch": {
          "patch-id": `patch-${JSON.stringify(startTS)}`,
          "edit": []
        }
      };

      if (state === "active") {
        if (this.ignoreChildren.length > 0) {
          const result = NSP.mdcGET(neId, deviceModelPath+"?content=config");
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

            this.ignoreChildren.forEach(path => {
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
          desiredConfig = NSP.resolveSynchronize(intentType, target, neId, "/"+deviceModelPath, desiredConfig);

        body["ietf-yang-patch:yang-patch"]["edit"].push({
          "edit-id": `edit-${JSON.stringify(startTS)}`,
          "target":  deviceModelPath,
          "value":   desiredConfig,
          "operation": "replace"
        });
      } else {
        body["ietf-yang-patch:yang-patch"]["edit"].push({
          "edit-id": `edit-${JSON.stringify(startTS)}`,
          "target":  deviceModelPath,
          "operation": "remove"
        });
      }

      const result = NSP.mdcPATCH(neId, JSON.stringify(body));

      if (result.success) {
        let topology = input.getCurrentTopology();

        if (topology === null)
          topology = topologyFactory.createServiceTopology();
    
        topology.setTopologyObjects([topologyFactory.createTopologyObjectFrom(deviceModelPath, deviceModelPath, "INFRASTRUCTURE", neId)]);
        syncResult.setTopology(topology);
        syncResult.setSuccess(true);

        // hook to be executed after successfully syncing to the network
        this.postSyncHook(intentType, intentTypeVersion, target, desiredConfig, state);

        // Remove approved misalignments (if any)
        if (this.approvedMisalignments && state === "delete")
          NSP.restconfRemove(`nsp-intent-approved-changes:approved-change/approved-changes=${encodeURIComponent(intentType)},${encodeURIComponent(target)}`);

      } else {
        logger.error("Deployment on {} failed with {}", neId, result.errmsg);

        syncResult.setSuccess(false);
        syncResult.setErrorCode("500");
        syncResult.setErrorDetail(result.errmsg);
      }
    } catch (err) {
      logger.error("Deployment on {} failed with {}", neId, err.message);

      syncResult.setSuccess(false);
      syncResult.setErrorCode("500");
      syncResult.setErrorDetail(err.message);
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

    const neId = this.getNeIdFromTarget(target);
    const deviceModelPath = this.getDeviceModelPath(target);
    const desiredConfig = this.getDesiredConfig(target, input.getJsonIntentConfiguration());

    let auditReport = new AuditReport();
    auditReport.setIntentType(intentType);
    auditReport.setTarget(target);

    const result = NSP.mdcGET(neId, deviceModelPath+"?content=config");
    if (result.success) {
      if (state === "active") {
        let aCfg = this.unwrapRestconfBody(result.response);
        let iCfg = this.unwrapRestconfBody(desiredConfig);

        const moduleRef = this.getModuleRefs();

        this.preAuditHook(neId, deviceModelPath, aCfg, iCfg);
        iCfg = this.transformKeysWithModulePrefixes(iCfg, moduleRef, []);

        this.compareConfig(neId, deviceModelPath, aCfg, iCfg, auditReport, neId, "");
      } else {
        // undesired objects: is-configured=true, is-undesired=true
        auditReport.addMisAlignedObject(new MisAlignedObject("/"+deviceModelPath, true, neId, true));
      }
    }
    else if (result.errmsg === "Not Found") {
      // get failed, because path is not configured
      if (state === "active") {
        // missing object: is-configured=true, is-undesired=default(false)
        auditReport.addMisAlignedObject(new MisAlignedObject("/"+deviceModelPath, true, neId));
      }
    } else {
      logger.error("RESTCONF GET failed with {}", result.errmsg);
      throw new Error("RESTCONF GET failed with " + result.errmsg);
    }

    this.loadMetainfo(intentType, intentTypeVersion);
    if (this.enableApprovedMisalignments)
      auditReport = NSP.resolveAudit(auditReport);
 
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
    // const target = input.getTarget();
    // const intentType = input.getIntentType();
    // const intentTypeVersion = input.getIntentTypeVersion();

    logger.info("IntentHandler::getStateAttributes() in state {}", state);

    const stateXML = '<state-report xmlns="http://www.nokia.com/management-solutions/ibn" />';
    
    const duration = Date.now()-startTS;
    logger.info("IntentHandler::getStateAttributes() finished within {} ms", duration|0);

    return stateXML;
  }

  /**
   * Backend implementation for rpc get-target-data. Used to create/update ICM intent
   * configuration from existing network device configuration (brownfield discovery).
   * 
   * Implementation is for device-specific intent-types (100% attribute coverage/exposure).
   * To support future nodal releases, removing all "unknown" attributes (not captured as
   * part of the intent-model at auto-generation time) should be considered.
   *
   * @param {object} input Object including RPC input and intent information
   * @returns {string} RPC output as XML string
   */

  getTargetData(input) {
    const startTS = Date.now();

    const target = input.getTarget();
    const neId = this.getNeIdFromTarget(target);

    logger.info("IntentHandler::getTargetData()");

    let config = Object.values(JSON.parse(input.getJsonIntentConfiguration())[0])[0];

    const deviceModelPath = this.getDeviceModelPath(target);

    const result = NSP.mdcGET(neId, deviceModelPath+"?content=config");
    if (result.success) {
      config = Object.values(result.response)[0];

      if (Array.isArray(config)) {
        // if a list queried, a single-entry list is returned:
        config = config[0];
        // if target is a list, remove keys from config
        const keys = this.getListKeys(neId, deviceModelPath);
        keys.forEach(key => delete config[key]);
      }

      if (this.ignoreChildren.length > 0) {
        this.ignoreChildren.forEach(path => this.deletePath(config, path, '/'));
        config = this.cleanupConfig(config);
      }
      
      config = this.getTargetDataHook(target, config);
      config = this.stripPrefixes(config);
      logger.info("BrownField after the change "+ JSON.stringify(config))
    }
    else if (result.errmsg === "Not Found") {
      logger.warn("Brownfield discovery skipped. Object not configured on device.");
    } else {
      logger.error("Brownfield discovery failed. RESTCONF GET failed with {}", result.errmsg);
    }
    
    const rpcResponseXML = `<target-data xmlns="http://www.nokia.com/management-solutions/reference-action-intent">${JSON.stringify(config)}</target-data>`;

    const duration = Date.now()-startTS;
    logger.info("IntentHandler::getTargetData() finished within {} ms", duration|0);

    return rpcResponseXML;
  }

  stripPrefixes(obj) {
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.stripPrefixes(item));
    } else if (obj && typeof obj === 'object') {
      return Object.entries(obj).reduce((acc, [key, value]) => {
        const [prefix, actualKey] = key.includes(':') ? key.split(':') : [null, key];
        let newValue = this.stripPrefixes(value);
  
        // If value is string and has the same prefix, remove it
        if (prefix && typeof newValue === 'string' && newValue.startsWith(prefix + ':')) {
          newValue = newValue.slice(prefix.length + 1); // Remove prefix and colon
        }
  
        acc[actualKey] = newValue;
        return acc;
      }, {});
    } else {
      return typeof obj === "string" ? this.stripMdcModulePrefixFromLeafString(obj) : obj;
    }
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
    const deviceList = new ArrayList();
    deviceList.add(this.getNeIdFromTarget(target));

    const duration = Date.now()-startTS;
    logger.info("IntentHandler::getTargettedDevices() finished within {} ms", duration|0);

    return deviceList;
  }
}