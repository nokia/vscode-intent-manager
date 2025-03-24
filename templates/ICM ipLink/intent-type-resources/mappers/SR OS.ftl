<#setting number_format="computer">
<#assign ifname="${global.cid}_${site['ne-name']}_to_${site.peer['ne-name']}">
{
    "PORT ${site.port\-id}": {
        "config": {
            "target": "nokia-conf:/configure/port=${site.port\-id?url('ISO-8859-1')}",
            "operation": "replace",
            "value": {
                "nokia-conf:port": {
                    "port-id": "${site.port\-id}",
                    "admin-state": "${global.admin\-state}",
<#if global.description??>
                    "description": "${global.description}",
</#if>
                    "ethernet": {
                        "mode": "network",
                        "encap-type": "null",
                        "mtu": 9000,                  
                        "down-when-looped": {
                            "admin-state": "enable"
                        },
                        "lldp": {
                            "dest-mac": [
                                {
                                    "mac-type": "nearest-bridge",
                                    "notification": false,
                                    "receive": true,
                                    "transmit": true,
                                    "port-id-subtype": "tx-if-name",
                                    "tx-tlvs": {
                                        "port-desc": true,                                      
                                        "sys-name": true
                                    },
                                    "tx-mgmt-address": [
                                        {
                                            "mgmt-address-system-type": "system",
                                            "admin-state": "enable"
                                        }
                                    ]
                                }
                            ]
                        }
                    }
                }
            }
        },
        "health": {
          "nokia-state:/state/port=${site.port\-id?url('ISO-8859-1')}": {
            "oper-state": "up",
            "ethernet/lldp/dest-mac/remote-system/system-name": {
              "path": "$.ethernet.lldp.dest-mac[?(@['mac-type']=='nearest-bridge')].remote-system[*].system-name",
              "equals": "${site.peer.ne\-name}"
            },
            "ethernet/lldp/dest-mac/remote-system/remote-port-id": {
              "path": "$.ethernet.lldp.dest-mac[?(@['mac-type']=='nearest-bridge')].remote-system[*].remote-port-id",
              "equals": "${site.peer.port\-id}"
            }              
          }
        }
    },
    "IP INTERFACE ${ifname}": {
        "config": {
            "target": "nokia-conf:/configure/router=Base/interface=${ifname?url('ISO-8859-1')}",
            "operation": "replace",
            "value": {
                "nokia-conf:interface": 
                {
                    "interface-name": "${ifname}",
                    "port": "${site.port\-id}",
                    "ipv4": {
                      "primary": {
                        "address": "${site.ip\-address}",
                        "prefix-length": 31
                      } 
                    },
                    "admin-state": "${global.admin\-state}"                  
                }
            }
        },
        "health": {
            "nokia-state:/state/router=Base/interface=${ifname?url('ISO-8859-1')}": {
              "oper-state": "up"
            }
        }
    },
    "ISIS INTERFACE ${ifname}": {
        "config": {
            "target": "nokia-conf:/configure/router=Base/isis=0/interface=${ifname?url('ISO-8859-1')}",
            "operation": "replace",
            "value": {
                "nokia-conf:interface": {
                    "interface-name": "${ifname}",
                    "interface-type": "point-to-point",
                    "hello-padding": "none",
                    "level-capability": "2",
                    "admin-state": "${global.admin\-state}"
                }                
            }
        },
        "health": {
            "nokia-state:/state/router=Base/isis=0/interface=${ifname?url('ISO-8859-1')}": {
              "oper-state": "up",
              "adjacency/oper-state": {
                "path": "$.adjacency[*].oper-state",
                "equals": "up"
              },
              "adjacency/neighbor/ipv4": {
                "path": "$.adjacency[*].neighbor.ipv4",
                "equals": "${site.peer.ip\-address}"
              }                
            }
        }
    },
    "LDP INTERFACE ${ifname}": {
        "config": {
            "target": "nokia-conf:/configure/router=Base/ldp/interface-parameters/interface=${ifname?url('ISO-8859-1')}",
            "operation": "replace",
            "value": {
                "nokia-conf:interface": {
                    "ip-int-name": "${ifname}",
                    "ipv4": {
                        "admin-state": "${global.admin\-state}"
                    }
                }    
            }
        },
        "health": {
            "nokia-state:/state/router=Base/ldp/interface-parameters/interface=${ifname?url('ISO-8859-1')}": {
              "oper-state": "up"
            }
        }
    },
    "TWAMP REFLECTOR": {
      "config": {
        "target": "nokia-conf:/configure/router=Base/twamp-light/reflector",
        "operation": "replace",
        "value": {
          "nokia-conf:reflector": {
              "admin-state": "enable",
              "udp-port": 64364,
              "type": "twamp-light",
              "prefix": [
                {
                    "ip-prefix": "0.0.0.0\/0",
                    "description": "Prefix subnet 0.0.0.0\/0"
                }
              ]
          }
        }
      }
    },
    "TWAMP SESSION ${global.cid}": {
      "config": {
        "target": "nokia-conf:/configure/oam-pm/session=${global.cid?url('ISO-8859-1')}",
        "operation": "replace",
        "value": {
          "nokia-conf:session": {
            "session-name": "${global.cid}",
            "session-type": "proactive",
            "ip": {
                "destination": "${site.peer.ip\-address}",
                "destination-udp-port": 64364,
                "router-instance": "Base",
                "source": "${site.ip\-address}",
                "twamp-light": {
                    "admin-state": "${global.admin\-state}",
                    "test-id": "${global.testId}",
                    "interval": 100,
                    "record-stats": "delay-and-loss"                      
                }
            },
            "measurement-interval": [{
                "duration": "5-mins",
                "clock-offset": 0,
                "intervals-stored": 1
            }]
          }
        }
      },
      "indicators": {
        "/nokia-state:state/oam-pm/session=${global.cid?url('ISO-8859-1')}/ip/twamp-light/statistics/delay/measurement-interval=5-mins": {
          "latency": {
            "path": "$.number[0].bin-type[?(@['bin-metric']=='fd')].round-trip.average"
          },
          "jitter": {
            "path": "$.number[0].bin-type[?(@['bin-metric']=='ifdv')].round-trip.average"
          }            
        },
        "/nokia-state:state/oam-pm/session=${global.cid?url('ISO-8859-1')}/ip/twamp-light/statistics/loss/measurement-interval=5-mins": {
          "loss": {
            "path": "$.number[0].forward.average-frame-loss-ratio"
          }
        },
        "nokia-state:/state/port=${site.port\-id?url('ISO-8859-1')}": {
          "speed": {
            "path": "$.type"
          },
          "utilization": {
            "path": "$.ethernet.statistics.out-utilization"
          }
        },
        "nokia-state:/state/router=Base/isis=0/interface=${ifname?url('ISO-8859-1')}": {
          "state": {
            "path": "$.oper-state"
          }
        }
      }
    }
}