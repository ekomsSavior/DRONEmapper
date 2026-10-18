"""Existing DRONEmapper proof-key pairing and upload contract. AGPL-3.0-or-later."""
import base64
import hashlib
import json
import re
import secrets
import time
import urllib.error
import urllib.request
import uuid
from . import __version__
from .storage import ORIGIN


class ApiError(Exception):
    def __init__(self,status):
        self.status=status
        super().__init__(f'Map request failed (HTTP {status}); please retry')


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):
        return None


class Api:
    def post(self,path,body,token=None):
        allowed={'/account-api/device/start','/account-api/device/poll','/v1/observations','/v1/nodes/heartbeat'}
        if path not in allowed:
            raise ValueError('Unsupported map endpoint')
        headers={'Content-Type':'application/json','Accept':'application/json','User-Agent':'DRONEmapper-Linux/'+__version__}
        if token:
            headers['Authorization']='Bearer '+token
        request=urllib.request.Request(ORIGIN+path,data=json.dumps(body,allow_nan=False).encode(),headers=headers,method='POST')
        try:
            with urllib.request.build_opener(NoRedirect()).open(request,timeout=10) as response:
                data=response.read(8193)
                if len(data)>8192:
                    raise ValueError('Oversized map response')
                result=json.loads(data)
                if not isinstance(result,dict):
                    raise ValueError('Invalid map response')
                return result
        except urllib.error.HTTPError as error:
            raise ApiError(error.code) from None


class Connection:
    def __init__(self,store,api=None):
        self.store=store
        self.api=api or Api()
        self.next_poll=0

    def start(self):
        existing=self.public_pair()
        if existing:
            return existing
        verifier=secrets.token_urlsafe(32)
        challenge=base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b'=').decode()
        result=self.api.post('/account-api/device/start',{'node_id':self.store.config['node_id'],'challenge':challenge,'label':self.store.settings()['label']})
        code=result.get('user_code','')
        expiry=result.get('expires_at',0)
        if not isinstance(code,str) or not re.fullmatch('[A-F0-9]{5}-[A-F0-9]{5}',code) or not isinstance(expiry,(int,float)) or not time.time()*1000<expiry<=time.time()*1000+660000 or result.get('verification_url')!=ORIGIN+'/account.html?device='+code:
            raise ValueError('Invalid account connection response')
        uuid.UUID(result['device_id'])
        with self.store.lock:
            self.store.config['pair']={**result,'verifier':verifier}
            self.store.save()
        return self.public_pair()

    def public_pair(self):
        pair=self.store.config.get('pair',{})
        if pair.get('expires_at',0)<time.time()*1000:
            return None
        return {k:pair[k] for k in ('user_code','verification_url','expires_at')}

    def poll(self):
        if time.monotonic()<self.next_poll or not self.public_pair():
            return
        self.next_poll=time.monotonic()+5
        pair=self.store.config['pair']
        result=self.api.post('/account-api/device/poll',{'device_id':pair['device_id'],'verifier':pair['verifier']})
        if result.get('status')=='connected':
            token=result.get('node_key','')
            if not isinstance(token,str) or not re.fullmatch('[A-Za-z0-9_-]{32,128}',token):
                raise ValueError('Invalid node credential')
            uuid.UUID(result['node_handle'])
            with self.store.lock:
                if self.store.config.get('pair') != pair:
                    return  # Disconnected or replaced while the request was in flight.
                self.store.config.update(token=token,node_handle=result['node_handle'],display_name=str(result.get('display_name','Anonymous'))[:32])
                self.store.config.pop('pair',None)
                settings=self.store.settings()
                settings.update(share_rid=False,share_areas=False,share_decoded=False)
                self.store.update(settings)
        elif result.get('status')=='expired':
            with self.store.lock:
                if self.store.config.get('pair') != pair:
                    return
                self.store.config.pop('pair',None)
                self.store.save()
        elif result.get('status')!='pending':
            raise ValueError('Invalid account connection status')


class Uploader:
    def __init__(self,store,api=None):
        self.store=store
        self.api=api or Api()
        self.next_attempt=0
        self.backoff=10
        self.status='Sharing is off'

    def tick(self):
        # The same lock orders consent changes with outgoing requests.
        with self.store.lock:
            settings=self.store.settings()
            if not (settings['share_rid'] or settings['share_areas'] or settings['share_decoded']):
                self.status='Sharing is off'
                return
            if not self.store.connected():
                self.status='Connect your account to upload'
                return
            if time.monotonic()<self.next_attempt:
                return
            records=self.store.batch()
            body={'schema_version':1,'node_id':self.store.config['node_id']}
            path='/v1/nodes/heartbeat'
            if records:
                body['observations']=records
                path='/v1/observations'
            try:
                response=self.api.post(path,body,self.store.config['token'])
                acknowledged = (type(response.get('accepted')) is int and type(response.get('duplicates')) is int
                                and response['accepted'] >= 0 and response['duplicates'] >= 0
                                and response['accepted'] + response['duplicates'] == len(records)) if records else response.get('ok') is True
                if not acknowledged:
                    raise ValueError('Map did not acknowledge the request')
                if records:
                    self.store.mark(records,'sent')
                    self.status=f'Map received {len(records)} observation(s)'
                else:
                    self.status='Node online · waiting for observations'
                self.backoff=10
                self.next_attempt=time.monotonic()+(10 if records else 60)
            except ApiError as error:
                if error.status in (401,403):
                    settings.update(share_rid=False,share_areas=False,share_decoded=False)
                    self.store.update(settings)
                    self.status='Node credential rejected · sharing stopped; reconnect your account'
                elif error.status in (400,422):
                    self.store.mark(records,'rejected')
                    self.status='Map rejected these observations; listening continues'
                else:
                    self.status='Map unavailable · queued for retry'
                self.delay()
            except (OSError,ValueError,urllib.error.URLError):
                self.status='Map unavailable · queued for retry'
                self.delay()

    def delay(self):
        self.next_attempt=time.monotonic()+self.backoff
        self.backoff=min(300,self.backoff*2)
