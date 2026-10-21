"""No radio changes: exercise channel scheduling against a fake iw/ip driver."""
import importlib.util
import json
import os
from pathlib import Path
import threading
import unittest

if os.name == 'posix':
    spec=importlib.util.spec_from_file_location('channel_hop',Path(__file__).resolve().parents[1]/'channel-hop.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)


@unittest.skipUnless(os.name=='posix','Linux helper')
class ChannelTests(unittest.TestCase):
    def driver(self,tool,*args):
        if tool=='ip':return json.dumps([{'ifname':'dmmon0','flags':['UP']},{'ifname':'wifi0','flags':[]}])
        if args==('dev','dmmon0','info'):return 'Interface dmmon0\n wiphy 2\n type monitor\n channel 6 (2437 MHz)'
        if args==('dev',):return 'phy#2\n Interface dmmon0\n Interface wifi0\nphy#0\n Interface internet0'
        if args==('phy','phy2','info'):return '* 2412 MHz [1] (20.0 dBm)\n* 2437 MHz [6] (20.0 dBm)\n* 2462 MHz [11] (20.0 dBm)'
        self.commands.append((tool,*args));return ''

    def setUp(self):self.commands=[]

    def test_default_prioritizes_six_and_rejects_shell_input(self):
        plan=module.channels(module.DEFAULT_CHANNELS)
        self.assertEqual(plan[0],6);self.assertGreater(plan.count(6),plan.count(1))
        for text in ('6;reboot','0','999','6,,1','1,'*70+'1'):
            with self.assertRaises(ValueError):module.channels(text)

    def test_disabled_radar_and_no_ir_channels_not_selected(self):
        result=module.available_channels('* 2412 MHz [1] (20 dBm)\n* 2437 MHz [6] (disabled)\n* 5260 MHz [52] (20 dBm)\n radar detection\n* 5745 MHz [149] (20 dBm, no IR)')
        self.assertEqual(result,{1})

    def test_only_monitor_on_dedicated_radio_is_changed_and_restored(self):
        stop=threading.Event();radio=module.Radio('dmmon0',self.driver)
        seen=[]
        def report(text):
            seen.append(text)
            if 'channel 11' in text:stop.set()
        module.hop(radio,[1,11],.001,stop,report)
        self.assertEqual(self.commands,[('iw','dev','dmmon0','set','channel','1'),('iw','dev','dmmon0','set','channel','11'),('iw','dev','dmmon0','set','channel','6')])
        self.assertIn('Restored',seen[-1])

    def test_shared_radio_refused_before_retuning(self):
        def shared(tool,*args):
            if tool=='ip':return json.dumps([{'ifname':x,'flags':['UP']} for x in ('dmmon0','wifi0')])
            return self.driver(tool,*args)
        with self.assertRaisesRegex(ValueError,'Another interface'):
            module.hop(module.Radio('dmmon0',shared),[1,6],.001,threading.Event())
        self.assertEqual(self.commands,[])

    def test_unsupported_channel_refused_without_side_effects(self):
        with self.assertRaisesRegex(ValueError,'unavailable'):
            module.hop(module.Radio('dmmon0',self.driver),[149],.001,threading.Event())
        self.assertEqual(self.commands,[])

    def test_monitor_or_phy_change_stops_scheduler(self):
        radio=module.Radio('dmmon0',self.driver);radio.check()
        radio.run=lambda tool,*args:'wiphy 9\n type monitor\n channel 1'
        with self.assertRaisesRegex(ValueError,'another radio'):radio.check()
        with self.assertRaises(ValueError):module.Radio('-i',self.driver)
