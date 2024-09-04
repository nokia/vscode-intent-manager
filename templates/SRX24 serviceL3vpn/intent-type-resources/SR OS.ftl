<#setting number_format="computer">
{
<#if site.ebgp??>
    "Export Policy": {
        "config": {
            "target": "nokia-conf:/configure/policy-options/policy-statement=export-all-${target}",
            "operation": "replace",
            "value": {
              "nokia-conf:policy-statement": {
                "name": "export-all-${target}",
                "entry": [
                    {
                        "entry-id": 10,
                        "from": {"protocol": {"name": ["direct"]}},
                        "to": {"protocol": {"name": ["bgp"]}},
                        "action": {"action-type": "accept"}
                    },
                    {
                        "entry-id": 20,
                        "from": {"protocol": {"name": ["bgp-vpn"]}},
                        "to": {"protocol": {"name": ["bgp"]}},
                        "action": {"action-type": "accept"}
                    }
                ]
              }
            }
        }
    },
    "Import Policy": {
        "config": {
            "target": "nokia-conf:/configure/policy-options/policy-statement=import-all-${target}",
            "operation": "replace",
            "value": {
              "nokia-conf:policy-statement": {
                "name": "import-all-${target}",
                "entry": [
                    {
                        "entry-id": 10,
                        "from": {"protocol": {"name": ["bgp"]}},
                        "action": {"action-type": "accept"}
                    }
                ]
              }
            }
        }
    },
</#if>
    "VPRN Site": {
        "config": {
            "target": "nokia-conf:/configure/service/vprn=${target?url('ISO-8859-1')}",
            "operation": "replace",
            "value": {
              "nokia-conf:vprn": {
                "service-name": "${target}",
                "service-id":   ${global.service\-id},
                "admin-state": "enable",
                "autonomous-system": 64500,
<#if global.description??>
                "description":  "${global.description}",
</#if>
                "customer": "1",
                "bgp-ipvpn": {
                  "mpls": {
                    "route-distinguisher": "65000:${global.service\-id}",
                    "vrf-target": {
                      "community": "target:65000:${global.service\-id}"
                    },
                    "auto-bind-tunnel": {
                      "resolution": "any"
                    },
                    "admin-state": "enable"          
                  }
                },
<#if site.ebgp??>
                "bgp": {
                   "admin-state": "enable",
                   "split-horizon": true,
                   "group": [
                       {
                           "group-name": "pe-ce",
                           "admin-state": "enable",
                           "next-hop-self": true,
                           "family": {
                               "ipv4": true
                           },
                           "local-as": {
                               "as-number": 64500
                           },
                           "import": {
                               "policy": ["import-all-${target}"]
                           },
                           "export": {
                               "policy": ["export-all-${target}"]
                           }
                       }
                   ],
                   "neighbor": [
<#list site.ebgp?values as bgp>                     
                       {
                           "ip-address": "${bgp.peer}",
                           "admin-state": "enable",
                           "group": "pe-ce",
                           "local-address": "${bgp.local}",
                           "peer-as": 64501
                       }<#sep>,</#sep>
</#list>
                   ]
               },
</#if>
                "interface": [
<#list site.interface?values as interface>              
                  {
                    "interface-name": "${interface.name}",
                    "admin-state": "enable",
                    "description": "owned by intent-manager",
                    "ip-mtu": 1500,
                    "ipv4": {
                      "primary": {
                        "address": "${interface.address}",
                        "prefix-length": ${interface.prefix\-length}
                      }
                    },
<#if interface.port\-id??>
                    "sap": [{
                      "sap-id": "${interface.port\-id}:${interface.vlan\-id}",
                      "admin-state": "enable",
                      "ingress": {
                        "qos": {
                          "sap-ingress": {
                            "policy-name": "10",
                            "overrides": {
                              "queue": [
                                {
                                  "queue-id": 1,
                                  "rate": {
                                    "pir": "${(interface.rate*1000)?c}"
                                  }
                                }
                              ]
                            }
                          }
                        }
                      }
                    }]
<#else>
                    "loopback": true
</#if>
                  }<#sep>,</#sep>
</#list>
                ]
              }
            }
        },
        "health": {
          "nokia-state:/state/service/vprn=${target?url('ISO-8859-1')}": {
            "oper-state": "up",
            "sap/oper-state": {
              "path": "$.interface[*].oper-state",
              "equals": "up"
            }
          }
        },
        "indicators": {
            "nokia-state:/state/service/vprn=${target?url('ISO-8859-1')}": {
                "transport": {
                    "path": "$.route-table.unicast.ipv4.route[*].nexthop[*].resolving-nexthop[*].nexthop-tunnel-type"
                },
                "state": {
                    "path": "$.oper-state"
                }
            }
        }      
    } 
}
