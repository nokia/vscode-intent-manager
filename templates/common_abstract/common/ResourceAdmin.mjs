/****************************************************************************
 * NSP API WRAPPER TO SIMPLIFY USAGE OF RESOURCE ADMINISTRATOR
 * 
 * Class `ResourceAdmin` is used as container for static methods only.
 * Methods can be called directly, without the need to instantiate the class.
 * 
 * (c) 2024 by Nokia
 ****************************************************************************/

/* global classResolver, Java */
/* global mds, logger, restClient, resourceProvider, utilityService */
/* eslint no-undef: "error" */

export class ResourceAdmin {
  /**
   * Executes nsp-inventory:find operation
   * 
   * @param {string} xpath Search criteria (object selector)
   * 
   * @returns success {boolean}, errmsg {string}, response {object or null}
   **/

  static #nspFindEntry(xpath) {
    const startTS = Date.now();
    logger.debug("ResourceAdmin::#nspFindEntry({})", xpath);
    
    var result = {};
    var managerInfo = mds.getManagerByName('NSP');
    if (managerInfo.getConnectivityState().toString() === 'CONNECTED') {
      var url = "https://restconf-gateway/restconf/operations/nsp-inventory:find";
      var body = JSON.stringify({"input": {"xpath-filter": xpath, 'include-meta': false}});

      restClient.setIp(managerInfo.getIp());
      restClient.setPort(managerInfo.getPort());
      restClient.setProtocol(managerInfo.getProtocol().toString());

      restClient.post(url, "application/json", body, "application/json", (exception, httpStatus, response) => {
        const duration = Date.now()-startTS;
        logger.debug("POST {} {} finished within {} ms", url, body, duration|0);

        if (exception) {
          logger.error("Exception {} occured.", exception);
          result = { success: false, response: {}, errmsg: "Exception "+exception+" occured."};
        }
        else if (httpStatus >= 400) {
          // Either client error (4xx) or server error (5xx)
          let errmsg = "HTTP ERROR "+httpStatus;
          logger.warn("NSP response: {} {}", httpStatus, response);

          if ((/<html/i).test(response)) {
            // Extract error details from HTML response:
            const errMatch = response.match(/<body[^>]*>(.*)<\/body>/i);
            if (errMatch)
              errmsg = errMatch[1].trim(); // extracted errmsg from html body
          } else {
            // Extract error details from JSON response:
            //
            // Error details returned in accordance to rfcC8040
            //   {"ietf-restconf:errors":{"error":[{ error details }]}}
            //
            // Error fields (check rfc6241 for details):
            //   error-type       enumeration
            //   error-tag        string
            //   error-app-tag?   string
            //   error-path?      instance-identifier
            //   error-message?   string
            //   error-info?      anydata          

            const errorObject = JSON.parse(response);
            if ('ietf-restconf:errors' in errorObject)
              errmsg = errorObject['ietf-restconf:errors'].error.map(error => error["error-message"]).join(', ');
          }

          result = { success: false, response: {}, errmsg: errmsg};
        }
        else {
          logger.debug("NSP response: {} {}", httpStatus, response);
          const output = JSON.parse(response)["nsp-inventory:output"];
          const total = output["total-count"];

          if (total === 0) {
            logger.debug("Resource not found");
            result = { success: true, response: null };
          }
          else if (total > 1) {
            logger.warn("Query xpath={} returned multiple resources! Only returning first entry found!", xpath);
            result = { success: true, response: output.data[0] };
          } else {
            result = { success: true, response: output.data[0] };
          }
        }          
      });
    } else
      result = { success: false, response: {}, errmsg: "NSP mediator is disconnected." };

    const duration = Date.now()-startTS;
    logger.debug("ResourceAdmin::#nspFindEntry({}) finished within {} ms", xpath, duration|0);
  
    return result;
  }

  /**
   * Executes NSP RESTCONF POST
   * 
   * Used for (1) calling actions and (2) creation of resources.
   * 
   * @param {string} resource model-path string of the parent resource
   * @param {object} payload input variables (action specific) or resource details
   * 
   * @returns success {boolean} and errmsg {string}
   */

  static #restconfNspPost(resource, payload) {
    const startTS = Date.now();
    logger.debug("ResourceAdmin::#restconfNspPost({})", resource);

    let result = {};
    const managerInfo = mds.getManagerByName('NSP');
    if (managerInfo.getConnectivityState().toString() === 'CONNECTED') {
      const url = "https://restconf-gateway/restconf/data/"+resource;
      const body = JSON.stringify(payload);
  
      restClient.setIp(managerInfo.getIp());
      restClient.setPort(managerInfo.getPort());
      restClient.setProtocol(managerInfo.getProtocol().toString());

      restClient.post(url, "application/json", body, "application/json", (exception, httpStatus, response) => {
        const duration = Date.now()-startTS;
        logger.debug("POST {} {} finished within {} ms", url, body, duration|0);
        
        if (exception) {
          logger.error("Exception {} occured.", exception);
          result = { success: false, response: {}, errmsg: "Exception "+exception+" occured."};
        }
        else if (httpStatus >= 400) {
          // Either client error (4xx) or server error (5xx)
          let errmsg = "HTTP ERROR "+httpStatus;
          logger.warn("NSP response: {} {}", httpStatus, response);

          if ((/<html/i).test(response)) {
            // Extract error details from HTML response:
            const errMatch = response.match(/<body[^>]*>(.*)<\/body>/i);
            if (errMatch)
              errmsg = errMatch[1].trim(); // extracted errmsg from html body
          } else {
            // Extract error details from JSON response:
            //
            // Error details returned in accordance to RFC802
            //   {"ietf-restconf:errors":{"error":[{ error details }]}}
            //
            // Error fields:
            //   error-type       enumeration
            //   error-tag        string
            //   error-app-tag?   string
            //   error-path?      instance-identifier
            //   error-message?   string
            //   error-info?      anydata          

            const errorObject = JSON.parse(response);
            if ('ietf-restconf:errors' in errorObject)
              errmsg = errorObject['ietf-restconf:errors'].error.map(error => error["error-message"]).join(', ');
          }

          result = { success: false, response: {}, errmsg: errmsg};
        }
        else if (httpStatus == 201) {
          logger.debug("NSP response: {}", httpStatus);
          result = { success: true };
        } else {
          logger.debug("NSP response: {} {}", httpStatus, response);
          result = { success: true, response: JSON.parse(response) };
        }
      });
    } else
      result = { success: false, errmsg: "NSP mediator is disconnected." };
    
    const duration = Date.now()-startTS;
    logger.debug("ResourceAdmin::#restconfNspPost() finished within {} ms", duration|0);

    return result;
  }

  /**
   * Create an IP pool (if it does not already exist)
   * 
   * @param {string} pool IP pool to be created
   * @param {string} scope
   * @param {string} description
   * @param {string} ipmask
   * @param {string} purpose
   * 
   * @throws {Error} find/create ip-pool failed
   */

  static createIpPool(pool, scope, description, ipmask, purpose) {
    const startTS = Date.now();
    logger.info("ResourceAdmin::createIpPool(pool={}, scope={})", pool, scope);

    const result = this.#nspFindEntry("/nsp-resource-pool:resource-pools/ip-resource-pools[name='"+pool+"' and scope='"+scope+"']");
    if (!result.success)
      throw new Error("Find ip-pool failed with "+result.errmsg);

    if (!result.response) {
      const resource = "nsp-resource-pool:resource-pools";
      const payload = {
        "nsp-resource-pool:ip-resource-pools": {
          "name": pool,
          "scope": scope,
          "type": "nsp-resource-pool-utils:ip-address-prefix",
          "description": description,
          "ip-pool-spec": {
            "ip-masks": [{
              "ip-mask": ipmask,
              "purposes": [purpose]
            }]
          }
        }
      };    
      const result = this.#restconfNspPost(resource, payload);
      
      if (!result.success)
        throw new Error("Create ip-pool failed with "+result.errmsg);
    }

    const duration = Date.now()-startTS;
    logger.info("ResourceAdmin::createIpPool(pool={}, scope={}) finished within {} ms", pool, scope, duration|0);
  }

  /**
   * Get reserved subnet from Resource Admin
   * 
   * @param {string} pool IP pool to be used
   * @param {string} scope
   * @param {string} target reference for reservation
   * 
   * @returns subnet as string, for example 10.0.0.0/31 (or empty string in error cases)
   * 
   * @throws {Error} find subnet failed, e.g. not reserved/obtained yet
   */

  static getSubnet(pool, scope, target) {
    const startTS = Date.now();
    logger.info("ResourceAdmin::getSubnet(pool={}, scope={}, target={})", pool, scope, target);

    const result = this.#nspFindEntry("/nsp-resource-pool:resource-pools/ip-resource-pools[name='"+pool+"' and scope='"+scope+"']/consumed-resources[reference='"+target+"']");
    
    if (!result.success)
      throw new Error("Find subnet failed with "+result.errmsg);

    if (!result.response)
      throw Error("Subnet for pool="+pool+" scope="+scope+" target="+target+" must be reserved/obtained first!");

    logger.info("subnet: {}", result.response.value );

    const duration = Date.now()-startTS;
    logger.info("ResourceAdmin::getSubnet(pool={}, scope={}, target={}) finished within {} ms", pool, scope, target, duration|0);

    return result.response.value;
  }
  
  /**
   * Obtain subnet from Resource Admin
   *
   * @param {string} pool IP pool to be used
   * @param {string} scope Scope, for example 'global'
   * @param {string} purpose Purpose tag, for example 'network-link'
   * @param {number} pfxlen Prefix-length for subnet
   * @param {string} intentTypeName reference for reservation
   * @param {string} target reference for reservation
   * @returns subnet as string, for example 10.0.0.0/31 (or empty string in error cases)
   * 
   * @throws {Error} obtain subnet failed
   */

  static obtainSubnet(pool, scope, purpose, pfxlen, intentTypeName, target) {
    const startTS = Date.now();
    logger.info("ResourceAdmin::obtainSubnet(pool={}, scope={}, target={})", pool, scope, target);

    const result = this.#nspFindEntry("/nsp-resource-pool:resource-pools/ip-resource-pools[name='"+pool+"' and scope='"+scope+"']/consumed-resources[reference='"+target+"']");
    
    if (!result.success)
      throw new Error("Find subnet failed with "+result.errmsg);

    let subnet = "";
    if (result.response) {
      subnet = result.response.value;
      logger.info("subnet: {} (existing entry)", subnet );
    } else {
      const resource = "nsp-resource-pool:resource-pools/ip-resource-pools="+pool+","+scope+"/obtain-value-from-pool";
      const input = {
        "owner": "restconf/data/ibn:ibn/intent=" + target + "," + intentTypeName,
        "confirmed": true,
        "all-or-nothing": true,
        "reference": target,
        "total-number-of-resources": 1,
        "allocation-mask": pfxlen,
        "purpose": purpose
      };
      const result = this.#restconfNspPost(resource, {"input": input});
      
      if (!result.success)
        throw new Error("Obtain subnet failed with "+result.errmsg);

      subnet = result.response["nsp-resource-pool:output"]["consumed-resources"][0][0].value;
      logger.info("subnet: {} (new entry)", subnet );
    }

    const duration = Date.now()-startTS;
    logger.info("ResourceAdmin::obtainSubnet(pool={}, scope={}, target={}) finished within {} ms", pool, scope, target, duration|0);

    return subnet;
  }

  /**
    * Release subnet from Resource Admin
    *
    * @param {} pool IP pool to be used
    * @param {} scope IP pool to be used
    * @param {} target reference for reservation 
    * 
    **/
  
  static releaseSubnet(pool, scope, target) {
    const startTS = Date.now();
    logger.info("ResourceAdmin::releaseSubnet(pool={}, scope={}, target={})", pool, scope, target);

    const resource = "nsp-resource-pool:resource-pools/ip-resource-pools="+pool+","+scope+"/release-by-ref";
    const input = {"reference": target};
    
    const result = this.#restconfNspPost(resource, {"input": input});
    
    if (!result.success)
      logger.error("releaseSubnet(" + target + ") failed with error:\n" + result.errmsg);

    const duration = Date.now()-startTS;
    logger.info("ResourceAdmin::releaseSubnet(pool={}, scope={}, target={}) finished within {} ms", pool, scope, target, duration|0);
  }

  /**
   * Create an numeric pool (if it does not already exist)
   * 
   * @param {string} pool Numeric pool to be created
   * @param {string} scope
   * @param {string} description
   * @param {number} minValue
   * @param {number} maxValue
   * 
   * 
   * @throws {Error} find/create numeric-pool failed
   */

  static createNumericPool(pool, scope, description, minValue, maxValue) {
    const startTS = Date.now();
    logger.info("ResourceAdmin::createNumericPool(pool={}, scope={})", pool, scope);

    const result = this.#nspFindEntry("/nsp-resource-pool:resource-pools/numeric-resource-pools[name='"+pool+"' and scope='"+scope+"']");
    if (!result.success)
      throw new Error("Find numeric-pool failed with "+result.errmsg);

    if (!result.response) {
      const resource = "nsp-resource-pool:resource-pools";
      const payload = {
        "nsp-resource-pool:numeric-resource-pools": {
          "name": pool,
          "scope": scope,
          "type": "nsp-resource-pool-utils:numerical",
          "description": description,
          "numeric-spec": {
              "min-value": minValue,
              "max-value": maxValue
          }
        }
      };    
      const result = this.#restconfNspPost(resource, payload);
      
      if (!result.success)
        throw new Error("Create numeric-pool failed with "+result.errmsg);
    }

    const duration = Date.now()-startTS;
    logger.info("ResourceAdmin::createNumericPool(pool={}, scope={}) finished within {} ms", pool, scope, duration|0);
  }

  /**
    * Get reserved number from Resource Admin
    * 
    * @param {} pool numeric pool to be used
    * @param {} scope numeric pool to be used
    * @param {} target reference for reservation
    * @returns number as string
    * 
    **/
    
  static getId(pool, scope, target) {
    const startTS = Date.now();
    logger.info("ResourceAdmin::getId(pool={}, scope={}, target={})", pool, scope, target);

    const result = this.#nspFindEntry( "/nsp-resource-pool:resource-pools/numeric-resource-pools[name='"+pool+"' and scope='"+scope+"']/num-consumed-resources[reference='"+target+"']");
    
    if (!result.success)
      throw new Error("Find id failed with "+result.errmsg);

    if (result.response)
      logger.info("id: {}", result.response.value );
    else
      throw Error("Id for pool="+pool+" scope="+scope+" target="+target+" must be reserved/obtained first!");

    const duration = Date.now()-startTS;
    logger.info("ResourceAdmin::getId(pool={}, scope={}, target={}) finished within {} ms", pool, scope, target, duration|0);

    return result.response.value;
  }

  /**
    * Obtain a number from Resource Admin
    *
    * @param {} pool numeric pool to be used
    * @param {} scope numeric pool to be used
    * @param {} intentTypeName reference for reservation 
    * @param {} target reference for reservation 
    * @returns number as string
    * 
    * @throws {Error} obtain number failed
    * 
    **/
  
  static obtainId(pool, scope, intentTypeName, target) {
    const startTS = Date.now();
    logger.info("ResourceAdmin::obtainId(pool={}, scope={}, target={})", pool, scope, target);

    const result = this.#nspFindEntry("/nsp-resource-pool:resource-pools/numeric-resource-pools[name='"+pool+"' and scope='"+scope+"']/num-consumed-resources[reference='"+target+"']");
    
    if (!result.success)
      throw new Error("Find id failed with "+result.errmsg);

    let id = "";
    if (result.response) {
      id = result.response.value;
      logger.info("id: {} (existing entry)", id);
    } else {
      const resource = "nsp-resource-pool:resource-pools/numeric-resource-pools="+pool+","+scope+"/obtain-value-from-pool";
      const input = {
        "owner": "restconf/data/ibn:ibn/intent=" + target + "," + intentTypeName,
        "confirmed": true,
        "all-or-nothing": true,
        "reference": target,
        "total-number-of-resources": 1
      };
      const result = this.#restconfNspPost(resource, {"input": input});
      
      if (!result.success)
        throw new Error("Obtain id failed with "+result.errmsg);

      id = result.response["nsp-resource-pool:output"]["num-consumed-resources"][0].value;
      logger.info("id: {} (new entry)", id );
    }

    const duration = Date.now()-startTS;
    logger.info("ResourceAdmin::obtainId(pool={}, scope={}, target={}) finished within {} ms", pool, scope, target, duration|0);

    return id;    
  }

  /**
    * Release number from Resource Admin
    *
    * @param {} pool numeric pool to be used
    * @param {} scope numeric pool to be used
    * @param {} target reference for reservation 
    * 
    **/
  
  static releaseId(pool, scope, target) {    
    const startTS = Date.now();
    logger.info("ResourceAdmin::releaseId(pool={}, scope={}, target={})", pool, scope, target);

    const resource = "nsp-resource-pool:resource-pools/numeric-resource-pools="+pool+","+scope+"/release-by-ref";
    const input = {"reference": target};
    
    const result = this.#restconfNspPost(resource, {"input": input});
    
    if (!result.success)
      logger.error("releaseId(" + target + ") failed with error:\n" + result.errmsg);

    const duration = Date.now()-startTS;
    logger.info("ResourceAdmin::releaseId(pool={}, scope={}, target={}) finished within {} ms", pool, scope, target, duration|0);
  }
}