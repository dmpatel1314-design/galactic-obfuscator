const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generator = require('@babel/generator').default;
const t = require('@babel/types');

/**
 * Simple name generator (base54-like)
 */
function makeName(i) {
  const alpha = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const digits = '0123456789';
  const chars = alpha + digits;
  let n = i;
  let s = '';
  do {
    s = chars[n % chars.length] + s;
    n = Math.floor(n / chars.length) - 1;
  } while (n >= 0);
  // prefix ensures not starting with digit and avoids collisions with common names
  return '_$' + s;
}

function shouldSkipBinding(name) {
  // skip globals and commonly used runtime names
  const reserved = new Set([
    'console', 'process', 'require', 'module', 'exports', '__dirname', '__filename',
    'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'window', 'global',
    'document', 'JSON', 'Math', 'Number', 'String', 'Object', 'Array', 'Boolean',
    'Map', 'Set', 'WeakMap', 'WeakSet', 'Promise', 'Symbol'
  ]);
  return reserved.has(name) || name.startsWith('_$'); // do not rename internal markers
}

/**
 * encode a JS string into base64 for safe embedding
 */
function encodeStringToBase64(s) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(s, 'utf8').toString('base64');
  }
  // fallback for extraordinary cases (not expected when running in Node)
  if (typeof btoa !== 'undefined') {
    return btoa(unescape(encodeURIComponent(s)));
  }
  return s;
}

/**
 * obfuscateJS(src, opts)
 * opts: { rename: boolean, encodeStrings: boolean }
 */
function obfuscateJS(src, opts = { rename: true, encodeStrings: true }) {
  const ast = parser.parse(src, {
    sourceType: 'unambiguous',
    plugins: ['jsx', 'classProperties', 'optionalChaining', 'nullishCoalescingOperator']
  });

  // global counters & maps
  let counter = 0;

  // Add a placeholder for adding decoder helper later if we need string encoding
  let needDecoder = false;

  // First pass: rename local bindings per scope
  if (opts.rename) {
    traverse(ast, {
      Scopable(path) {
        const scope = path.scope;
        // iterate a snapshot of binding names to avoid mutation during iteration
        const bindNames = Object.keys(scope.bindings || {});
        for (const name of bindNames) {
          try {
            if (shouldSkipBinding(name)) continue;
            const binding = scope.bindings[name];
            // skip globals, exported bindings or module-level exported names (conservative)
            if (!binding || !binding.identifier) continue;
            // do not rename identifiers that are referenced by eval-like patterns (conservative skip)
            if (binding.constantViolations && binding.constantViolations.length > 0) {
              // allow but still rename; leaving conservative to avoid edge cases
            }
            const newName = makeName(counter++);
            // use Babel's scope.rename which updates references correctly
            scope.rename(name, newName);
          } catch (e) {
            // renaming might fail in complex cases; ignore and continue
          }
        }
      }
    });
  }

  // Second pass: encode string literals as calls to __decode("base64")
  if (opts.encodeStrings) {
    traverse(ast, {
      StringLiteral(path) {
        const parent = path.parent;
        // skip object property keys (when not computed) because they change runtime property names
        if (t.isObjectProperty(parent) && parent.key === path.node && !parent.computed) return;
        // skip import/export/source and require() argument
        if (t.isImportDeclaration(parent) || t.isExportNamedDeclaration(parent) || t.isExportAllDeclaration(parent)) return;
        if (t.isCallExpression(parent) && parent.callee && parent.callee.name === 'require' && parent.arguments[0] === path.node) return;
        // skip directive prologue strings like "use strict"
        if (path.parentPath.isExpressionStatement() && path.parentPath.parent && path.parentPath.parent.directives) return;
        // skip template literal raw placeholders and other risky contexts
        // replace with __decode("base64") call
        const original = path.node.value;
        const b64 = encodeStringToBase64(original);
        needDecoder = true;
        const call = t.callExpression(t.identifier('__decode'), [t.stringLiteral(b64)]);
        path.replaceWith(call);
        path.skip();
      }
    });
  }

  // If decoder is needed, inject helper at top of program
  if (needDecoder) {
    const helperSrc = `
function __decode(s){
  try {
    if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
      return Buffer.from(s,'base64').toString('utf8');
    }
    if (typeof atob === 'function') {
      // browser atob -> binary string. Convert to utf8 safely:
      var binary = atob(s);
      try {
        return decodeURIComponent(escape(binary));
      } catch(e) {
        return binary;
      }
    }
  } catch(e) {}
  return s;
}
`;
    const helperAst = parser.parse(helperSrc, { sourceType: 'script' });
    ast.program.body.unshift(...helperAst.program.body);
  }

  // Generate code
  const out = generator(ast, { compact: true, minified: true }).code;
  return out;
}

module.exports = { obfuscateJS };
