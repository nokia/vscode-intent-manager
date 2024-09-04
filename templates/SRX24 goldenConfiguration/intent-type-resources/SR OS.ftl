<#setting number_format="computer">
{
    "SYSTEM": {
        "config": {
            "target": "nokia-conf:/configure/system",
            "operation": "merge",
            "value": {
                "nokia-conf:system": {
<#if site.contact??>
                    "contact": "${site.contact}",
</#if>
                    "location": "${site.location.name} (${site.location.country})",
                    "coordinates": "${site.location.gpsPosition}"
                }
            }
        },
        "health": {
          "nokia-state:/state/system": {
            "temperature-status": "ok"
          },
          "nokia-state:/state/system/grpc": {
            "oper-state": "up"
          }
        }
    },
  
    "COMMON QOS POLICIES": {
        "config": {
            "target": "nokia-conf:/configure/qos",
            "operation": "merge",
            "value": {
                "nokia-conf:qos": {
                    "sap-ingress": [{
                        "sap-ingress-policy-name": "10"
                    }],
                    "sap-egress": [{
                        "sap-egress-policy-name": "10"
                    }]
                }
            }
        }
    },  

    "ETH-CFM domain/level 7": {
        "config": {
            "target": "nokia-conf:/configure/eth-cfm",
            "operation": "replace",
            "value": {
                "nokia-conf:eth-cfm": {
                    "domain": [{
                        "md-admin-name": "level7",
                        "level": 7,
                        "format": "none",
                        "md-index": 7
                    }]
                }
            }
        }
    },
  
    "BASE ROUTER": {
        "config": {
            "target": "nokia-conf:/configure/router=Base",
            "operation": "merge",
            "value": {
                "nokia-conf:router": {
                    "router-name": "Base",
                    "autonomous-system": 65000,
                    "router-id": "10.${site.countryCode?string}.0.${site.nodeId?string}",
                                    
                    "isis": [{
                      "isis-instance": 0,
                      "admin-state": "enable",
                      "level-capability": "2",
                      "lsp-lifetime": 65535,
                      "system-id": "0000.${site.countryCode?string('0000')}.${site.nodeId?string('0000')}",
                      "traffic-engineering": true,
                      "area-address": ["${site.countryCode?string}.cafe.cafe.cafe"],
                      "interface": [{
                        "interface-name": "system",
                        "passive": true,
                        "level-capability": "2"
                      }],
                      "level": [{
                          "level-number": "2",
                          "wide-metrics-only": true
                      }]
                    }],
                  
                    "bgp": {
                        "admin-state": "enable",
<#if site.nodeId = 1>
                        "vpn-apply-export": true,
                        "vpn-apply-import": true,
                        "peer-ip-tracking": true,
                        "split-horizon": true,
</#if>

                        "rapid-withdrawal": true,
                        "rapid-update": {
                            "vpn-ipv4": true,
                            "vpn-ipv6": true,
                            "evpn": true
                        },
                        "group": [{
                            "group-name": "INTERNAL",
                            "peer-as": 65000,
                            "family": {
                                "vpn-ipv4": true,
                                "vpn-ipv6": true,
                                "evpn": true
                            },
<#if site.nodeId = 1>
                            "cluster": {
                                "cluster-id": "1.1.1.1"
                            },
</#if>                      
                            "local-as": {
                                "as-number": 65000
                            }
                        }]
                    },
          
                    "ospf": [{
                        "ospf-instance": 0,
                        "admin-state": "enable",
                        "advertise-router-capability": "area",
                        "traffic-engineering": true,
                        "loopfree-alternate": {
                            "remote-lfa": {}
                        },

                        "area": [{
                            "area-id": "0.0.0.0",
                            "interface": [
                                {
                                    "interface-name": "system",
                                    "node-sid": {
                                        "index": ${site.nodeId}
                                    }
                                }
                            ]
                        }]
                    }],
  
                    "mpls": {
                        "admin-state": "enable",
                        "path": [{
                            "path-name": "loose",
                            "admin-state": "enable"
                        }],
                        "lsp-template": [{
                          "template-name": "Full-Mesh",
                          "admin-state": "enable",
                          "type": "p2p-rsvp-mesh",
                          "default-path": "loose",
                          "path-computation-method": "local-cspf",
                          "fast-reroute": {
                              "frr-method": "facility"
                          }
                        }],
                        "auto-lsp": [{
                            "template-name": "Full-Mesh",
                            "policy": ["Accept-System-Addresses"]
                        }]          
                    },
  
                    "rsvp": {
                        "admin-state": "enable"
                    },

                    "twamp-light": {
                        "reflector": {
                            "admin-state": "enable",
                            "udp-port": 64364,
                            "prefix": [{
                                "ip-prefix": "0.0.0.0/0"
                            }]
                        }
                    }
                }
            }
        },
        "health": {
          "nokia-state:/state/router=Base/isis=0": {
            "isis=0/oper-state": {
              "path": "oper-state",
              "equals": "up"
            },
            "isis=0/l2-state": {
              "path": "l2-state",
              "equals": "on"
            }
          },
          "nokia-state:/state/router=Base/ldp": {
            "ipv4-oper-state": "up"            
          },
          "nokia-state:/state/router=Base/interface=system": {
            "oper-state": "up",
            "ipv4.oper-state": {
              "path": "ipv4.oper-state",
              "equals": "up"
            }
          }
        }
    },

    "Prefix List: System Addresses": {
        "config": {
            "target": "nokia-conf:/configure/policy-options/prefix-list=System-Addresses",
            "operation": "replace",
            "value": {
                "nokia-conf:prefix-list": {
                    "name": "System-Addresses",
                    "prefix": [
                        {
                            "ip-prefix": "10.${site.countryCode?string}.0.0/24",
                            "type": "range",
                            "start-length": 32,
                            "end-length": 32
                        }
                    ]
                }
            }
        }
    },
      
    "Policy Statement: Accept All System Addresses": {
        "config": {
            "target": "nokia-conf:/configure/policy-options/policy-statement=Accept-System-Addresses",
            "operation": "replace",
            "value": {
                "nokia-conf:policy-statement": {
                    "name": "Accept-System-Addresses",
                    "entry": [
                        {
                            "entry-id": 10,
                            "from": {
                                "prefix-list": ["System-Addresses"]
                            },
                            "action": {
                                "action-type": "accept"
                            }
                        }
                    ]
                }
            }
        }
    }
}