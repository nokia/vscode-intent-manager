/******************************************************************************
 * Helper functions to call other NSP services.
 * Packaged as static methods of class NSP.
 * 
 * (c) 2025 by Nokia
 ******************************************************************************/

const AuditReport = Java.type("com.nokia.fnms.controller.ibn.intenttype.spi.AuditReport");
const MisAlignedObject = Java.type("com.nokia.fnms.controller.ibn.intenttype.spi.MisAlignedObject");
const MisAlignedAttribute = Java.type("com.nokia.fnms.controller.ibn.intenttype.spi.MisAlignedAttribute");

export class NSP
{
  /**
   * Determine NSP version to perform release compatibility check.
   * Throws Error(), if NSP release is match the criteria (too old).
   *
   * @param {number} major Minimum expected major NSP Release
   * @param {number} minor Minimum expected minor NSP Release
   * 
   * @throws Error
   */

  static checkRelease(major, minor) {
    const startTS = Date.now();
    logger.debug(`NSP::checkRelease(${major}, ${minor})`);

    const url = "https://rest-gateway/internal/shared-app-banner-utils/rest/api/v1/appBannerUtils/release-version";

    const managerInfo = mds.getManagerByName("NSP");
    if (managerInfo.getConnectivityState().toString() === "CONNECTED") {
      restClient.setIp(managerInfo.getIp());
      restClient.setPort(managerInfo.getPort());
      restClient.setProtocol(managerInfo.getProtocol().toString());

      restClient.get(url, "application/json", (exception, httpStatus, response) => {
        const duration = Date.now()-startTS;
        logger.info("GET {} finished within {} ms", url, duration|0);

        if (exception) {
          logger.error("Exception {} occured.", exception);
          throw new Error(`Couldn't determine NSP version. Exception ${exception} occured.`);
        }

        if (httpStatus != 200) {
            logger.warn("NSP response: {} {}", httpStatus, response);
            throw new Error(`Couldn't determine NSP version. HTTP STATUS: ${httpStatus}`);
        }

        logger.info("NSP response: {} {}", httpStatus, response);

        const json = JSON.parse(response);
        const version = json.response.data.nspOSVersion.match(/\d+\.\d+(?=\.\d+)/)[0];

        const parts = version.split('.').map(v => parseInt(v));

        if (parts[0] > major)
          logger.info("Release check successful");
        else if ((parts[0] === major) && (parts[1] >= minor))
          logger.info("Release check successful");
        else if ((parts[0] === major) && (parts[1] === 0))
          logger.warn("ENGINEERING LOAD");
        else {
          const errmsg = `Incompatible NSP Release ${version} (expected: ${major}.${minor})`;
          logger.error(errmsg);
          throw new Error(errmsg);
        }
      });
    } else {
      logger.error("NSP mediator is diconnected.");
      throw new Error(`Couldn't determine NSP version. NSP mediator is diconnected.`);
    }

    const duration = Date.now()-startTS;
    logger.debug("NSP::checkRelease() finished within {} ms", duration|0);
	}

  /**
   * Get list-keys from YANG model for MDC-managed nodes
   *
   * @param {string} neId Device identifier
   * @param {string} listPath Device path
   * @returns listKeys[]
   */

  static mdcListKeys(neId, listPath) {
    const startTS = Date.now();

     // remove instance identifiers from path:
     const path = listPath.split('?')[0].replace(/=[^/]+/g, '');

    logger.debug("NSP::mdcListKeys({}, {})", neId, path);

    let result = {};
    const managerInfo = mds.getManagerByName("NSP");
    if (managerInfo.getConnectivityState().toString() === "CONNECTED") {
      const url = `https://restconf-gateway/restconf/meta/api/v1/model/schema/${neId}/${path}`;

      restClient.setIp(managerInfo.getIp());
      restClient.setPort(managerInfo.getPort());
      restClient.setProtocol(managerInfo.getProtocol().toString());

      restClient.get(url, "application/json", (exception, httpStatus, response) => {
        if (exception)
          result = { success: false, errmsg: "Couldn't connect to mediator. Exception "+exception+" occured." };
        else if (httpStatus === 200)
          result = { success: true, response: JSON.parse(response) };
        else if (httpStatus === 201)
          result = { success: false, errmsg: "Returned httpStatus(201): No response" };
        else
          result = { success: false, errmsg: response };
      });
    } else
      result = { success: false, errmsg: "NSP mediator is disconnected." };

    const duration = Date.now()-startTS;
    logger.debug("NSP::mdcListKeys({}, {}) finished within {} ms", neId, path, duration|0);
  
    if (result.success) {
      // return result.response.keys;
      return result.response.attributes.filter(entry => entry.isKey).map(entry => entry.name);
    } else {
      logger.error("mdcListKeys() failed with {}", result.errmsg);
      return [];
    }
  }

  /**
   * Retrieve device configuration/state using device model (RESTCONF GET / MDC)
   *
   * @param {string} neId Device identifier
   * @param {string} path Device path
   * @returns success {boolean} and respone {Object} or errmsg {string}
   */

  static mdcGET(neId, path) {
    const startTS = Date.now();
    logger.debug("NSP::mdcGET({}, {})", neId, path);

    let result = {};
    const managerInfo = mds.getAllManagersWithDevice(neId).get(0);
    if (managerInfo.getConnectivityState().toString() === "CONNECTED") {
      const url = "/restconf/data/network-device-mgr:network-devices/network-device="+neId+"/root/"+path;

      restClient.setIp(managerInfo.getIp());
      restClient.setPort(managerInfo.getPort());
      restClient.setProtocol(managerInfo.getProtocol().toString());

      restClient.get(url, "application/json", (exception, httpStatus, response) => {
        const duration = Date.now()-startTS;
        logger.info("GET {} finished within {} ms", url, duration|0);

        if (exception) {
          logger.error("Exception {} occured.", exception);
          result = { success: false, errmsg: "Couldn't connect to mediator. Exception "+exception+" occured." };
        }
        else if (httpStatus >= 400) {
          // Either client error (4xx) or server error (5xx)

          // Note:
          // 404 (resource not found) is considered a normal case, while it might happen during
          // audits when the resource was not yet created. To avoid confusing developers getting
          // in panic when reading the logs, status-code 404 using log-level info instead of warn

          if (httpStatus === 404) {
            logger.info("NSP response: {} {}", httpStatus, response);
          }
          else
            logger.warn("NSP response: {} {}", httpStatus, response);

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

          let errmsg = "HTTP ERROR "+httpStatus;
          switch (httpStatus) {
            case 400:
              // invalid request (should not happen)
              errmsg = "Bad Request"; break;
            case 401:
              // access-control related (should not happen)
              errmsg = "Unauthorized (access-denied)";
              break;
            case 403:
              // access-control related (should not happen)
              errmsg = "Forbidden";
              break;
            case 404:
              // resource does not exist
              errmsg = "Not Found";
              break;
            case 405:
              // operation resource (should not happen)
              errmsg = "Method Not Allowed";
              break;
          }

          result = { success: false, errmsg: errmsg };
        }
        else {
          // Should be 200 OK
          if (response.length > 2048)
            logger.info("NSP response: {}, received {} bytes", httpStatus, response.length);
          else
            logger.info("NSP response: {} {}", httpStatus, response);
          result = { success: true, response: JSON.parse(response) };
        }
      });
    } else {
      logger.error("Mediator for {} is disconnected.", neId);
      result = { success: false, errmsg: "Mediator for "+neId+" is disconnected." };
    }

    const duration = Date.now()-startTS;
    logger.debug("NSP::mdcGET() finished within {} ms", duration|0);

    return result;
  }

  /**
   * Edit device configuration using device model (RESTCONF PATCH / MDC)
   *
   * @param {string} neId Device identifier
   * @param {string} body rfc8072 YANG PATCH compliant JSON string
   * @returns success {boolean}, response {Object}, errmsg {string}
   */

  static mdcPATCH(neId, body) {
    const startTS = Date.now();
    logger.debug("NSP::mdcPATCH({})", neId);

    let result = {};
    const managerInfo = mds.getAllManagersWithDevice(neId).get(0);
    if (managerInfo.getConnectivityState().toString() === "CONNECTED") {
      const url = "/restconf/data/network-device-mgr:network-devices/network-device="+neId+"/root/";

      restClient.setIp(managerInfo.getIp());
      restClient.setPort(managerInfo.getPort());
      restClient.setProtocol(managerInfo.getProtocol().toString());

      restClient.patch(url, "application/yang-patch+json", body, "application/yang-data+json", (exception, httpStatus, response) => {
        const duration = Date.now()-startTS;
        logger.info("PATCH {} {} finished within {} ms", url, body, duration|0);

        if (exception) {
          logger.error("Exception {} occured.", exception);
          result = { success: false, errmsg: "Couldn't connect to mediator. Exception "+exception+" occured." };
        }
        else if (httpStatus >= 400) {
          // Either client error (4xx) or server error (5xx)
          logger.warn("NSP response: {} {}", httpStatus, response);

          let errmsg="";
          if ((/<html/i).test(response)) {
            // Extract error details from HTML response:
            const errMatch = response.match(/<body[^>]*>(.*)<\/body>/i);
            if (errMatch)
              errmsg = errMatch[1]; // extracted errmsg from html body
            else
              errmsg = "HTTP ERROR "+httpStatus;
          } else {
            // Extract error details from JSON response:
            //
            // Error details returned in accordance to RFC8072 ch2.3 (2 options: global errors OR edit errors )
            //   {"ietf-yang-patch:yang-patch-status":{"ietf-restconf:errors":{"error":[{ error details }]}}}
            //   {"ietf-yang-patch:yang-patch-status":{"edit-status":{"edit":[{"ietf-restconf:errors":{"error":[{ error details }]}}]}}}
            //
            // Error fields:
            //   error-type       enumeration
            //   error-tag        string
            //   error-app-tag?   string
            //   error-path?      instance-identifier
            //   error-message?   string
            //   error-info?      anydata

            const errorObject = JSON.parse(response);
            if ("ietf-yang-patch:yang-patch-status" in errorObject) {
              const yangPatchStatus = errorObject["ietf-yang-patch:yang-patch-status"];

              // Check for RFC8072 YANG-PATCH ERRORS: global-errors
              if ("ietf-restconf:errors" in yangPatchStatus) {
                const errList = yangPatchStatus["ietf-restconf:errors"].error;
                errmsg = errList.map(error => error["error-message"]).join(", ");
              }

              // Check for RFC8072 YANG-PATCH ERRORS: edit-errors
              if ("edit-status" in yangPatchStatus) {
                yangPatchStatus["edit-status"].edit.forEach( edit => {
                  const errList = edit["ietf-restconf:errors"].error;
                  errmsg += errList.map(error => {
                    if (error["error-path"])
                      return `[path: ${error["error-path"]}] ${error["error-message"]}`;
                    else
                      return error["error-message"];
                  }).join(", ")+" ";
                });
              }
            }
          }
          result = { success: false, errmsg: errmsg.trim() };
        } else {
          // 2xx - Success
          logger.info("NSP response: {} {}", httpStatus, response);
          result = { success: true, response: JSON.parse(response) };
        }
      });
    } else {
      logger.error("Mediator for {} is disconnected.", neId);
      result = { success: false, errmsg: "Mediator for "+neId+" is disconnected." };
    }

    const duration = Date.now()-startTS;
    logger.debug("NSP::mdcPATCH() finished within {} ms", duration|0);

    return result;
  }

  /**
   * Executes nsp-inventory:find operation
   *
   * Access-control will be applied using the user-token, if provided.
   * If no user-token is provided or available, call is routed via the
   * NSP mediator (using system-token).
   *
   * RESTCONF API operation supports the following options:
   *   xpath-filter {string}  Object selector
   *   include-meta {boolean} Include/exclude meta-info in response
   *   sort-by {string} Output order
   *   offset {number}  Pagination start
   *   limit  {number}  Max number of objects
   *   fields {string}  Output selector
   *   depth  {number}  Max sub-tree depth
   *
   * @param {Object} options Search criteria
   * @param {boolean} flatten Flatten result
   * @param {string} authToken Access-token of the WebUI user, starting with "Bearer "
   * @returns success {boolean}, errmsg {string}, response {object[]}
   *
   */

  static inventoryFind(options, flatten=false, authToken=undefined) {
    const startTS = Date.now();

    let url;
    if (authToken) {
      logger.debug("NSP::inventoryFind({}) with authToken {}", options["xpath-filter"], authToken.substring(7));

      restClient.setIp("restconf-gateway");
      restClient.setPort(443);
      restClient.setProtocol("https");
      restClient.setBearerToken(authToken.substring(7)); // remove first 7 chars from token, aka prefix "Bearer "

      url = "/restconf/operations/nsp-inventory:find";
    } else {
      logger.debug("NSP::inventoryFind({})", options["xpath-filter"]);

      const managerInfo = mds.getManagerByName("NSP");
      if (managerInfo.getConnectivityState().toString() === "CONNECTED") {
        restClient.setIp(managerInfo.getIp());
        restClient.setPort(managerInfo.getPort());
        restClient.setProtocol(managerInfo.getProtocol().toString());
      } else {
        const duration = Date.now()-startTS;
        logger.debug("NSP::inventoryFind({}) finished within {} ms", options["xpath-filter"], duration|0);
        return { success: false, response: [], errmsg: "NSP mediator is disconnected." };
      }

      url = "https://restconf-gateway/restconf/operations/nsp-inventory:find";
    }

    let result = {};
    options["include-meta"] = false;
    const body = JSON.stringify({"input": options});

    restClient.post(url, "application/json", body, "application/json", (exception, httpStatus, response) => {
      const duration = Date.now()-startTS;
      logger.info("POST {} {} finished within {} ms", url, options, duration|0);

      if (exception) {
        logger.error("Exception {} occured.", exception);
        result = { success: false, response: [], errmsg: "Exception "+exception+" occured."};
      }
      else if (httpStatus >= 400) {
        // Either client error (4xx) or server error (5xx)
        let errmsg = "HTTP ERROR "+httpStatus;
        logger.warn("NSP response: {} {}", errmsg, response);

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
          if ("ietf-restconf:errors" in errorObject)
            errmsg = errorObject["ietf-restconf:errors"].error.map(error => error["error-message"]).join(", ");
        }

        result = { success: false, response: [], errmsg: errmsg};
      }
      else {
        logger.debug("NSP response: {} {}", httpStatus, response);

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
              if (key !== "@") {
                if (typeof obj[key] === "object")
                  flattenRecursive(obj[key], flattenedObject);
                else
                  flattenedObject[key] = obj[key];
              }
            }
            return flattenedObject;
          }

          result = { success: true, response: output.data.map(object => flattenRecursive(object)) };
        } else
          result = { success: true, response: output.data };
      }
    });

    const duration = Date.now()-startTS;
    logger.debug("NSP::inventoryFind({}) finished within {} ms", options["xpath-filter"], duration|0);

    return result;
  }
  
  /**
   * Remove RESTCONF resources in NSP
   *
   * @param {string} resource model-path string of the resource
   *
   * @returns success {boolean} and errmsg {string}
   */

  static restconfRemove(resource) {
    const startTS = Date.now();
    logger.debug("NSP::restconfRemove({})", resource);

    let result = {};
    const managerInfo = mds.getManagerByName("NSP");
    if (managerInfo.getConnectivityState().toString() === "CONNECTED") {
      const url = "https://restconf-gateway/restconf/data/"+resource;

      restClient.setIp(managerInfo.getIp());
      restClient.setPort(managerInfo.getPort());
      restClient.setProtocol(managerInfo.getProtocol().toString());

      restClient.delete(url, "application/json", (exception, httpStatus, response) => {
        const duration = Date.now()-startTS;
        logger.debug("DELETE {} finished within {} ms", url, duration|0);

        if (exception) {
          logger.error("Exception {} occured.", exception);
          result = { success: false, response: {}, errmsg: "Exception "+exception+" occured."};
        }
        else if ([201, 404].includes(httpStatus)) {
          // 201 NO RESPONSE        (considered normal case/success)
          // 404 RESOURCE NOT FOUND (considered normal case/success)

          logger.debug("NSP response: {}", httpStatus);
          result = { success: true };
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
            if ("ietf-restconf:errors" in errorObject)
              errmsg = errorObject["ietf-restconf:errors"].error.map(error => error["error-message"]).join(", ");
          }

          result = { success: false, response: {}, errmsg: errmsg};
        } else {
          logger.debug("NSP response: {} {}", httpStatus, response);
          result = { success: true, response: JSON.parse(response) };
        }
      });
    } else
      result = { success: false, errmsg: "NSP mediator is disconnected." };

    const duration = Date.now()-startTS;
    logger.debug("NSP::restconfRemove() finished within {} ms", duration|0);

    return result;
  }

  /**
   * Executes NSP RESTCONF POST
   * 
   * Used for calling actions and creation of resources.
   * 
   * @param {string} resource model-path string of the parent resource
   * @param {object} payload input variables (action specific) or resource details
   * 
   * @returns success {boolean} and errmsg {string}
   */

  static restconfPOST(resource, payload) {
    const startTS = Date.now();
    logger.debug("NSP::restconfPOST({})", resource);

    let result = {};
    const managerInfo = mds.getManagerByName("NSP");
    if (managerInfo.getConnectivityState().toString() === "CONNECTED") {
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
            if ("ietf-restconf:errors" in errorObject)
              errmsg = errorObject["ietf-restconf:errors"].error.map(error => error["error-message"]).join(", ");
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
    logger.debug("NSP::restconfPOST() finished within {} ms", duration|0);

    return result;
  }

  /**
   * Retrieve device details from NSP model
   *
   * @param {string} neId device
   */

  static getDeviceDetails(neId) {
    const options = {
      "xpath-filter": `/nsp-equipment:network/network-element[ne-id='${neId}']`,
      "depth": 3,
      "include-meta": false
    };

    const result = NSP.inventoryFind(options, true);

    if (!result.success)
      return {};

    if (result.response.length === 0)
      return {};

    return result.response[0];
  }

  /**
 * Executes framework action, implemented by the mediator
 *
 * @param {string} action mediator framework action to be called
 * @param {Object} input input variables (action specific)
 * @returns success {boolean}, respone {Object}, errmsg {string}
 */

  static fwkAction(action, input) {
    const startTS = Date.now();
    logger.debug("NSP::fwkAction({})", action);

    let result = {};
    const managerInfo = mds.getManagerByName("NSP");
    if (managerInfo.getConnectivityState().toString() === "CONNECTED") {
      restClient.setIp(managerInfo.getIp());
      restClient.setPort(managerInfo.getPort());
      restClient.setProtocol(managerInfo.getProtocol().toString());

      restClient.post(action, "application/json", JSON.stringify(input), "application/json", (exception, httpStatus, response) => {
        const duration = Date.now()-startTS;
        logger.info("POST {} {} finished within {} ms", action, input, duration|0);

        if (exception) {
          logger.error("Exception {} occured.", exception);
          result = { success: false, errmsg: "Couldn't connect to mediator. Exception "+exception+" occured." };
        }
        else if (httpStatus >= 400) {
          logger.warn("NSP response: {} {}", httpStatus, response);
          result = { success: false, errmsg: "HTTP ERROR "+httpStatus+" details: "+response };
        }
        else {
          logger.debug("NSP response: {} {}", httpStatus, response);
          result = { success: true, response: JSON.parse(response) };
        }
      });
    } else {
      logger.error("NSP mediator is disconnected.");
      result = { success: false, errmsg: "NSP mediator is disconnected." };
    }

    const duration = Date.now()-startTS;
    logger.debug("NSP::fwkAction() finished within {} ms", duration|0);

    return result;
  }

  /**
   * Wrapper for /resolve-synchronize implemented in mediator (since nsp23.11).
   * Merges desired config with actual config to keep approved misalignments untouched.
   *
   * @param {string} intentType Intent-type name
   * @param {string} target     Intent target
   * @param {string} neId       Device identifier
   * @param {string} rootXPath  Root XPATH of configuration
   * @param {Object} config     Desired configuration
   *
   * @throws {Error} /resolve-synchronize failed
   */

  static resolveSynchronize(intentType, target, neId, rootXPath, desiredConfig) {
    const startTS = Date.now();
    logger.debug("NSP::resolveSynchronize({}, {})", neId, rootXPath);

    // The framework-action /resolve-synchronize expects the intent-configuration to
    // contain just the naked payload of the target list-entry. Therefore we need to
    // remove the outer context to ensure functionality.
    //
    // Example: {"nokia-conf:port": [{"port-id": "1/1/1", ...}]} becomes {"port-id": "1/1/1", ...}

    let desiredObjectType = Object.keys(desiredConfig)[0];
    let isListEntry = false;

    let iCfg = Object.values(desiredConfig)[0];
    if (Array.isArray(iCfg)) {
      if (iCfg.length > 0) iCfg = iCfg[0]; else iCfg = {};
      isListEntry = true;
    }

    const unresolvedConfig = {
        "intent-type": intentType,
        "target": encodeURIComponent(target),
        "device-name": neId,
        "root-xpath": rootXPath,
        "intent-configuration": iCfg
    };

    const resolveResponse = NSP.fwkAction("/resolve-synchronize", unresolvedConfig);
    if (!resolveResponse.success)
      throw new Error("Resolve Synchronize failed with " + resolveResponse.errmsg);

    // Adding back the outer wrapper to make the MDC request again
    // RESTCONF YANG-PATCH compliant:

    let resolvedConfig = {};
    if (isListEntry)
      resolvedConfig[desiredObjectType] = [resolveResponse.response];
    else
      resolvedConfig[desiredObjectType] = resolveResponse.response;

    const duration = Date.now()-startTS;
    logger.debug("NSP::resolveSynchronize() finished within {} ms", duration|0);

    return resolvedConfig;
  }

  /**
   * Wrapper for /resolve-audit implemented in mediator (since nsp23.11).
   * Removes approved attributes/objects from audit-report.
   *
   * @param {string} target Intent target
   * @param {AuditReport} auditReport Audit report before applying approvals
   *
   * @throws {Error} /resolve-audit failed
   */

  static resolveAudit(auditReport) {
    const startTS = Date.now();
    logger.debug("NSP::resolveAudit()");

    // Convert audit report to JSON
    const auditReportJson = {
      "target": encodeURIComponent(auditReport.getTarget()),
      "intent-type": auditReport.getIntentType()
    };

    if (auditReport.getMisAlignedAttributes()) {
        auditReportJson["misaligned-attribute"] = [];
        auditReport.getMisAlignedAttributes().forEach(misAlignedAttribute => {
            const misAlignedAttributeJson = {
                "name": misAlignedAttribute.getName(),
                "device-name": misAlignedAttribute.getDeviceName(),
                "expected-value": misAlignedAttribute.getExpectedValue(),
                "actual-value": misAlignedAttribute.getActualValue(),
            };
            auditReportJson["misaligned-attribute"].push(misAlignedAttributeJson);
        });
    }

    if (auditReport.getMisAlignedObjects()) {
        auditReportJson["misaligned-object"] = [];
        auditReport.getMisAlignedObjects().forEach(misAlignedObject => {
            const misAlignedObjectJson = {
                "object-id": misAlignedObject.getObjectId(),
                "device-name": misAlignedObject.getDeviceName(),
                "is-undesired": misAlignedObject.isUndesired(),
                "is-configured": misAlignedObject.isConfigured()
            };
            auditReportJson["misaligned-object"].push(misAlignedObjectJson);
        });
    }

    // Call the mediator to resolve audit report
    let resolveResponse = NSP.fwkAction("/resolve-audit", auditReportJson);
    if (!resolveResponse.success)
      throw new Error("/resolve-audit failed with " + resolveResponse.errmsg);

    const resolvedAuditReportJson = resolveResponse.response;
    logger.info("resolved audit report:\n{}", JSON.stringify(resolvedAuditReportJson, null, "  "));

    // Create a new audit report to send back
    const resolvedAuditReport = new AuditReport();
    resolvedAuditReportJson["misaligned-attribute"].forEach(entry =>
      resolvedAuditReport.addMisAlignedAttribute(new MisAlignedAttribute(entry.name, entry["expected-value"], entry["actual-value"], entry["device-name"]))
    );
    resolvedAuditReportJson["misaligned-object"].forEach(entry =>
      resolvedAuditReport.addMisAlignedObject(new MisAlignedObject(entry["object-id"], entry["is-configured"], entry["device-name"], entry["is-undesired"]))
    );

    const duration = Date.now()-startTS;
    logger.debug("NSP::resolveAudit() finished within {} ms", duration|0);

    return resolvedAuditReport;
  }
}