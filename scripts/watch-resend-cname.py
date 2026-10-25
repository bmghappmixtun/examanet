#!/usr/bin/env python3
"""
Watch the 4 Resend CNAMEs at the authoritative Jimdo nameservers.

The recursive resolvers cache NXDOMAIN for up to 1h, so we query the
authoritative NS directly (ns13/ns14.jimdo.com) to know the truth.
Exits 0 as soon as the 4 records are live.
"""
import json
import socket
import struct
import random
import sys
import time

AUTH = ['ns13.jimdo.com', 'ns14.jimdo.com']
TARGETS = ['send.forge.rseta.net', 'rsend-euw1.forge.rseta.net']


def build_query(name, qtype):
    tid = random.randint(0, 65535)
    header = struct.pack('>HHHHHH', tid, 0x0100, 1, 0, 0, 0)
    q = b''.join(bytes([len(l)]) + l.encode() for l in name.split('.')) + b'\x00'
    q += struct.pack('>HH', qtype, 1)
    return header + q


def ask(server_ip, name, qtype=5, timeout=6):
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.settimeout(timeout)
    try:
        s.sendto(build_query(name, qtype), (server_ip, 53))
        data, _ = s.recvfrom(4096)
    except Exception:
        return None
    finally:
        s.close()
    if len(data) < 12:
        return None
    rcode = data[3] & 0xF
    if rcode == 3:
        return []
    if rcode != 0:
        return None
    qd, an = struct.unpack('>HH', data[4:8])
    off = 12
    for _ in range(qd):
        while data[off] != 0:
            off += 1
        off += 5
    out = []
    for _ in range(an):
        if data[off] & 0xC0 == 0xC0:
            off += 2
        else:
            while data[off] != 0:
                off += 1
            off += 1
        t, _c, _ttl, rdlen = struct.unpack('>HHIH', data[off:off + 10])
        off += 10
        rd = data[off:off + rdlen]
        off += rdlen
        if t == 5:
            i = 0
            parts = []
            while rd[i] != 0:
                l = rd[i]
                parts.append(rd[i + 1:i + 1 + l].decode('latin1'))
                i += 1 + l
            out.append('.'.join(parts).lower())
    return out


def auth_ips():
    ips = []
    for h in AUTH:
        try:
            ips.append(socket.gethostbyname(h))
        except Exception:
            pass
    return ips


def check():
    """Returns (all_ok, report_lines)."""
    ips = auth_ips()
    if not ips:
        return False, ['  ! résolution NS impossible']
    lines = []
    ok = 0
    total = 0
    for dom in ['devoirat.net', 'tunisiecollege.net']:
        for sub, expect in [('send', TARGETS[0]), ('rsend', TARGETS[1])]:
            fqdn = f'{sub}.{dom}'
            total += 1
            found = False
            detail = 'NXDOMAIN'
            for ip in ips:
                res = ask(ip, fqdn)
                if res is None:
                    detail = 'timeout'
                    continue
                for r in res:
                    if expect.lower() in r:
                        found = True
                        detail = r
                        break
                if found:
                    break
            if found:
                ok += 1
            lines.append(f"  {fqdn:34s} {'✅' if found else '❌'} {detail}")
    return ok == total, lines


def main():
    deadline = time.time() + 3 * 3600
    attempt = 0
    while time.time() < deadline:
        attempt += 1
        all_ok, lines = check()
        print(f"--- attempt {attempt} @ {time.strftime('%H:%M:%S')} ---", flush=True)
        for l in lines:
            print(l, flush=True)
        if all_ok:
            print('ALL_OK — les 4 CNAME sont en ligne (autoritaires Jimdo)', flush=True)
            return 0
        time.sleep(300)
    print('TIMEOUT — 3h écoulées, records toujours absents', flush=True)
    return 1


if __name__ == '__main__':
    sys.exit(main())
