import ast
import json
import re
import sys
from pathlib import Path
root = Path(sys.argv[1])
out = root / 'prototypes/kronos-settings-chatgpt/src'
def write(name,value):
    (out/name).write_text(json.dumps(value,indent=4,ensure_ascii=True)+'\n')
# Load only the pure default data, before imports of runtime modules or environment metadata.
source=(root/'third_party/upstream/hermes-agent/hermes_cli/config_defaults.py').read_text()
namespace={}
exec(compile(source.split('from hermes_cli.config_defaults_env')[0],'<hermes-default-data>','exec'),namespace)
defaults=namespace['DEFAULT_CONFIG']
ui=json.loads((out/'hermes-ui.json').read_text())
def lookup_copy(table,key):
    converted='.'.join(re.sub(r'_([a-z0-9])',lambda m:m[1].upper(),part) for part in key.split('.'))
    return table.get(converted) or table.get(key)
def pretty(key):
    return re.sub(r'(?<=[a-z0-9])(?=[A-Z])',' ',key).replace('_',' ').replace('-',' ').strip().capitalize()
fields=[]
def walk(value,prefix=''):
    for key,default in value.items():
        full=f'{prefix}.{key}' if prefix else key
        if full.startswith('_'): continue
        if isinstance(default,dict) and default:
            walk(default,full)
            continue
        options=ui['ENUM_OPTIONS'].get(full)
        kind='json' if isinstance(default,(dict,list)) else 'toggle' if isinstance(default,bool) else 'number' if isinstance(default,(int,float)) else 'text'
        if options: kind='select'
        secret=bool(re.search(r'(^|[._])(api_key|token|password|secret)([._]|$)',full))
        fields.append({'key':full,'label':lookup_copy(ui['FIELD_LABELS'],full) or pretty(key),'description':lookup_copy(ui['FIELD_DESCRIPTIONS'],full) or '', 'value':default,'type':'password' if secret else kind,'options':options,'source':'Hermes','category':full.split('.')[0] if '.' in full else 'general','secret':secret})
walk(defaults)
fields.append({'key':'model_context_length','label':'Context window','description':'0 uses model metadata.','value':0,'type':'number','source':'Hermes','category':'model'})
# Preserve schema overrides for documented select options without importing the running server.
schema_ast=ast.parse((root/'third_party/upstream/hermes-agent/hermes_cli/web_server_config.py').read_text())
for node in schema_ast.body:
    if isinstance(node,ast.AnnAssign) and isinstance(node.target,ast.Name) and node.target.id=='_SCHEMA_OVERRIDES':
        for key,value in zip(node.value.keys,node.value.values):
            k=ast.literal_eval(key)
            if isinstance(value,ast.Call) and isinstance(value.func,ast.Name) and value.func.id=='_select':
                opts=[ast.literal_eval(arg) for arg in value.args[1:] if isinstance(arg,ast.Constant)]
                for field in fields:
                    if field['key']==k and opts:
                        field['options']=opts
                        field['type']='select'
                        field['description']=ast.literal_eval(value.args[0])
# Desktop schema includes maps, arrays, and legacy compatibility fields.
schema=json.loads((root/'schema/settings.json').read_text())
app_defaults=json.loads((root/'pkg/wconfig/defaultconfig/settings.json').read_text())
go=(root/'pkg/wconfig/settingsconfig.go').read_text().split('type SettingsType struct {')[1].split('\n}')[0]
names={match[2]:match[1] for match in re.finditer(r'(\w+)\s+[^\n]+?`json:"([^",]+)',go)}
for key,entry in schema['$defs']['SettingsType']['properties'].items():
    if key.endswith(':*'): continue
    t=entry.get('type')
    default=app_defaults.get(key,False if t=='boolean' else 0 if t in ['number','integer'] else [] if t=='array' else {} if t=='object' or '$ref' in entry else '')
    kind='toggle' if t=='boolean' else 'number' if t in ['number','integer'] else 'json' if t in ['array','object'] or '$ref' in entry else 'text'
    fields.append({'key':key,'label':pretty(names.get(key,key.split(':')[-1])),'value':default,'type':'select' if entry.get('enum') else kind,'options':entry.get('enum'),'source':'Desktop','category':key.split(':')[0], 'description':entry.get('description','')})
# Preserve additional defaults even when the checked-in schema lags behind the source.
for key,default in app_defaults.items():
    if not any(f['source']=='Desktop' and f['key']==key for f in fields):
        fields.append({'key':key,'label':pretty(key.split(':')[-1]),'value':default,'type':'toggle' if isinstance(default,bool) else 'number' if isinstance(default,(float,int)) else 'text','source':'Desktop','category':key.split(':')[0]})
write('configuration.json',fields)
write('coverage.json',{'hermes':sum(f['source']=='Hermes' for f in fields),'desktop':sum(f['source']=='Desktop' for f in fields),'sources':['third_party/upstream/hermes-agent/hermes_cli/config_defaults.py','frontend/hermes/app/settings/constants.ts','schema/settings.json','pkg/wconfig/defaultconfig/settings.json']})
print(f'Generated {len(fields)} configuration fields')

helpers={}
exec(compile((root/'third_party/upstream/hermes-agent/hermes_cli/config_defaults_env.py').read_text(),'<environment-metadata>','exec'),helpers)
env_source=source.split('from hermes_cli.config_defaults_env')[1]
env_source=env_source[env_source.index('OPTIONAL_ENV_VARS ='):]
exec(compile(env_source,'<environment-default-data>','exec'),helpers)
write('environment-fields.json',[{'key':key,'label':entry.get('prompt',key),'description':entry.get('description',''),'category':entry.get('category','setting'),'secret':entry.get('password',False),'value':'','type':'password' if entry.get('password') else 'text','source':'Environment'} for key,entry in helpers['OPTIONAL_ENV_VARS'].items()])
