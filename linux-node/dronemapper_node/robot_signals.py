"""Conservative advertisement matches; never connect to a robot. AGPL-3.0-or-later."""
import re

CYBERDOG_UUID = '0000c420-0000-1000-8000-00805f9b34fb'
CYBERDOG_SIGNATURE = 'cyberdog-ble-v1'


def robot_signature(name, service_uuids, manufacturer_data):
    # MiRoboticsLab/cyberdog_ros2 RobotAdvertisement: C420, 铁蛋 + PSN,
    # and company 0xffff payload 00 01 02 03 04. See docs/robot-signals.md.
    # All three are required; generic names, ports and FFE0 are not evidence.
    if (isinstance(name, str) and re.fullmatch(r'铁蛋[!-~]{1,20}\n?', name)
            and CYBERDOG_UUID in {str(x).lower() for x in service_uuids}
            and manufacturer_data.get(0xffff) == bytes(range(5))):
        return CYBERDOG_SIGNATURE
    return None
