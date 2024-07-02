/********************************************************************************
 * CALLOUTS FOR WEBUI PICKERS/SUGGESTS
 * 
 * (c) 2024 by Nokia
 ********************************************************************************/

/* global classResolver, Java */
/* global mds, logger, restClient, resourceProvider, utilityService */
/* eslint no-undef: "error" */

let HashMap = classResolver.resolveClass("java.util.HashMap");
let Arrays = Java.type("java.util.Arrays");

export class CalloutHandler
{
  /**
    * Executes nsp-inventory:find operation
    * 
    * RESTCONF API operation supports the following options:  
    *   xpath-filter {string} Object selector
    *   sort-by {string} Output order
    *   offset {number}  Pagination start
    *   limit  {number}  Max number of objects
    *   fields {string}  Output selector
    *   depth  {number}  Max sub-tree depth
    * 
    * @param {object} options Search criteria
    * @param {boolean} flatten Flatten result
    * @returns success {boolean}, errmsg {string}, responses {object[]}
    *
   **/

  static #nspFind(options, flatten) {
    const startTS = Date.now();
    logger.debug("CalloutHandler::#nspFind({})", options["xpath-filter"]);
    
    var result = {};
    var managerInfo = mds.getManagerByName('NSP');
    if (managerInfo.getConnectivityState().toString() === 'CONNECTED') {
      var url = "https://restconf-gateway/restconf/operations/nsp-inventory:find";
      var body = JSON.stringify({"input": options});

      restClient.setIp(managerInfo.getIp());
      restClient.setPort(managerInfo.getPort());
      restClient.setProtocol(managerInfo.getProtocol().toString());

      restClient.post(url, "application/json", body, "application/json", (exception, httpStatus, response) => {
        const duration = Date.now()-startTS;
        logger.info("POST {} {} finished within {} ms", url, options, duration|0);

        if (exception) {
          logger.error("Exception {} occured.", exception);
          result = { success: false, responses: [], errmsg: "Exception "+exception+" occured."};
        }
        else if (httpStatus >= 400) {
          // Either client error (4xx) or server error (5xx)
          logger.warn("NSP response: {} {}", httpStatus, response);
          result = { success: false, responses: [], errmsg: response};
        }
        else {
          // enable for detailed debugging:
          // logger.info("NSP response: {} {}", httpStatus, response);

          const output = JSON.parse(response)["nsp-inventory:output"];
          const count = output["end-index"]-output["start-index"]+1;
          const total = output["total-count"];
          if (total===0)
            logger.info("NSP response: {}, no objects found", httpStatus);
          else if (count===1)
            logger.info("NSP response: {}, single object returned", httpStatus);
          else if (total===count)
            logger.info("NSP response: {}, returned {} objects", httpStatus, count);
          else
            logger.info("NSP response: {}, returned {} objects, total {}", httpStatus, count, total);

          if (flatten) {
            function flattenRecursive(obj, flattenedObject = {}) {
              for (const key in obj) {
                if (key !== '@') {
                  if (typeof obj[key]==='object')
                    flattenRecursive(obj[key], flattenedObject);
                  else
                    flattenedObject[key] = obj[key];
                }
              }
              return flattenedObject;
            }

            result = { success: true, responses: output.data.map(object => flattenRecursive(object)) };
          } else
            result = { success: true, responses: output.data };
        }          
      });
    } else
      result = { success: false, responses: [], errmsg: "NSP mediator is disconnected." };

    const duration = Date.now()-startTS;
    logger.debug("CalloutHandler::#nspFind({}) finished within {} ms", options["xpath-filter"], duration|0);
  
    return result;
  }

/**
  * Retrieve device details from NSP model
  *
  * @param {} neId device
  * 
  **/
  
  static getDeviceDetails(neId) {
    const options = {"depth": 3, "xpath-filter": "/nsp-equipment:network/network-element[ne-id='"+neId+"']"};
    const result = CalloutHandler.#nspFind(options, true);
    
    if (!result.success)
      return {};

    if (result.responses.length === 0)
      return {};

    return result.responses[0];
  }
  
  /**
    * WebUI callout to get list of nodes from NSP inventory
    * If ne-id is available, filter is applied to the given node only
    *
    **/  

  getNodes(context) {
    const startTS = Date.now();
    logger.info("CalloutHandler::getNodes()");

    const args = context.getInputValues()["arguments"];
    const attribute = context.getInputValues()["arguments"]["__attribute"];
    
    var neId = args;
    attribute.split('.').forEach( elem => neId = neId[elem] );
    
    var options = {'depth': 3, 'fields': 'ne-id;ne-name;type;version;ip-address'};
    if (neId)
      options['xpath-filter'] = "/nsp-equipment:network/network-element[ne-id='"+neId+"']";
    else
      options['xpath-filter'] = "/nsp-equipment:network/network-element";
    
    const result = CalloutHandler.#nspFind(options);
    if (!result.success) return {};

    var nodes = new HashMap();
    result.responses.forEach(node => nodes.put(node['ne-id'], node));

    const duration = Date.now()-startTS;
    logger.info("CalloutHandler::getNodes() finished within "+duration+" ms");

    return nodes;  
  }

  /**
    * WebUI callout to get list of all ACCESS ports from NSP inventory
    * If "ne-id" is present, filter is applied to ports of the given node only
    * If "ne-id" and "port-id" are present, filter is applied to the given port only
    *
    **/
   
  getAccessPorts(context) {
    const startTS = Date.now();
    logger.info("CalloutHandler::getAccessPorts()");

    const args = context.getInputValues()["arguments"];
    const attribute = context.getInputValues()["arguments"]["__attribute"];
  
    var portId = args;
    attribute.split('.').forEach( elem => portId = portId[elem] );
  
    var neId = args;
    attribute.replace('port-id', 'ne-id').split('.').forEach( elem => neId = neId[elem] );
    
    var options = {'depth': 3, 'fields': 'name;description;port-details'};
    if (neId && portId)
      options['xpath-filter'] = "/nsp-equipment:network/network-element[ne-id='"+neId+"']/hardware-component/port[name='"+portId+"']";
    else if (neId)
      options['xpath-filter'] = "/nsp-equipment:network/network-element[ne-id='"+neId+"']/hardware-component/port[boolean(port-details[port-type='ethernet-port'][port-mode='access'])]";
    else
      options['xpath-filter'] = "/nsp-equipment:network/network-element/hardware-component/port[boolean(port-details[port-type='ethernet-port'][port-mode='access'])]";
  
    const result = CalloutHandler.#nspFind(options, true);
    if (!result.success) return {};

    var ports = new HashMap();
    result.responses.forEach(port => ports.put(port.name, port));

    const duration = Date.now()-startTS;
    logger.info("CalloutHandler::getAccessPorts() finished within "+duration+" ms");

    return ports;
  }

  /**
    * WebUI callout to get list of all ETHERNET ports from NSP inventory
    * If "ne-id" is present, filter is applied to ports of the given node only
    * If "ne-id" and "port-id" are present, filter is applied to the given port only
    *
    **/  

  getPorts(context) {
    const startTS = Date.now();
    logger.info("CalloutHandler::getPorts()");

    const args = context.getInputValues()["arguments"];
    const attribute = context.getInputValues()["arguments"]["__attribute"];

    var portId = args;
    attribute.split('.').forEach( elem => portId = portId[elem] );

    var neId = args;
    attribute.replace('port-id', 'ne-id').split('.').forEach( elem => neId = neId[elem] );
    
    var options = {'depth': 3, 'fields': 'name;description;port-details'};
    if (neId && portId)
      options['xpath-filter'] = "/nsp-equipment:network/network-element[ne-id='"+neId+"']/hardware-component/port[name='"+portId+"']";
    else if (neId)
      options['xpath-filter'] = "/nsp-equipment:network/network-element[ne-id='"+neId+"']/hardware-component/port[boolean(port-details[port-type='ethernet-port'])]";
    else
      options['xpath-filter'] = "/nsp-equipment:network/network-element/hardware-component/port[boolean(port-details[port-type='ethernet-port'])]";

    const result = CalloutHandler.#nspFind(options, true);
    if (!result.success) return {};

    var ports = new HashMap();
    result.responses.forEach(port => ports.put(port.name, port));

    const duration = Date.now()-startTS;
    logger.info("CalloutHandler::getPorts() finished within "+duration+" ms");

    return ports;
  }

  /**
   * Returns the list of managed devices (neId) for WebUI suggest
   * @param {ValueProviderContext} context
   * @returns Suggestion data in Map format
   */  

  suggestTargetDevices(context) {
    const startTS = Date.now();
    const searchString = context.getSearchQuery();

    if (searchString)
      logger.info("CalloutHandler::suggestTargetDevices("+searchString+")");
    else
      logger.info("CalloutHandler::suggestTargetDevices()");

    var rvalue = new HashMap();
    try  {
      // get connected mediators
      var mediators = [];
      mds.getAllManagersOfType("REST").forEach(mediator => {
        if (mds.getManagerByName(mediator).getConnectivityState().toString() === 'CONNECTED')
          mediators.push(mediator);
      });

      // get managed devices from mediator(s)
      const devices = mds.getAllManagedDevicesFrom(Arrays.asList(mediators));

      // filter result by searchString provided from WebUI
      var filteredDevicenames = [];
      devices.forEach(device => {
        if (!searchString || device.getName().indexOf(searchString) !== -1)
          filteredDevicenames.push(device.getName());
      });
      logger.info("Found "+filteredDevicenames.length+" devices!");

      // convert output into HashMap required by WebUI framework
      filteredDevicenames.sort().forEach(devicename => rvalue[devicename]=devicename);
    }
    catch (exception) {
      logger.error("Exception {} occured.", exception);
    }

    const duration = Date.now()-startTS;
    logger.info("CalloutHandler::suggestTargetDevices() finished within "+duration+" ms");

    return rvalue;
  }
}