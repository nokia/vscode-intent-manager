let ValidateResult = classResolver.resolveClass("com.nokia.fnms.controller.ibn.intenttype.spi.ValidateResult");
let AuditReport = classResolver.resolveClass("com.nokia.fnms.controller.ibn.intenttype.spi.AuditReport");
let MisAlignedObject = classResolver.resolveClass("com.nokia.fnms.controller.ibn.intenttype.spi.MisAlignedObject");
let MisAlignedAttribute = classResolver.resolveClass("com.nokia.fnms.controller.ibn.intenttype.spi.MisAlignedAttribute");
let HashMap = classResolver.resolveClass("java.util.HashMap");
let Arrays = Java.type("java.util.Arrays");

export class IntentTypeHandler {
  INTENT_TYPE_NAME = "hellograal";
  INTENT_ROOT = "hellograal:hellograal";

  constructor() {
    logger.info("Creating IntentTypeHandler for "+this.INTENT_TYPE_NAME);
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
    logger.info(this.INTENT_TYPE_NAME+":synchronize(" + target + ") in state " + state);

    // CODE FOR SYNCHRONIZE | BEGIN >>>

    const config = JSON.parse(input.getJsonIntentConfiguration())[0][this.INTENT_ROOT];
    var topology = input.getCurrentTopology();
    var result   = synchronizeResultFactory.createSynchronizeResult();

    logger.debug("logging example (level:debug)");
    logger.info ("logging example (level:info)");
    logger.warn ("logging example (level:warn)");
    logger.error("logging example (level:error)");

    result.setSuccess(true);

    // <<< END | CODE FOR SYNCHRONIZE

    const duration = Date.now()-startTS;
    logger.info(this.INTENT_TYPE_NAME+":synchronize(" + target + ") finished within "+duration+" ms");
    
    return result;
  }

  /**
    * Method to audit intents.
    * 
    * @param {AuditInput} input used to access information about the intent to be audited
    * @returns {AuditReport} audit-report object containing the misaligned attributed and objects 
    **/

  async onAudit(input) {
    const startTS = Date.now();
    const target  = input.getTarget();
    const state   = input.getNetworkState().name();
    logger.info(this.INTENT_TYPE_NAME+":audit(" + target + ") in state " + state);

    // CODE FOR AUDIT | BEGIN >>>

    const config = JSON.parse(input.getJsonIntentConfiguration())[0][this.INTENT_ROOT];
    var topology = input.getCurrentTopology();
    var report   = new AuditReport();

    // misaligned object (is-configured=false)
    let misAlignedObject;
    
    // missing objects (is-undesired=false)
    report.addMisAlignedObject(new MisAlignedObject("/root/missing=1", false, target)); // (is-configured=false)
    report.addMisAlignedObject(new MisAlignedObject("/root/missing=2", true, target));  // (is-configured=true)

    // undesired objects (is-undesired=true)
    report.addMisAlignedObject(new MisAlignedObject("/root/undesired=3", false, target, true)); // (is-configured=false)
    report.addMisAlignedObject(new MisAlignedObject("/root/undesired=4", true, target, true));  // (is-configured=true)

    // misaligned attribute
    report.addMisAlignedAttribute(new MisAlignedAttribute("/root/misaligned=5", "expected", "actual", target));

    // <<< END | CODE FOR AUDIT
    
    const duration = Date.now()-startTS;
    logger.info(this.INTENT_TYPE_NAME+":audit(" + target + ") finished within "+duration+" ms");

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
    logger.info(this.INTENT_TYPE_NAME+":validate(" + target + ")");

    // CODE FOR VALIDATION | BEGIN >>>

    let validateResult = new ValidateResult();

    const config = JSON.parse(input.getJsonIntentConfiguration())[0][this.INTENT_ROOT];
    logger.info("intent configuration provided:\n" + JSON.stringify(config, null, "  "));

    var contextualErrorJsonObj = {};  
    const neInfo = mds.getAllInfoFromDevices(target);
    if (neInfo === null || neInfo.size() === 0) {
      logger.error("Node "+target+" not found!")
      contextualErrorJsonObj["NODE "+target] = "Node not found";
    }
    // <<< END | CODE FOR VALIDATION

    const duration = Date.now()-startTS;
    logger.info(this.INTENT_TYPE_NAME+":validate(" + target + ") finished within "+duration+" ms");
    
    if (Object.keys(contextualErrorJsonObj).length !== 0)
      utilityService.throwContextErrorException(contextualErrorJsonObj);

    return validateResult;
  }

  /**
   * Returns the list of managed devices (neId) for WebUI suggest
   * @param {ValueProviderContext} valueProviderContext
   * @returns Suggestion data in Map format
   */  

  suggestTargetDevices(valueProviderContext) {
    const startTS = Date.now();
    const searchString = valueProviderContext.getSearchQuery();

    if (searchString)
      logger.info(this.INTENT_TYPE_NAME+":suggestTargetDevices("+searchString+")");
    else
      logger.info(this.INTENT_TYPE_NAME+":suggestTargetDevices()");

    var rvalue = new HashMap();
    try  {
      // get connected mediators
      var mediators = [];
      mds.getAllManagersOfType("REST").forEach((mediator) => {
        if (mds.getManagerByName(mediator).getConnectivityState().toString() === 'CONNECTED')
          mediators.push(mediator);
      });

      // get managed devices from mediator(s)
      const devices = mds.getAllManagedDevicesFrom(Arrays.asList(mediators));

      // filter result by searchString provided from WebUI
      var filteredDevicenames = [];
      devices.forEach((device) => {
        if (!searchString || device.getName().indexOf(searchString) !== -1)
          filteredDevicenames.push(device.getName());
      });
      logger.info("Found "+filteredDevicenames.length+" devices!");

      // convert output into HashMap required by WebUI framework
      filteredDevicenames.sort().forEach((devicename) => rvalue[devicename]=devicename);
    }
    catch (e) {
      logger.error("Exception catched: " + e);
    }

    const duration = Date.now()-startTS;
    logger.info(this.INTENT_TYPE_NAME+":suggestTargetDevices() finished within "+duration+" ms");

    return rvalue;
  }
}

let myHandler = new IntentTypeHandler();
myHandler;