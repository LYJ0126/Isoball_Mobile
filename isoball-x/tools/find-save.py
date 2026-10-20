# -*- coding: utf-8 -*-
# 解析 Edge/Chrome localStorage LevelDB（.ldb SSTable + .log），还原 isoballx 存档值（只读）
import os, re, glob, struct

USER = r'C:\Users\Jacky'
MAGIC = bytes.fromhex('57fb808b247547db')  # leveldb table magic 0xdb4775248b80fb57 (little-endian stored)

def varint(buf, pos):
    result = 0; shift = 0
    while True:
        b = buf[pos]; pos += 1
        result |= (b & 0x7f) << shift
        if not (b & 0x80):
            break
        shift += 7
        if shift > 63:
            raise ValueError('varint too long')
    return result, pos

def snappy_decompress(data):
    pos = 0
    expected, pos = varint(data, pos)
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
            if start < 0:
                raise ValueError('bad copy offset')
            for i in range(ln):
                out.append(out[start + i])
    return bytes(out)

def read_sstable(path):
    data = open(path, 'rb').read()
    if len(data) < 52 or data[-8:] != MAGIC:
        return
    footer = data[-48:]
    try:
        off_m, pos = varint(footer, 0)
        size_m, pos = varint(footer, pos)
        off_i, pos = varint(footer, pos)
        size_i, pos = varint(footer, pos)
    except Exception:
        return
    idx_raw = data[off_i:off_i + size_i]
    if off_i + size_i < len(data) and data[off_i + size_i] == 1:
        try:
            idx_raw = snappy_decompress(idx_raw)
        except Exception:
            return
    blocks = []
    p = 0
    while p < len(idx_raw) - 4:
        try:
            sh, p = varint(idx_raw, p)
            nsh, p = varint(idx_raw, p)
            vl, p = varint(idx_raw, p)
            kd = idx_raw[p:p + nsh]; p += nsh
            val = idx_raw[p:p + vl]; p += vl   # value = block handle
            boff, vp = varint(val, 0)
            bsize, vp = varint(val, vp)
            blocks.append((boff, bsize))
        except Exception:
            break
    out = []
    for boff, bsize in blocks:
        raw = data[boff:boff + bsize]
        if boff + bsize < len(data) and data[boff + bsize] == 1:
            try:
                raw = snappy_decompress(raw)
            except Exception:
                continue
        out.append(raw)
    return out

def scan_db(label, lev):
    hits = 0
    files = sorted(glob.glob(os.path.join(lev, '*.ldb'))) + sorted(glob.glob(os.path.join(lev, '*.sst')))
    logs = sorted(glob.glob(os.path.join(lev, '*.log')))
    for path in files + logs:
        try:
            mtime = os.path.getmtime(path)
        except Exception:
            continue
        import datetime
        ts = datetime.datetime.fromtimestamp(mtime).strftime('%m-%d %H:%M')
        if path.endswith('.ldb') or path.endswith('.sst'):
            blocks = read_sstable(path) or []
            blob = b'\n'.join(blocks)
        else:
            blob = open(path, 'rb').read()
        # 找 isoballx 相关键与其后的 JSON 值
        for m in re.finditer(rb'isoballx_[a-z0-9_]*', blob):
            key = m.group(0).decode()
            tail = blob[m.end():m.end() + 400]
            jm = re.search(rb'\[?\{[^[\]]{0,200}?\}(?:,\{[^[\]]{0,60}?\})*\]?', tail)
            val = jm.group(0) if jm else tail[:80]
            print('[%s|%s|%s] %s -> %r' % (label, os.path.basename(path), ts, key, val))
            hits += 1
        # 独立找 cleared JSON（值可能与键分块存储）
        for m in re.finditer(rb'\[\{"cleared":[^\]]{0,120}\}\]', blob):
            print('[%s|%s|%s] JSON -> %r' % (label, os.path.basename(path), ts, m.group(0)))
            hits += 1
    return hits

total = 0
for root, label in [
    (os.path.join(USER, r'AppData\Local\Microsoft\Edge\User Data'), 'Edge'),
    (os.path.join(USER, r'AppData\Local\Google\Chrome\User Data'), 'Chrome'),
]:
    if not os.path.isdir(root):
        continue
    for entry in os.listdir(root):
        lev = os.path.join(root, entry, 'Local Storage', 'leveldb')
        if os.path.isdir(lev):
            n = scan_db(label + '/' + entry, lev)
            total += n
print('TOTAL:', total)
