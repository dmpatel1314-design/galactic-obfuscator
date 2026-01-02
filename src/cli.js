#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { program } = require('commander');
const { obfuscateJS } = require('./jsObfuscator');
const { obfuscateLua } = require('./luaObfuscator');

program
  .name('obfuscator')
  .description('Prototype obfuscator for JavaScript and Lua')
  .argument('<input>', 'input source file (js or lua)')
  .option('-o, --out <file>', 'output file (default stdout)')
  .option('--lang <lang>', 'language override: js|lua')
  .option('--no-strings', 'do not encode string literals (JS only)')
  .option('--no-rename', 'do not rename identifiers (JS only)')
  .option('--xor-key <key>', 'explicit XOR key for Lua packer (hex or string)')
  .action((input, opts) => {
    const inputPath = path.resolve(process.cwd(), input);
    if (!fs.existsSync(inputPath)) {
      console.error('Input file not found:', inputPath);
      process.exit(2);
    }
    const src = fs.readFileSync(inputPath, 'utf8');
    const lang = opts.lang || (inputPath.endsWith('.lua') ? 'lua' : inputPath.endsWith('.js') ? 'js' : null);
    if (!lang) {
      console.error('Unable to determine language. Use --lang js|lua');
      process.exit(2);
    }

    let out;
    try {
      if (lang === 'js') {
        out = obfuscateJS(src, { encodeStrings: !!opts.strings, rename: !!opts.rename });
      } else if (lang === 'lua') {
        out = obfuscateLua(src, { xorKey: opts.xorKey || null });
      } else {
        throw new Error('Unsupported language: ' + lang);
      }
    } catch (err) {
      console.error('Obfuscation failed:', err);
      process.exit(3);
    }

    if (opts.out) {
      fs.writeFileSync(path.resolve(process.cwd(), opts.out), out, 'utf8');
      console.log('Wrote', opts.out);
    } else {
      process.stdout.write(out);
    }
  });

program.parse(process.argv);
