# -*- coding: utf-8 -*-
# 条目级解析 004807.ldb：找出 isoballx 各键的完整记录（key + 原始 value 字节），判断是否可恢复
import re

def varint(buf, pos):
    result = 0; shift = 0
    while True:
        b = buf[pos]; pos += 1
        result |= (b & 0x7f) << shift
        if not (b & 0x80):
            break
        shift += 7
    return result, pos

def snappy_decompress(data):
    pos = 0
    _, pos = varint(data, pos)
    out = bytearray()
    n = len(data)
    while pos < n:
        tag = data[pos]; pos += 1
        t = tag & 3
        if t == 0:
            l = tag >> 2
            if l < 60:
                ln = l + 1
            else:
                extra = l - 59
                ln = int.from_bytes(data[pos:pos + extra], 'little') + 1
                pos += extra
            out += data[pos:pos + ln]; pos += ln
        else:
            if t == 1:
                ln = ((tag >> 2) & 7) + 4
                offset = ((tag >> 5) << 8) | data[pos]; pos += 1
            elif t == 2:
                ln = (tag >> 2) + 1
                offset = int.from_bytes(data[pos:pos + 2], 'little'); pos += 2
            else:
                ln = (tag >> 2) + 1
                offset = int.from_bytes(data[pos:pos + 4], 'little'); pos += 4
            start = len(out) - offset
            for i in range(ln):
                out.append(out[start + i])
    return bytes(out)

path = r'C:\Users\Jacky\AppData\Local\Microsoft\Edge\User Data\Default\Local Storage\leveldb\004807.ldb'
data = open(path, 'rb').read()
footer = data[-48:]
off_m, pos = varint(footer, 0)
size_m, pos = varint(footer, pos)
off_i, pos = varint(footer, pos)
size_i, pos = varint(footer, pos)
idx_raw = data[off_i:off_i + size_i]
if data[off_i + size_i] == 1:
    idx_raw = snappy_decompress(idx_raw)
blocks = []
p = 0
while p < len(idx_raw) - 4:
    try:
        sh, p = varint(idx_raw, p)
        nsh, p = varint(idx_raw, p)
        vl, p = varint(idx_raw, p)
        p += nsh
        val = idx_raw[p:p + vl]; p += vl
        boff, vp = varint(val, 0)
        bsize, vp = varint(val, vp)
        blocks.append((boff, bsize))
    except Exception:
        break
print('total blocks:', len(blocks))

def parse_entries(raw):
    out = []
    q = 0
    last = b''
    while q < len(raw):
        try:
            sh, q = varint(raw, q)
            nsh, q = varint(raw, q)
            vl, q = varint(raw, q)
        except Exception:
            break
        if q + nsh + vl > len(raw):
            break
        kd = raw[q:q + nsh]; q += nsh
        v = raw[q:q + vl]; q += vl
        key = last[:sh] + kd
        last = key
        out.append((key, v))
        if sh == 0 and nsh == 0 and vl == 0:
            break
    return out

for boff, bsize in blocks:
    raw = data[boff:boff + bsize]
    if data[boff + bsize] == 1:
        try:
            raw = snappy_decompress(raw)
        except Exception:
            continue
    if b'isoballx' not in raw:
        continue
    print('--- block @%d size %d' % (boff, bsize))
    for key, v in parse_entries(raw):
        if b'isoballx' not in key:
            continue
        print('KEY :', key)
        print('VLEN:', len(v), 'RAW:', v[:300])
        print()
