/* global logger, mds, utilityService, synchronizeResultFactory, auditFactory */
/* eslint no-undef: "error" */

const intentTypeName  = "{{ intent_type }}";
const intentContainer = "{{ intent_type }}:{{ intent_type }}";

/**
  * Deployment of intents to the network, called for synchronize operations.
  * Used to apply create, update, delete and reconcile to managed devices.
  *
  * For house-keeping it is recommended to remember created objects
  * as part of topology/extra-data. This is to enable update and delete
  * operations to remove network objects that are no longer required.
  * 
  * @param {} input input provided by intent-engine
  **/

function synchronize(input) {
  const startTS = Date.now();
  const target  = input.getTarget();
  const state   = input.getNetworkState().name();
  logger.info(intentTypeName+":synchronize(" + target + ") in state " + state);

  // CODE FOR SYNCHRONIZE | BEGIN >>>

  const config = JSON.parse(input.getJsonIntentConfiguration())[0][intentContainer];
  var result   = synchronizeResultFactory.createSynchronizeResult();

  logger.info("intent configuration provided:\n" + JSON.stringify(config, null, "  "));

  logger.debug("logging example (level:debug)");
  logger.info ("logging example (level:info)");
  logger.warn ("logging example (level:warn)");
  logger.error("logging example (level:error)");

  result.setSuccess(true);

  // <<< END | CODE FOR SYNCHRONIZE

  const duration = Date.now()-startTS;
  logger.info(intentTypeName+":synchronize(" + target + ") finished within "+duration+" ms");
  
  return result;
}



/**
  * Function to audit intents.
  * 
  * @param {} input input provided by intent-engine
  **/

function audit(input) {
  const startTS = Date.now();
  const target  = input.getTarget();
  const state   = input.getNetworkState().name();
  logger.info(intentTypeName+":audit(" + target + ") in state " + state);

  // CODE FOR AUDIT | BEGIN >>>

  const config = JSON.parse(input.getJsonIntentConfiguration())[0][intentContainer];
  logger.info("intent configuration provided:\n" + JSON.stringify(config, null, "  "));

  var report   = auditFactory.createAuditReport(null, null);

  // misaligned object (is-configured=false)
  report.addMisAlignedObject(
    auditFactory.createMisAlignedObject("/root/misaligned=1", false, target));

  // misaligned object (is-configured=true)
  report.addMisAlignedObject(
    auditFactory.createMisAlignedObject("/root/misaligned=2", true, target));

  // misaligned object (is-configured=true, is=undesired=true)
  report.addMisAlignedObject(
    auditFactory.createMisAlignedObject("/root/misaligned=3", true, target, true));

  // misaligned attribute
  report.addMisAlignedAttribute(
    auditFactory.createMisAlignedAttribute("/root/misligned=4/attribute", "expected", "actual", target));

  // <<< END | CODE FOR AUDIT
  
  const duration = Date.now()-startTS;
  logger.info(intentTypeName+":audit(" + target + ") finished within "+duration+" ms");

  return report;
}



/**
 * Validation of intent config/target that is automatically called for intent 
 * edit operations. This function is doing enhanced validation, in addition to
 * checks against the intent model (YANG).
 * If the intent config is identified invalid, the C/U/D operation will fail.
 * Execution happens before synchronize() to ensure intent is valid.
 * 
 * @param {} input input provided by intent-engine
 **/

function validate(input) {
  const startTS = Date.now();
  const target  = input.getTarget();
  logger.info(intentTypeName+":validate(" + target + ")");

  // CODE FOR VALIDATION | BEGIN >>>

  const config = JSON.parse(input.getJsonIntentConfiguration())[0][intentContainer];
  logger.info("intent configuration provided:\n" + JSON.stringify(config, null, "  "));

  var contextualErrorJsonObj = {};  
  const neInfo = mds.getAllInfoFromDevices(target);
  if (neInfo === null || neInfo.size() === 0) {
    logger.error(target+" not found!");
    contextualErrorJsonObj["NODE "+target] = "Node not found";
  }
  // <<< END | CODE FOR VALIDATION

  const duration = Date.now()-startTS;
  logger.info(intentTypeName+":validate(" + target + ") finished within "+duration+" ms");
  
  if (Object.keys(contextualErrorJsonObj).length !== 0)
    utilityService.throwContextErrorException(contextualErrorJsonObj);
}



/**
 * WebUI callout for suggesting devices (neId).
 * 
 **/

function getNodes() {
  var devices = mds.getAllManagedDevicesFrom(['MDC','NFM-P']);
  var rvalue = {};
  devices.forEach(function(device) {
    rvalue[device.getName()] = device.getName();
  });
  return rvalue;
}