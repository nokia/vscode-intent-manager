<#setting number_format="computer">
{
<#list site.ports as port>
  "INTERFACE ${port}": {
    "config": {
      "target": "srl_nokia-interfaces:/interface=${port?url('ISO-8859-1')}",
      "operation": "replace",
      "value": {              
        "srl_nokia-interfaces:interface": {
          "name": "${port}",
<#if global.description??>
          "description": "${global.description}",
</#if>
          "ethernet": {
            "aggregate-id": "${global.lagId}"
          },
          "admin-state": "enable"
        }
      }
    }
  },
</#list>
  "INTERFACE ${global.lagId}": {
    "config": {
      "target": "srl_nokia-interfaces:/interface=${global.lagId?url('ISO-8859-1')}",
      "operation": "replace",
      "value": {
        "srl_nokia-interfaces:interface": {
          "name": "${global.lagId}",
<#if global.description??>
          "description": "${global.description}",
</#if>
          "srl_nokia-interfaces-lag:lag": {
            "lag-type": "static"
          },
          "mtu": 2000,
          "srl_nokia-interfaces-vlans:vlan-tagging": true,          
          "admin-state": "enable"
        }
      }
    }
  }
}