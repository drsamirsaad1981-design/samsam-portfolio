import json, math, random, time, urllib.request
random.seed(7); now = int(time.time() * 1000); H = 3600_000; M5 = 300_000
days = {}
def put(t, field, key, val):
    d = time.strftime('%Y-%m-%d', time.gmtime(t / 1000)); days.setdefault(d, {'p': {}, 'h': {}})[field][key] = val
v = 1073500.0
for i in range(288, -1, -1):
    t = (now - i * M5) // M5 * M5; v += random.gauss(0, 600) + 60 * math.sin(i / 20)
    put(t, 'h', str(t), {'t': t, 'v': round(v, 2)})
pv, pb = 10500.0, 98000.0
for i in range(7 * 24, -1, -1):
    t = (now - i * H) // H * H; pv *= 1 + random.gauss(0.0004, 0.004); pb *= 1 + random.gauss(0.0002, 0.005)
    put(t, 'p', str(t), {'t': t, 'v': round(pv, 2), 'b': round(pb, 2)})
ops = [{'op': 'set', 'path': f'users/uid_samir/snaps/{d}', 'data': v, 'merge': True} for d, v in days.items()]
req = urllib.request.Request('http://127.0.0.1:8787/commit', data=json.dumps({'ops': ops}).encode(), headers={'content-type': 'application/json'})
print(urllib.request.urlopen(req).read().decode(), len(ops), 'day docs')
