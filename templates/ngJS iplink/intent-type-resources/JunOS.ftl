<#setting number_format="computer">
{
  "INTERFACE ${site.port\-id}": {
    "config": {
      "target": "junos-conf-root:/configuration/interfaces/interface=${site.port\-id?url('ISO-8859-1')}",
      "operation": "replace",
      "value": {
            "junos-conf-interfaces:interface": {
                "name" : "${site.port\-id}",
                "mtu": "9000",         <#-- JunOS uses union of string/uint32, MDC returns string  -->
<#if global.description??>
                "description": "iplink: ${global.description}",
</#if>
                "vlan-tagging": [null],
                "unit" : [{
                    "name" : "1",      <#-- JunOS uses union of string/uint32, MDC returns string -->
                    "vlan-id" : "1",   <#-- JunOS uses union of string/uint32, MDC returns string -->
                    "family" : {
                        "inet" : {
                            "address" : [{
                                "name" : "${site.addr}/31"
                            }]
                        }, 
                        "iso": {}
                    }
                }]
            }
      },
      "ignoreChildren": []
    },
    "health": {}
  },
  "LLDP INTERFACE ${site.port\-id}": {
    "config": {
      "target": "junos-conf-root:/configuration/protocols/lldp/interface=${site.port\-id?url('ISO-8859-1')}",
      "operation": "replace",
      "value": {
            "junos-conf-protocols:interface": {
                "name" : "${site.port\-id}"
            }
      },
      "ignoreChildren": []
    },
    "health": {}
  },
  "ISIS INTERFACE ${site.port\-id}.1": {
    "config": {
      "target": "junos-conf-root:/configuration/protocols/isis/interface=${site.port\-id?url('ISO-8859-1')}.1",
      "operation": "replace",
      "value": {
            "junos-conf-protocols:interface": {
                "name" : "${site.port\-id}.1",
                "point-to-point" : [null]            
            }
      },
      "ignoreChildren": []
    },
    "health": {}
  },
  "LDP INTERFACE ${site.port\-id}.1": {
    "config": {
      "target": "junos-conf-root:/configuration/protocols/ldp/interface=${site.port\-id?url('ISO-8859-1')}.1",
      "operation": "replace",
      "value": {
            "junos-conf-protocols:interface": {
                "name" : "${site.port\-id}.1"
            }
      },
      "ignoreChildren": []
    },
    "health": {}
  }
}