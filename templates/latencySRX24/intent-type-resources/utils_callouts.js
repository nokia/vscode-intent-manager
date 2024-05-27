/********************************************************************************
 * 
 * UNIVERSAL SCRIPT TO PROVIDE CALLOUTS FOR WEBUI PICKERS/SUGGESTS
  * (c) 2024 by Nokia
 *
 * WARNING!!!
 * THIS INTENT-TYPE IS FOR RESEARCH/STUDY ONLY!
 *
 * DON'T MODIFY!!!
 * Changes restricted to: target, models, main-script, viewConfig and templates
 *
 * Restrictions:
 *   - Scalability/Performance
 *   - Limited error-handling (FTL, ...)
 *   - Implementation is not thread-safe (parallel sync/audits)
 *   - Requires MDC mediation (devices with NETCONF or gRPC support)
 * 
 * Experimental features:
 *   - operation merge and delete
 *   - ignore-children
 *   - intend-based assurance
 * 
 * Under investigation:
 *   - View-Config evolution (avoid custom callbacks)
 *   - Deployment/audits using CLI and NFMP mediation
 *   - Intent dependencies, shared objects and undesired objects
 *   - IBSF / ICM compliancy
 *   - Event-driven audits (no-code)
 *   - Pre-approved misalignments (low-code)
 *   - Intent-based assurance ph2 (auto-trigger, separation, ...)
*
 ********************************************************************************/

fwkUtils = load({script: resourceProvider.getResource('utils.js'), name: 'fwkUtils'});
utils = new fwkUtils();

/**
  * WebUI callout to get list of nodes from NSP inventory
  * If ne-id is available, filter is applied to the given node only
  *
  **/  

function getNodes(context) {
  args = context.getInputValues()["arguments"];
  attribute = context.getInputValues()["arguments"]["__attribute"];
  
  neId = args;
  attribute.split('.').forEach( function(elem) {neId = neId[elem]} );
  
  var input = {'depth': 3, 'fields': 'ne-id;ne-name;type;version;ip-address'};
  if (neId)
    input['xpath-filter'] = "/nsp-equipment:network/network-element[ne-id='"+neId+"']";
  else
    input['xpath-filter'] = "/nsp-equipment:network/network-element";
  
  result = utils.restconfNspRpc("nsp-inventory:find", input);
    
  if (!result.success)
    return {}
    
  var nodes = {"data": JSON.stringify(result.response["nsp-inventory:output"]["data"])};
  logger.debug(JSON.stringify(nodes));
  return nodes;
};

/**
  * WebUI callout to get list of all ACCESS ports from NSP inventory
  * If "ne-id" is present, filter is applied to ports of the given node only
  * If "ne-id" and "port-id" are present, filter is applied to the given port only
  *
  **/

function getAccessPorts(context) {
  args = context.getInputValues()["arguments"];
  attribute = context.getInputValues()["arguments"]["__attribute"];

  portId = args;
  attribute.split('.').forEach( function(elem) {portId = portId[elem]} );

  neId = args;
  attribute.replace('port-id', 'ne-id').split('.').forEach( function(elem) {neId = neId[elem]} );
  
  var input = {'depth': 3, 'fields': 'name;description;port-details'};
  if (neId && portId)
    input['xpath-filter'] = "/nsp-equipment:network/network-element[ne-id='"+neId+"']/hardware-component/port[name='"+portId+"']";
  else if (neId)
    input['xpath-filter'] = "/nsp-equipment:network/network-element[ne-id='"+neId+"']/hardware-component/port[boolean(port-details[port-type='ethernet-port'][port-mode='access'])]";
  else
    input['xpath-filter'] = "/nsp-equipment:network/network-element/hardware-component/port[boolean(port-details[port-type='ethernet-port'][port-mode='access'])]";

  result = utils.restconfNspRpc("nsp-inventory:find", input);
  
  if (!result.success)
    return {}
  
  var data = [];
  result.response["nsp-inventory:output"]["data"].forEach( function(obj) {data.push(utils.serialize(obj)) });
  
  var ports = {"data": JSON.stringify(data)};
  logger.debug(JSON.stringify(ports));
  return ports;
};

/**
  * WebUI callout to get list of all ETHERNET ports from NSP inventory
  * If "ne-id" is present, filter is applied to ports of the given node only
  * If "ne-id" and "port-id" are present, filter is applied to the given port only
  *
  **/  

function getPorts(context) {
  args = context.getInputValues()["arguments"];
  attribute = context.getInputValues()["arguments"]["__attribute"];

  portId = args;
  attribute.split('.').forEach( function(elem) {portId = portId[elem]} );

  neId = args;
  attribute.replace('port-id', 'ne-id').split('.').forEach( function(elem) {neId = neId[elem]} );
  
  var input = {'depth': 3, 'fields': 'name;description;port-details'};
  if (neId && portId)
    input['xpath-filter'] = "/nsp-equipment:network/network-element[ne-id='"+neId+"']/hardware-component/port[name='"+portId+"']";
  else if (neId)
    input['xpath-filter'] = "/nsp-equipment:network/network-element[ne-id='"+neId+"']/hardware-component/port[boolean(port-details[port-type='ethernet-port'])]";
  else
    input['xpath-filter'] = "/nsp-equipment:network/network-element/hardware-component/port[boolean(port-details[port-type='ethernet-port'])]";

  result = utils.restconfNspRpc("nsp-inventory:find", input);
  
  if (!result.success)
    return {}
  
  var data = [];
  result.response["nsp-inventory:output"]["data"].forEach( function(obj) { data.push(utils.serialize(obj)) });
  
  var ports = {"data": JSON.stringify(data)};
  logger.debug(JSON.stringify(ports));
  return ports;
};

/**
  * WebUI callout to get list of neId's (managed by MDM/MDC)
  *
  **/

function getTargetNodes(context) {
  
    var devices = mds.getAllManagedDevicesFrom(['MDC']);
    var returnVal = {}
    devices.forEach(function (device) {
      returnVal[device.getName()] = device.getName();
    });
    return returnVal;
};