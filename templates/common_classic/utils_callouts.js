/********************************************************************************
 * 
 * SCRIPT TO PROVIDING CALLOUTS FOR SCHEMA-FORM PICKER/SUGGEST
 * (c) 2024 by Nokia
 *
 * THIS INTENT-TYPE IS FOR RESEARCH/STUDY ONLY!
 * 
 * 
 * Check README.MD for details!
 * 
 ********************************************************************************/

/* global logger, mds, utils */
/* eslint no-undef: "error" */

/**
  * WebUI callout to get list of nodes from NSP inventory
  * If ne-id is available, filter is applied to the given node only
  *
  * @param {} context Information provided by WebUI framework
  * 
  **/

function getNodes(context) {
  const args = context.getInputValues()["arguments"];
  const attribute = context.getInputValues()["arguments"]["__attribute"];
  
  let neId = args;
  attribute.split('.').forEach( function(elem) {neId = neId[elem];});
  
  var input = {'depth': 3, 'fields': 'ne-id;ne-name;type;version;ip-address', 'include-meta': false};
  if (neId)
    input['xpath-filter'] = "/nsp-equipment:network/network-element[ne-id='"+neId+"']";
  else
    input['xpath-filter'] = "/nsp-equipment:network/network-element";
  
  let result = utils.restconfNspRpc("nsp-inventory:find", input);
    
  if (!result.success)
    return {};
    
  const nodes = {"data": JSON.stringify(result.response["nsp-inventory:output"]["data"])};
  logger.debug(JSON.stringify(nodes));
  return nodes;
}

/**
  * WebUI callout to get list of all ACCESS ports from NSP inventory
  * If "ne-id" is present, filter is applied to ports of the given node only
  * If "ne-id" and "port-id" are present, filter is applied to the given port only
  *
  * @param {} context Information provided by WebUI framework
  * 
  **/

function getAccessPorts(context) {
  const args  = context.getInputValues()["arguments"];
  const attribute = context.getInputValues()["arguments"]["__attribute"];

  let portId = args;
  attribute.split('.').forEach( function(elem) {portId = portId[elem];});

  let neId = args;
  attribute.replace('port-id', 'ne-id').split('.').forEach( function(elem) {neId = neId[elem];});
  
  var input = {'depth': 3, 'fields': 'name;description;port-details', 'include-meta': false};
  if (neId && portId)
    input['xpath-filter'] = "/nsp-equipment:network/network-element[ne-id='"+neId+"']/hardware-component/port[name='"+portId+"']";
  else if (neId)
    input['xpath-filter'] = "/nsp-equipment:network/network-element[ne-id='"+neId+"']/hardware-component/port[boolean(port-details[port-type='ethernet-port'][port-mode='access'])]";
  else
    input['xpath-filter'] = "/nsp-equipment:network/network-element/hardware-component/port[boolean(port-details[port-type='ethernet-port'][port-mode='access'])]";

  let result = utils.restconfNspRpc("nsp-inventory:find", input);
  
  if (!result.success)
    return {};
  
  var data = [];
  result.response["nsp-inventory:output"]["data"].forEach( function(obj) {data.push(utils.serialize(obj));});
  
  const ports = {"data": JSON.stringify(data)};
  logger.debug(JSON.stringify(ports));
  return ports;
}

/**
  * WebUI callout to get list of all ETHERNET ports from NSP inventory
  * If "ne-id" is present, filter is applied to ports of the given node only
  * If "ne-id" and "port-id" are present, filter is applied to the given port only
  * 
  * @param {} context Information provided by WebUI framework
  *
  **/  

function getPorts(context) {
  const args = context.getInputValues()["arguments"];
  const attribute = context.getInputValues()["arguments"]["__attribute"];

  let portId = args;
  attribute.split('.').forEach( function(elem) {portId = portId[elem];} );

  let neId = args;
  attribute.replace('port-id', 'ne-id').split('.').forEach( function(elem) {neId = neId[elem];} );
  
  var input = {'depth': 3, 'fields': 'name;description;port-details', 'include-meta': false};
  if (neId && portId)
    input['xpath-filter'] = "/nsp-equipment:network/network-element[ne-id='"+neId+"']/hardware-component/port[name='"+portId+"']";
  else if (neId)
    input['xpath-filter'] = "/nsp-equipment:network/network-element[ne-id='"+neId+"']/hardware-component/port[boolean(port-details[port-type='ethernet-port'])]";
  else
    input['xpath-filter'] = "/nsp-equipment:network/network-element/hardware-component/port[boolean(port-details[port-type='ethernet-port'])]";

  let result = utils.restconfNspRpc("nsp-inventory:find", input);
  
  if (!result.success)
    return {};
  
  var data = [];
  result.response["nsp-inventory:output"]["data"].forEach( function(obj) {data.push(utils.serialize(obj));} );
  
  const ports = {"data": JSON.stringify(data)};
  logger.debug(JSON.stringify(ports));
  return ports;
}

/**
  * WebUI callout to get list of neId's (managed by MDM/MDC)
  *
  * @param {} context Information provided by WebUI framework
  * 
  **/

function getTargetNodes(context) {
  const devices = mds.getAllManagedDevicesFrom(['MDC']);
  var returnVal = {};
  devices.forEach(function (device) {
    returnVal[device.getName()] = device.getName();
  });
  return returnVal;
}