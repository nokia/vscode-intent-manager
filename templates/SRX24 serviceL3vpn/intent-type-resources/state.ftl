<state-report xmlns="http://www.nokia.com/management-solutions/ibn">
  <l3vpn-state xmlns="http://www.nokia.com/management-solutions/l3vpn">
    <rd-index>${state.service\-id?c}</rd-index>
<#if indicators.state??>
    <oper-state>${indicators.state?values[0]}</oper-state>
</#if>
<#if indicators.transport??>
    <transport>${indicators.transport?values[0]}</transport>
</#if>
  </l3vpn-state>
</state-report>
