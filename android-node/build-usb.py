import pathlib,subprocess,concurrent.futures,re,sys,os,hashlib,platform
# Copyright 2026 Church of Malware / saviorSEC. GPL-2.0-only.
base=pathlib.Path(__file__).resolve().parent
src=base/'app/src/main/cpp/uwifi'
libusb=base/'app/src/main/cpp/libusb'
ndkroot=pathlib.Path(sys.argv[1])
abi=sys.argv[2] if len(sys.argv)>2 else 'arm64-v8a'
triples={'arm64-v8a':'aarch64-linux-android','armeabi-v7a':'armv7a-linux-androideabi','x86_64':'x86_64-linux-android'}
host='darwin-x86_64' if platform.system()=='Darwin' else 'linux-x86_64'
ndk=ndkroot/'toolchains/llvm/prebuilt'/host/'bin'
cc=ndk/(triples[abi]+'26-clang')
if not cc.exists(): raise SystemExit('Install Android NDK 28.2.13676358 with SDK Manager first')
out=base/'app/build/usb-objects'/abi;out.mkdir(parents=True,exist_ok=True)
libout=base/'app/build/generated/radio/jniLibs'/abi;libout.mkdir(parents=True,exist_ok=True)
# Header changes invalidate every object (Gradle tracks all source inputs too).
fingerprint=hashlib.sha256()
for f in sorted((base/'app/src/main/cpp').rglob('*.h')):fingerprint.update(f.read_bytes())
fingerprint.update(pathlib.Path(__file__).read_bytes())
tag=out/'inputs.sha256'
if not tag.exists() or tag.read_text()!=fingerprint.hexdigest():
 for f in out.glob('*.o'):f.unlink()
 tag.write_text(fingerprint.hexdigest())
make=(src/'Makefile.in').read_text()
paths=[]
for var in ['KCOMPAT_OBJS','MAC80211_OBJS','MT76_OBJS','GLUE_OBJS']:
 block=make.split(var+' =',1)[1].split('\n\n',1)[0]
 paths += re.findall(r'[a-zA-Z0-9_/.-]+\.o',block)
paths=[p[:-2]+'.c' for p in paths]
paths += ['common/uwifi.c','android-jni.c']+[f'drivers/mt76/mt76x0/{f}.c' for f in ['init','main','eeprom','phy','usb','usb_mcu']]
incs=['-I'+str(src/p) for p in ['kcompat/include','kcompat/upstream','kcompat/upstream/uapi','.','mac80211','drivers','drivers/mt76']]+['-I'+str(libusb/'libusb')]
units=[(src/p,incs) for p in paths]
units += [(libusb/'libusb'/p,['-I'+str(libusb/'android'),'-I'+str(libusb/'libusb'),'-I'+str(libusb/'libusb/os')]) for p in ['core.c','descriptor.c','hotplug.c','io.c','sync.c','strerror.c','os/linux_usbfs.c','os/events_posix.c','os/threads_posix.c','os/linux_netlink.c']]
def compile(unit):
 f,inc=unit;o=out/(str(f.relative_to(base/'app/src/main/cpp')).replace('/','_')+'.o')
 if o.exists() and o.stat().st_mtime>f.stat().st_mtime:return str(o),''
 cmd=[str(cc)]+(['-include',str(src/'android-host.h')] if str(f).startswith(str(src)) else [])+['-std=gnu11','-fPIC','-pthread','-O2','-w','-DKBUILD_MODNAME="mt76"']+inc+['-c',str(f),'-o',str(o)]
 p=subprocess.run(cmd,capture_output=True,text=True)
 return (str(o) if p.returncode==0 else None),p.stderr
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex: results=list(ex.map(compile,units))
errors=[e for o,e in results if o is None]
if errors:
 print('COMPILE FAILURES',len(errors));print('\n'.join(errors));sys.exit(1)
p=subprocess.run([str(cc),'-shared','-Wl,--no-undefined','-Wl,-z,max-page-size=16384','-o',str(libout/'libdroneradio.so')]+[o for o,e in results]+['-llog','-lm','-latomic'],capture_output=True,text=True)
print(p.stderr);print('Link exit',p.returncode);sys.exit(p.returncode)
