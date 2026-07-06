<#setting number_format="computer">
{
  "INTERFACE ${site.port\-id}": {
    "config": {
      "target": "Cisco-IOS-XR-um-interface-cfg:/interfaces/interface=${site.port\-id?url('ISO-8859-1')}",
      "operation": "replace",
      "value": {
            "Cisco-IOS-XR-um-interface-cfg:interface": {
                "interface-name": "${site.port\-id}",
<#if site.description??>
                "description": "${site.description}",
</#if>
<#if site.ip\-address??>
                "ipv4": {
                    "addresses": {
                        "address" : {
                            "address" : "${site.ip\-address}",
                            "netmask" : "255.255.255.254"
                        }
                    }
                },
</#if>
<#if site.admin\-state == "enable">
                "shutdown": {},
</#if>
                "mtu": 9000
            }
      }
    }
  }<#if site.ip\-address??>,
    
  "ISIS INTERFACE ${site.port\-id}": {
    "config": {
      "target": "Cisco-IOS-XR-um-router-isis-cfg:/router/isis/processes/process=isis/interfaces/interface=${site.port\-id?url('ISO-8859-1')}",
      "operation": "replace",
      "value": {
            "Cisco-IOS-XR-um-router-isis-cfg:interface": {
                "interface-name": "${site.port\-id}",
                "circuit-type": "level-2",
                "address-families": {
                    "address-family": [{
                        "af-name": "ipv4",
                        "saf-name": "unicast"
                    }]
                }
            }
      }
    }
  },
    
  "LDP INTERFACE ${site.port\-id}": {
    "config": {
      "target": "Cisco-IOS-XR-um-mpls-ldp-cfg:/mpls/ldp/interfaces/interface=${site.port\-id?url('ISO-8859-1')}",
      "operation": "replace",
      "value": {
            "Cisco-IOS-XR-um-mpls-ldp-cfg:interface": {
                "interface-name": "${site.port\-id}"
            }
      }
    }
  }
</#if>  
}
