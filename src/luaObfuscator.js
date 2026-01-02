/**
 * Simple Lua packer/obfuscator:
 * - Optionally strips comments/extra whitespace (basic)
 * - XORs bytes with a repeating key
 * - Base64-encodes the result and emits a Lua loader that decodes, XORs back and uses load/loadstring to run it.
 *
 * This approach is portable across many Lua versions because it uses load or loadstring;
 * however: if the target runtime disables load/loadstring or the debug library is restricted, this may fail.
 *
 * Note: This is a "packer" rather than AST-level obfuscation. For stronger protection, implement AST transforms or bytecode transforms.
 */

const crypto = require('crypto');

function randomKey(length = 16) {
  return crypto.randomBytes(length).toString('hex'); // hex string
}

function toBufferFromString(s) {
  return Buffer.from(s, 'utf8');
}

function xorBuffer(buf, keyBuf) {
  const out = Buffer.allocUnsafe(buf.length);
  for (let i = 0; i < buf.length; i++) {
    out[i] = buf[i] ^ keyBuf[i % keyBuf.length];
  }
  return out;
}

function base64Encode(buf) {
  return buf.toString('base64');
}

function stripCommentsAndWhitespaceLua(src) {
  // Very simple stripper: remove -- single-line comments and block comments --[[ ... ]]
  // NOT perfect: do not use in place of real parser if correctness matters.
  let s = src.replace(/--\[\[[\s\S]*?\]\]/g, ''); // block comments
  s = s.replace(/--.*$/gm, ''); // line comments
  // collapse multiple blank lines
  s = s.replace(/^\s*[\r\n]/gm, '');
  return s;
}

function makeLoader(b64, keyHex) {
  // Lua loader that:
  //  - decodes base64 (small pure Lua base64 decoder)
  //  - XORs with key (provided as hex)
  //  - loads chunk via load or loadstring and runs it
  // The loader uses standard Lua functions only.
  return `-- Obfuscated by obfuscator (packer mode)\nlocal b64 = "${b64}"\nlocal function b64decode(data)\n  local b='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'\n  data = string.gsub(data, '[^'..b..'=]', '')\n  return (data:gsub('.', function(x)\n    if (x == '=') then return '' end\n    local r,f='', (string.find(b,x)-1)\n    for i=6,1,-1 do r = r .. (math.floor(f / 2^(i-1)) % 2) end\n    return r\n  end):gsub('%d%d%d%d%d%d%d%d', function(x)\n    local c=0\n    for i=1,8 do c = c + (x:sub(i,i) == '1' and 2^(8-i) or 0) end\n    return string.char(c)\n  end))\nend\n\nlocal function hex_to_bytes(hex)\n  local t = {}\n  for i = 1, #hex, 2 do\n    t[#t+1] = tonumber(hex:sub(i,i+1), 16)\n  end\n  return t\nend\n\nlocal function xor_bytes(bytes, keybytes)\n  local out = {}\n  for i=1,#bytes do\n    local a = string.byte(bytes, i)\n    local k = keybytes[((i-1) % #keybytes) + 1]\n    out[#out+1] = string.char(bit32 and bit32.bxor and bit32.bxor(a, k) or ((a ~ k) % 256))\n  end\n  return table.concat(out)\nend\n\nlocal function safe_load_and_run(code)\n  local loader = load or loadstring\n  if not loader then error('no load/loadstring available') end\n  local f, err = loader(code)\n  if not f then error(err) end\n  return f()\nend\n\n-- main\nlocal decoded = b64decode(b64)\nlocal keybytes = hex_to_bytes("${keyHex}")\nlocal plain = xor_bytes(decoded, keybytes)\nreturn safe_load_and_run(plain)\n`;
}

/**
 * obfuscateLua(src, opts)
 * opts: { xorKey: null|string (hex or raw) }
 */
function obfuscateLua(src, opts = { xorKey: null }) {
  let s = src;
  s = stripCommentsAndWhitespaceLua(s);
  // choose key
  let keyHex = opts.xorKey;
  if (!keyHex) {
    keyHex = randomKey(12); // 24 hex chars
  } else {
    // if provided raw string (not hex), detect and convert
    if (!/^[0-9a-fA-F]+$/.test(keyHex)) {
      keyHex = Buffer.from(String(keyHex), 'utf8').toString('hex');
    }
  }

  const keyBuf = Buffer.from(keyHex, 'hex');
  const plainBuf = toBufferFromString(s);
  const xored = xorBuffer(plainBuf, keyBuf);
  const b64 = base64Encode(xored);
  const loader = makeLoader(b64, keyHex);
  return loader;
}

module.exports = { obfuscateLua };
