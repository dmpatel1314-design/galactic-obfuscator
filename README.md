# Prototype Code Obfuscator (JS + Lua)

This repository is a minimal prototype demonstrating:

- JavaScript obfuscation (AST-based) — identifier renaming + string literal encoding using Babel.
- Lua obfuscation (packer) — basic comment stripping, XOR + base64 packing and a Lua runtime loader that decodes and executes the original code.

Usage
1. Install
   - node >= 14
   - Run: `npm install`

2. CLI
   - `node ./src/cli.js input.js > out.js` or after `npm link` run `obfuscator input.js`
   - Options:
     - `--lang js|lua` override language detection
     - `--no-strings` disable string encoding (JS)
     - `--no-rename` disable renaming (JS)
     - `--xor-key <key>` explicit XOR key for Lua packer (hex or raw string)
     - `-o, --out <file>` write to output file

3. Examples
   - JavaScript: `obfuscator example.js -o example.obf.js`
   - Lua: `obfuscator example.lua --lang lua -o example.obf.lua`

Limitations & next steps
- This is a prototype. It is intentionally conservative in some places to avoid breaking semantics.
- JS renaming does not attempt to rename exported/public API safely in all module systems; avoid using it on code that relies on specific symbol names unless you configure excludes.
- Lua packer uses runtime loader and XOR. It is portable but not as robust as AST-level transforms or bytecode-level obfuscation.
- Recommended extensions:
  - Implement property name handling, export whitelists, better eval detection for JS.
  - Add control-flow flattening, opaque predicates, dead-code insertion and multiple transformation passes.
  - Add tests to ensure runtime equivalence and performance benchmarks.

Ethical notice
Do not use this tool to hide malicious code, evade law enforcement, or for other illegal activities. The author does not condone misuse.
