<#setting number_format="computer">
{
    "EPIPE Site": {
        "config": {
            "target": "nokia-conf:/configure/service/epipe=${target?url('ISO-8859-1')}",
            "operation": "replace",
            "value": {
                "nokia-conf:epipe": {
                  "service-id":   ${global.service\-id},
                  "service-name": "${target}",
                  "description":  "${global.description}",
                  "customer":     "1",
                  "admin-state":  "${global.adminState}",
                  "service-mtu":  1500,
                  "bgp": [{
                    "bgp-instance": 1
                  }],
                  "bgp-evpn": {
                    "remote-attachment-circuit": [{
                      "eth-tag": ${site.peer.id},
                      "name": "${site.peer.name}"
                    }],
                    "local-attachment-circuit": [{
                      "eth-tag": ${site.id},
                      "name": "${site.name}"
                    }],
                    "evi": ${global.service\-id},
                    "mpls": [{
                      "bgp-instance": 1,
                      "admin-state": "enable",
                      "auto-bind-tunnel": {
                        "resolution": "any"
                      }
                    }]
                  },
                  "sap": [{
                    "sap-id": "${site.port\-id}:${site.vlan\-id}",
<#if global.enableOAM>
                    "eth-cfm": {
                        "mep": [{
                            "md-admin-name": "level7",
                            "ma-admin-name": "${target}",
                            "mep-id": ${site.id},
                            "admin-state": "enable",
                            "direction": "up",
                            "ccm": true
                         }]
                     },
</#if>
                    "admin-state": "${global.adminState}"                          
                  }]
                }
            },
            "ignoreChildren": []
        },
        "health": {
          "nokia-state:/state/service/epipe=${target?url('ISO-8859-1')}": {
            "oper-state": "up",
            "sap/oper-state": {
              "path": "$.sap[*].oper-state",
              "equals": "up"
            }
          }
        },
        "indicators": {
            "nokia-state:/state/service/epipe=${target?url('ISO-8859-1')}": {
                "transport": {
                    "path": "$.bgp-evpn.mpls[*].destinations.non-ethernet-segment-destination[*].tunnel-id[*].transport-type"
                },
                "state": {
                    "path": "$.sap[*].oper-state"
                }
            }
        }
<#if global.enableOAM>
    },
    "Y.1731 MEG": {
        "config": {
            "target": "nokia-conf:/configure/eth-cfm/domain=level7/association=${target?url('ISO-8859-1')}",
            "operation": "replace",
            "value": {
                "nokia-conf:association": {
                    "ma-admin-name": "${target}",
                    "icc-based": "${target?right_pad(13)}",
                    "ma-index": ${global.service\-id},
                    "ccm-interval": "10s",
                    "auto-mep-discovery": true,
                    "bridge-identifier": [{
                        "bridge-name": "${target}"
                    }]
                }
            }
        }
    },
    "OAM-PM TEST": {
        "config": {
            "target": "nokia-conf:/configure/oam-pm/session=${target?url('ISO-8859-1')}",
            "operation": "replace",
            "value": {
                "nokia-conf:session": {
                    "session-name": "${target}",
                    "session-type": "proactive",
                    "ethernet": {
                        "remote-mep": ${site.peer.id},
                        "source": {
                            "mep": ${site.id},
                            "md-admin-name": "level7",
                            "ma-admin-name": "${target}"
                        },
                        "dmm": {
                            "admin-state": "enable",
                            "test-id": ${global.service\-id},
                            "interval": 1000
                        },
                        "slm": {
                            "admin-state": "enable",
                            "test-id": ${global.service\-id}
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
            "/nokia-state:state/oam-pm/session=${target?url('ISO-8859-1')}/ethernet/dmm/statistics/measurement-interval=5-mins": {
              "latency": {
                "path": "$.number[0].bin-type[?(@['bin-metric']=='fd')].round-trip.average"
              },
              "jitter": {
                "path": "$.number[0].bin-type[?(@['bin-metric']=='ifdv')].round-trip.average"
              }            
            },
            "/nokia-state:state/oam-pm/session=${target?url('ISO-8859-1')}/ethernet/slm/statistics/measurement-interval=5-mins": {
              "loss": {
                "path": "$.number[0].forward.average-frame-loss-ratio"
              }
            }
        }
</#if>
    }
}
