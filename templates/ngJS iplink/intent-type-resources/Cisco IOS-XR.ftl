<#setting number_format="computer">
{
  "[${site.ne\-name}] INTERFACE ${site.port\-id}": {
    "config": {
      "target": "Cisco-IOS-XR-um-interface-cfg:/interfaces/interface=${site.port\-id?url('ISO-8859-1')}",
      "operation": "replace",
      "value": {
            "Cisco-IOS-XR-um-interface-cfg:interface": {
                "interface-name": "${site.port\-id}",
                "shutdown": {},
                "mtu": 9000,
<#if global.description??>
                "description": "iplink: ${global.description}",
</#if>
                "ipv4": {
                    "addresses": {
                        "address" : {
                            "address" : "${site.addr}",
                            "netmask" : "255.255.255.254"
                        }
                    }
                }
            }
      },
      "ignoreChildren": []
    },
    "health": {}
  },
    
  "[${site.ne\-name}] ISIS INTERFACE ${site.port\-id}": {
    "config": {
      "target": "Cisco-IOS-XR-um-router-isis-cfg:/router/isis/processes/process=isis/interfaces/interface=${site.port\-id?url('ISO-8859-1')}",
      "operation": "replace",
      "value": {
            "Cisco-IOS-XR-um-router-isis-cfg:interface": {
                "interface-name": "${site.port\-id}",
                "circuit-type": "level-1",
                "address-families": {
                    "address-family": [{
                        "af-name": "ipv4",
                        "saf-name": "unicast"
                    }]
                }
            }
      },
      "ignoreChildren": []
    },
    "health": {}
  },
    
  "[${site.ne\-name}] LDP INTERFACE ${site.port\-id}": {
    "config": {
      "target": "Cisco-IOS-XR-um-mpls-ldp-cfg:/mpls/ldp/interfaces/interface=${site.port\-id?url('ISO-8859-1')}",
      "operation": "replace",
      "value": {
            "Cisco-IOS-XR-um-mpls-ldp-cfg:interface": {
                "interface-name": "${site.port\-id}"
            }
      },
      "ignoreChildren": []
    },
    "health": {}
  }  
}
