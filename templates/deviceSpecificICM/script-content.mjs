/********************************************************************************
 * DEVICE-SPECIFIC INTENT-TYPE USED FOR NSP DEVICE CONFIGURATION (ICM)
 *   Vendor: {{ vendor }}
 *   Device families: {{ family }}
 *   Device version: {{ version }}
 * 
 * DISCLAIMER:
 *   This intent-type was auto-generated by the NSP Intent Manager extension
 *   for vsCode. Current status of product-specific intent-types generated
 *   using Visual Studio Code is experimental!
 * 
 *   To use in production environments, extended testing must be considered:
 *   functionality, robustness, usability, performance, and scale.
 * 
 *   If you find issues around the generator tool or the generated intent-
 *   types, please provide feedback directly to the GitHub repository or
 *   contribute your code changes!
 * 
 * (c) 2025 by Nokia
 ********************************************************************************/

import { IntentHandlerBase }  from 'common/IntentHandlerBase.mjs';
import { NSP }  from 'common/NSP.mjs';

class IntentHandler extends (IntentHandlerBase) {
  constructor() {
    super();
    NSP.checkRelease(24, 11);
    {% if exclude %}this.ignoreChildren = {{ exclude | dump | safe }};{% endif %}
  }

  getDeviceModelPath(target) {
    const items = target.split('#');
    return `{{ pathRC | safe }}`;
  }

  getDesiredConfig(target, intentConfigJSON) {
    const items = target.split('#');
    {% if icmstyle -%}
    const config = Object.values(Object.values(JSON.parse(intentConfigJSON)[0])[0])[0];
    {%- else -%}
    const config = Object.values(JSON.parse(intentConfigJSON)[0])[0];
    {%- endif %}
    {% if rootInstance -%}
    {% for key, value in rootInstance -%}
    config["{{ key }}"] = {{ value | safe }};
    {% endfor -%}
    return {"{{ identifier }}": [this.cleanupConfig(config)]};
    {%- else %}
    return {"{{ identifier }}": this.cleanupConfig(config)};
    {%- endif %}
  }
  
  {% if icmstyle -%}
  getTargetDataHook(target, config) {
    return {"{{ root }}": config};
  }
  {%- endif %}
  {% if encryptedPaths.length >0 -%}
  preAuditHook(neId, path, aConfig, iConfig) {
  {%- for e in encryptedPaths %}
    this.deletePath(aConfig, "{{ e }}");
    this.deletePath(iConfig, "{{ e }}");
  {%- endfor %}
  }
  {%- endif %}
  // WebUI suggest/picker callouts:
{% for entry in suggestMethods %}
  {{ entry.suggest }}(context) {
    const target = this.getTarget(context);
{%- if entry.devicePath %}
{%- if entry.deviceKey %}
    return this.getDeviceModelObjects(context, `{{ entry.devicePath | safe }}`, "{{ entry.deviceKey }}");
{%- else %}
    return this.getDeviceModelObjects(context, `{{ entry.devicePath | safe }}`);
{%- endif %}
{%- endif %}
{%- if entry.formPath %}
    return this.getFormObjects(context, "{{ entry.formPath | safe }}");
{%- endif %}
  }
{% endfor %}
}

new IntentHandler();