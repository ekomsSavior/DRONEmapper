"""Emit isolated generated records to the JS validator, never to the network."""
import json
import tempfile
import time
from unittest.mock import patch
from test_decoders import document,adsb_records,packet,dji_payload,live_dji_records
from test_node import Store, Engine, event, location, basic, pack, NOW

with tempfile.TemporaryDirectory() as directory:
    store=Store(directory)
    engine=Engine(store)
    try:
        store.config['token']='offline-test-only'
        engine.configure({'share_rid':True,'share_decoded':True,'share_areas':True,'station':[37.123456,-122.123456]})
        with patch('time.time',return_value=NOW):
            engine.ingest(event())
            engine.ingest(event(type='candidate',name='WIFI_8K__test123',signature='wifi-cam-name',frequency_mhz=2437))
            engine.ingest(adsb_records(document(),NOW)[0])
            engine.ingest(live_dji_records({'detections':[dji_payload(packet())]},NOW,NOW,2444.5)[0])
            batch={'schema_version':1,'node_id':store.config['node_id'],'observations':store.batch(NOW)}
            print(json.dumps({'now':NOW,'batch':batch}))
    finally:
        engine.close();store.close()
