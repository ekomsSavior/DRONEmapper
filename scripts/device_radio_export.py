"""Attach existing radio evidence to exact device/manufacturer catalog matches."""
import re

def norm(value):
    return ' '.join(str(value or '').split()).casefold()

MAKER_ALIASES={
    'kuka ag':'KUKA Robotics','kuka industrial':'KUKA Robotics',
    'fanuc corporation':'FANUC Robotics','ubtech robotics':'UBTECH Robotics',
    'quantum-systems':'Quantum Systems','teal':'Teal Drones',
    'flirtey (skydrop)':'Flirtey','anduril':'Anduril Industries',
}

# Explicit firmware/model associations, not substring or manufacturer-wide rules.
ROBOT_MODELS={
    ('xiaomi','cyberdog'):['cyberdog-ble-v1'],
    ('unitree robotics','go1'):['unitree-go1-wifi-name'],
    ('petoi','bittle'):['petoi-bittle-ap-name','petoi-bittle-ble-name'],
    ('petoi','bittle x'):['petoi-bittle-ble-name'],
    ('petoi','bittle x v2'):['petoi-bittle-ble-name'],
    ('petoi','bittle x+arm'):['petoi-bittle-ble-name'],
    ('petoi','nybble'):['petoi-nybble-ble-name'],
    ('petoi','nybble q'):['petoi-nybble-ble-name'],
    ('petoi','opencat cub firmware target'):['petoi-cub-ble-name'],
    ('dji','robomaster s1'):['robomaster-s1-wifi-name'],
    ('dji','robomaster ep'):['robomaster-ep-wifi-name'],
}

def names(record,makers):
    values={norm(record.get(k)) for k in ('name','model','product') if record.get(k)}
    values.update(norm(v) for v in record.get('aliases',[]))
    for value in list(values):
        for maker in makers:
            if value.startswith(maker+' '):values.add(value[len(maker)+1:])
    # Model aliases already contain Go1; map inventory also uses 'Unitree Go1'.
    if 'unitree robotics' in makers:
        values.update(v[len('unitree '):] for v in list(values) if v.startswith('unitree '))
    return values

def enrich_radio(devices,allocations,references,signatures,channels,fcc,allocation_aliases=None):
    by_maker={}; maker_aliases={**MAKER_ALIASES,**{norm(k):v for k,v in (allocation_aliases or {}).items()}}
    for allocation in allocations:
        maker=allocation['device'].removesuffix(' devices')
        by_maker.setdefault(norm(maker),[]).append(allocation)
        maker_aliases[norm(allocation['registrant'])]=maker
    reference_index=[]
    for catalog,data in references.items():
        vendors={v['id']:v for v in data.get('vendors',[])}
        for ref in data.get('models',[]):
            vendor=vendors.get(ref.get('vendor'),{})
            maker=ref.get('manufacturer') or vendor.get('name')
            if not maker:continue
            makers={norm(maker),*[norm(v) for v in ref.get('manufacturer_aliases',[])],*[norm(v) for v in vendor.get('aliases',[])]}
            for alias in makers:maker_aliases.setdefault(alias,maker)
            reference_index.append((catalog,ref,makers,names(ref,makers)))
    signature_by_id={r['id']:r for r in signatures['rules']}
    for device in devices:
        maker=norm(device['maker']);canonical=norm(maker_aliases.get(maker,maker))
        makers={maker,canonical};device_names=names(device,makers)
        # Equipment in an operator's FCC index can be made by another company.
        device['mac_allocations']=[] if device['kind']=='regulatory-equipment' else [
            {**a,'scope':'manufacturer-allocation; not verified for this particular model'}
            for a in by_maker.get(canonical,[])]
        device['rf_information']=[];device['scanner_signatures']=[]
        for catalog,ref,ref_makers,ref_names in reference_index:
            if makers.isdisjoint(ref_makers) or device_names.isdisjoint(ref_names):continue
            if ref.get('connection'):
                device['rf_information'].append({
                    'kind':'model-communications-reference','model':ref['name'],
                    'communications':ref['connection'],'reception':ref.get('reception'),
                    'sources':sorted(set(ref.get('sources',[])+[ref[k] for k in ('source','url') if ref.get(k)])),
                    'catalog':catalog,'scope':'Referenced model or explicitly listed alias only; not a received observation',
                })
        ids=set()
        for (robot_maker,model),rules in ROBOT_MODELS.items():
            if robot_maker in makers and model in device_names:ids.update(rules)
        device['scanner_signatures']=[signature_by_id[i] for i in sorted(ids)]
        if any(r['transport']=='ble' for r in device['scanner_signatures']):
            device['rf_information'].append({'kind':'protocol-channel-reference','protocol':'Bluetooth LE primary advertising',
                'scope':'Protocol frequencies only; the complete firmware signature is required for a candidate match',
                'channels':[c for c in channels if c['id'] in {'ble-37','ble-38','ble-39'}]})
        if device['kind']=='regulatory-equipment':
            device['rf_information'].append({'kind':'regulatory-equipment-reference','fcc_id':device['fcc_id'],
                'frequencies_mhz':device.get('frequencies_mhz',[]),'evidence_status':device['evidence_status'],
                'source':device.get('source') or device.get('lookup_url'),
                'scope':'This FCC equipment record only; not all vehicles from the associated vendor'})
        # Named model variants retain the exact applicability and pending grant status.
        for relation in fcc['product_relationships']:
            vendor=next(v for v in fcc['vendors'] if v['id']==relation['vendor_id'])
            rel_makers={norm(vendor['name']),*[norm(v) for v in vendor.get('aliases',[])]}
            product=re.sub(r' \(online\)$','',relation['product'])
            rel_names=names({'name':product},rel_makers)
            if makers.isdisjoint(rel_makers) or device_names.isdisjoint(rel_names):continue
            equipment=[r for r in fcc['devices'] if r['fcc_id'] in relation['fcc_ids']]
            device['rf_information'].append({'kind':'manufacturer-listed-radio-variant',**relation,
                'scope':'Listed regulatory variant only; optional radios are not universal model features',
                'equipment':[{'fcc_id':r['fcc_id'],'frequencies_mhz':r.get('frequencies_mhz',[]),'evidence_status':r['evidence_status'],'source':r.get('source') or r.get('lookup_url')} for r in equipment]})
