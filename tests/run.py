"""Cute Portfolio test suite runner.

    python3 tests/run.py                  # every test in tests/suite.txt
    python3 tests/run.py market_test.py   # only these
    SHARD=2/4 python3 tests/run.py        # the 2nd quarter of the list (GitHub runs 4 quarters side by side)

Starts the two local servers the tests need (the site on :8000/:8001 and a fake Firestore on :8787),
resets the fake database before each test (e2e.py), and retries a failed test once — a test that only
passes on the retry is reported as flaky. Exit code 1 if any test failed twice.
"""
import os, sys, time, socket, subprocess, pathlib

T = pathlib.Path(__file__).resolve().parent
SEED_FIRST = ('axis_hover', 'charts_check', 'fmt_check', 'perf_chart')   # need a long chart history in the fake database
TEST_TIMEOUT = int(os.environ.get('TEST_TIMEOUT', '420'))


def up(port):
    try:
        with socket.create_connection(('127.0.0.1', port), timeout=0.5): return True
    except OSError: return False


def start_servers():
    procs = []
    if not up(8000):
        procs.append(subprocess.Popen([sys.executable, str(T / 'testserver.py')], cwd=T, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
    if not up(8787):
        procs.append(subprocess.Popen(['node', str(T / 'fakefs' / 'server.mjs'), '8787'], cwd=T, stdout=open(T / 'shots' / 'fakefs.log', 'w'), stderr=subprocess.STDOUT))
    for _ in range(100):
        if up(8000) and up(8001) and up(8787): return procs
        time.sleep(0.2)
    sys.exit('The test servers did not start (ports 8000 / 8001 / 8787).')


def run(cmd, timeout):
    try:
        r = subprocess.run(cmd, cwd=T, capture_output=True, text=True, timeout=timeout)
        return r.returncode, (r.stdout or '') + (r.stderr or '')
    except subprocess.TimeoutExpired as e:
        return 124, ((e.stdout or b'').decode(errors='replace') if isinstance(e.stdout, bytes) else (e.stdout or '')) + f'\nTIMEOUT after {timeout}s'


def one(name):
    run([sys.executable, 'e2e.py'], 180)                                   # fresh fake database + sign-in state
    if name.startswith(SEED_FIRST): run([sys.executable, 'seed_snaps.py'], 120)
    return run([sys.executable, name], TEST_TIMEOUT)


def main():
    (T / 'shots').mkdir(exist_ok=True)
    tests = sys.argv[1:] or [l.strip() for l in (T / 'suite.txt').read_text().splitlines() if l.strip() and not l.startswith('#')]
    shard = os.environ.get('SHARD', '')
    if shard:
        k, n = (int(x) for x in shard.split('/'))
        tests = [t for i, t in enumerate(tests) if i % n == k - 1]
    procs = start_servers()
    passed, flaky, failed = [], [], []
    t0 = time.time()
    try:
        for i, name in enumerate(tests, 1):
            s = time.time(); code, out = one(name)
            if code != 0:
                code2, out2 = one(name)                                     # one retry
                if code2 == 0: flaky.append(name); tag = 'FLAKY'
                else: failed.append((name, out2 or out)); tag = 'FAIL'
            else: passed.append(name); tag = 'ok'
            last = (out.strip().splitlines() or [''])[-1][:90]
            print(f'[{i}/{len(tests)}] {tag:5} {name}  ({time.time() - s:.0f}s)  {last}', flush=True)
    finally:
        for p in procs: p.terminate()
    mins = (time.time() - t0) / 60
    print(f'\n{len(passed)} passed, {len(flaky)} flaky, {len(failed)} failed — {len(tests)} tests in {mins:.1f} min')
    for name, out in failed:
        lines = [l for l in out.splitlines() if l.startswith('FAIL') or 'Error' in l or 'TIMEOUT' in l][:8]
        print(f'\n--- {name}\n' + '\n'.join(lines))
    summary = os.environ.get('GITHUB_STEP_SUMMARY')
    if summary:
        with open(summary, 'a') as f:
            f.write(f'### Tests{" " + shard if shard else ""}: {len(passed)} passed, {len(flaky)} flaky, {len(failed)} failed ({mins:.0f} min)\n')
            for n in flaky: f.write(f'- flaky: `{n}`\n')
            for n, _ in failed: f.write(f'- **failed: `{n}`**\n')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
