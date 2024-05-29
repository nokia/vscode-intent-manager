<#setting number_format="computer">
{
    "[${site.ne\-name}] SYSTEM": {
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
  
    "[${site.ne\-name}] QOS": {
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

    "[${site.ne\-name}] ETH-CFM level 7": {
        "config": {
            "target": "nokia-conf:/configure/eth-cfm",
            "operation": "merge",
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
  
    "[${site.ne\-name}] BASE ROUTER": {
        "config": {
            "target": "nokia-conf:/configure/router=Base",
            "operation": "merge",
            "value": {
                "nokia-conf:router": {
                    "router-name": "Base",
                    "autonomous-system": 65000,
                    "router-id": "${site.routerId}",
                  
                    "interface": [{
                      "interface-name": "system",
                      "ipv4": {
                        "primary": {
                          "address": "${site.systemIp}",
                          "prefix-length": 32
                        }
                      }
                    }],
                  
                    "isis": [{
                      "isis-instance": 0,
                      "admin-state": "enable",
                      "level-capability": "1",
                      "lsp-lifetime": 65535,
                      "system-id": "${site.systemId}",
                      "traffic-engineering": true,
                      "area-address": ["${site.isisArea}"],
                      "interface": [{
                        "interface-name": "system",
                        "passive": true,
                        "level-capability": "1"
                      }],
                      "level": [{
                          "level-number": "1",
                          "wide-metrics-only": true
                      }]
                    }],
                  
                    "bgp": {
                        "admin-state": "enable",
<#if site.ne\-id = '10.10.10.1'>
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
<#if site.ne\-id = '10.10.10.1'>
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
                        "router-id": "${site.systemIp}",
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
                                        "index": ${site.nodeSID}
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
                        "auto-lsp": {
                            "template-name": "Full-Mesh",
                            "policy": ["Accept-System-Addresses"]
                        }                      
                    },
  
                    "rsvp": {
                        "admin-state": "enable"
                    },

                    "twamp-light": {
                        "reflector": {
                            "admin-state": "enable",
                            "udp-port": 64372,
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
            "isis/oper-state": {
              "path": "oper-state",
              "equals": "up"
            },
            "isis/l1-state": {
              "path": "l1-state",
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

    "[${site.ne\-name}] Prefix List: System Addresses": {
        "config": {
            "target": "nokia-conf:/configure/policy-options/prefix-list=System-Addresses",
            "operation": "replace",
            "value": {
                "nokia-conf:prefix-list": {
                    "name": "System-Addresses",
                    "prefix": [
                        {
                            "ip-prefix": "10.10.10.0/24",
                            "type": "range",
                            "start-length": 32,
                            "end-length": 32
                        }
                    ]
                }
            }
        }
    },
      
    "[${site.ne\-name}] Policy Statement: Accept All System Addresses": {
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
