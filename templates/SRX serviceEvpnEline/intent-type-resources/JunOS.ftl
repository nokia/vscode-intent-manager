<#setting number_format="computer">
{
    "VPWS Site": {
        "config": {
            "target": "junos-conf-root:/configuration/instance=${target?url('ISO-8859-1')}",
            "operation": "replace",
            "value": {
                "junos-conf-root:instance": {
                  "name": "${target}",
                  "instance-type": "evpn-vpws",
                  "description" :"${global.description}", 
                  "vrf-target": {
                    "community": "target:65000:${site.svcId}"
                  },
                  "route-distinguisher": {
                    "rd-type": "65000:${site.svcId}"
                  },
                  "protocols": {
                    "evpn": {
                      "interface": [{
                        "name": "${site.port\-id}.${site.vlan\-id}",
                        "vpws-service-id": {
                          "remote": "${site.svcId}",
                          "local": "${site.svcId}"
                        }
                      }]
                    }
                  },
                  "interface": [{
                    "name": "${site.port\-id}.${site.vlan\-id}",
                  }]
                }
            }
        }
    },

    "VPWS Interface ${site.port\-id} VLAN ${site.vlan\-id}": {
        "config": {
            "target": "junos-conf-root:/configuration/interfaces/interface==${site.port\-id?url('ISO-8859-1')}/unit=${site.vlan\-id?url('ISO-8859-1')}",
            "operation": "replace",
            "value": {
                "junos-conf-root:unit": {
                    "encapsulation": "vlan-ccc",
                    "name": "${site.vlan\-id}",
                    "vlan-tags": {
                        "outer": "${site.vlan\-id}"
                    }
                }
            }
        }
    }
}
