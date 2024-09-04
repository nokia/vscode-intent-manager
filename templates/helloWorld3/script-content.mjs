/* global Java, logger, mds, utilityService */
/* global classResolver */
/* eslint no-undef: "error" */

const INTENT_TYPE_NAME  = "{{ intent_type }}";
const INTENT_ROOT = "{{ intent_type }}:{{ intent_type }}";

let ValidateResult = classResolver.resolveClass("com.nokia.fnms.controller.ibn.intenttype.spi.ValidateResult");
let SynchronizeResult = classResolver.resolveClass("com.nokia.fnms.controller.ibn.intenttype.spi.SynchronizeResult");
let AuditReport = classResolver.resolveClass("com.nokia.fnms.controller.ibn.intenttype.spi.AuditReport");
let MisAlignedObject = classResolver.resolveClass("com.nokia.fnms.controller.ibn.intenttype.spi.MisAlignedObject");
let MisAlignedAttribute = classResolver.resolveClass("com.nokia.fnms.controller.ibn.intenttype.spi.MisAlignedAttribute");

let HashMap = classResolver.resolveClass("java.util.HashMap");
let Arrays = Java.type("java.util.Arrays");

export class IntentTypeHandler {
  constructor() {
    logger.info("Creating IntentTypeHandler for "+INTENT_TYPE_NAME);
  }

  /**
    * Deployment of the intent to the network, called for synchronize operations.
    * Used to execute create, update, delete and reconcile operations.
    * 
    * For house-keeping it is recommended to remember created objects
    * as part of topology/extra-data. This is to enable update and delete
    * operations to remove network objects that are no longer required.
    * 
    * @param {SynchronizeInput} input Used to access information about the intent to be synchronized
    * @returns {SynchronizeResult} provide information about the execution/success back to the engine
    **/

  async synchronize(input) {
    const startTS = Date.now();
    const target  = input.getTarget();
    const state   = input.getNetworkState().name();
    logger.info(INTENT_TYPE_NAME+":synchronize(" + target + ") in state " + state);

    const config = JSON.parse(input.getJsonIntentConfiguration())[0][INTENT_ROOT];
    logger.info("intent configuration provided:\n" + JSON.stringify(config, null, "  "));

    // doing some logs    
    logger.debug("logging example (level:debug)");
    logger.info ("logging example (level:info)");
    logger.warn ("logging example (level:warn)");
    logger.error("logging example (level:error)");

    // doing some string operations around target/ne-id
    let areaCode;
    let areaCode4d;
    if (target.indexOf(':') >= 0) {
      logger.info('ne-id is IPv6 address');
      areaCode = target.split(':')[0].substring(2);
      areaCode4d = areaCode.padStart(4, '0');
    } else {
      logger.info('ne-id is IPv4 address');
      areaCode = target.split('.')[1];
      areaCode4d = areaCode.padStart(4, '0');
    }
    logger.info('extracted areaCode from ne-id '+areaCode);
    logger.info('4 digit areaCode '+areaCode4d);

    const result = new SynchronizeResult();
    result.setSuccess(true);

    const duration = Date.now()-startTS;
    logger.info(INTENT_TYPE_NAME+":synchronize(" + target + ") finished within "+duration+" ms");
    
    return result;
  }

  /**
    * Execute intent audits by comparing desired vs actual configuration (and state).
    * 
    * @param {AuditInput} input used to access information about the intent to be audited
    * @returns {AuditReport} audit-report object containing the misaligned attributed and objects 
    **/

  async onAudit(input) {
    const startTS = Date.now();
    const target  = input.getTarget();
    const state   = input.getNetworkState().name();
    logger.info(INTENT_TYPE_NAME+":audit(" + target + ") in state " + state);

    const config = JSON.parse(input.getJsonIntentConfiguration())[0][INTENT_ROOT];
    logger.info("intent configuration provided:\n" + JSON.stringify(config, null, "  "));

    const report = new AuditReport();
    report.setIntentType(INTENT_TYPE_NAME);
    report.setTarget(target);

    // misaligned attribute
    report.addMisAlignedAttribute(new MisAlignedAttribute("namespace:root/misaligned=1/attribute", "expected", "actual", target));
    
    // missing objects (is-undesired=false)
    report.addMisAlignedObject(new MisAlignedObject("namespace:root/missing=2", false, target)); // (is-configured=false)
    report.addMisAlignedObject(new MisAlignedObject("namespace:root/missing=3", true, target));  // (is-configured=true)

    // undesired objects (is-undesired=true)
    report.addMisAlignedObject(new MisAlignedObject("namespace:root/undesired=4", false, target, true)); // (is-configured=false)
    report.addMisAlignedObject(new MisAlignedObject("namespace:root/undesired=5", true, target, true));  // (is-configured=true)

    const duration = Date.now()-startTS;
    logger.info(INTENT_TYPE_NAME+":audit(" + target + ") finished within "+duration+" ms");

    return report;
  }

  /**
    * Validation of intent config/target that is automatically called for intent 
    * create/edit and state-change operations. This method may do enhanced
    * validation, in addition to checks against the intent model (YANG), that is
    * automatically executed by the intent engine.
    * 
    * If the intent config is identified invalid, the create/edit operation will
    * fail. Execution happens before synchronize() to ensure intent is valid.
    * 
    * @param {} input input provided by intent-engine
    * @returns {ValidateResult} *
    **/

  validate(input) {
    const startTS = Date.now();
    const target  = input.getTarget();
    logger.info(INTENT_TYPE_NAME+":validate(" + target + ")");

    const config = JSON.parse(input.getJsonIntentConfiguration())[0][INTENT_ROOT];
    logger.info("intent configuration provided:\n" + JSON.stringify(config, null, "  "));

    const contextualErrorJsonObj = {};

    const neInfo = mds.getAllInfoFromDevices(target);
    if (neInfo === null || neInfo.size() === 0) {
      logger.error("Node "+target+" not found!");
      contextualErrorJsonObj["NODE "+target] = "Node not found";
    }

    const duration = Date.now()-startTS;
    logger.info(INTENT_TYPE_NAME+":validate(" + target + ") finished within "+duration+" ms");
    
    if (Object.keys(contextualErrorJsonObj).length !== 0)
      utilityService.throwContextErrorException(contextualErrorJsonObj);

    const validateResult = new ValidateResult();
    return validateResult;
  }

  /**
    * Returns the list of managed devices (neId) for WebUI suggest
    * @param {ValueProviderContext} valueProviderContext
    * @returns Suggestion data as Java HashMap
    **/  

  suggestTargetDevices(valueProviderContext) {
    const startTS = Date.now();
    const searchString = valueProviderContext.getSearchQuery();

    if (searchString)
      logger.info(INTENT_TYPE_NAME+":suggestTargetDevices("+searchString+")");
    else
      logger.info(INTENT_TYPE_NAME+":suggestTargetDevices()");

    const rvalue = new HashMap();
    try  {
      // get connected mediators
      const mediators = mds.getAllManagersOfType("REST")
        .filter(mediator => mds.getManagerByName(mediator).getConnectivityState().toString() === 'CONNECTED');

      // get managed devices from mediator(s)
      const devices = mds.getAllManagedDevicesFrom(Arrays.asList(mediators));

      // filter result by searchString provided from WebUI
      const filteredDevicenames = devices
        .filter(device => !searchString || device.getName().includes(searchString))
        .map(device => device.getName());
      logger.info("Found "+filteredDevicenames.length+" devices!");

      // convert output as required by WebUI framework
      filteredDevicenames.sort().forEach(devicename => rvalue[devicename]=devicename);
    }
    catch (e) {
      logger.error("Exception catched: " + e);
    }

    const duration = Date.now()-startTS;
    logger.info(INTENT_TYPE_NAME+":suggestTargetDevices() finished within "+duration+" ms");

    return rvalue;
  }
}

let myHandler = new IntentTypeHandler();
myHandler;